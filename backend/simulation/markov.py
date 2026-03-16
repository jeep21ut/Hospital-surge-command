"""
Markov Chain Patient Deterioration Model
========================================
Implements a discrete-time Markov chain for patient health state transitions.

States
------
  0 STABLE   – Comfortable; can safely wait hours to days
  1 SERIOUS  – Needs definitive care within 6 h; risk of decline if neglected
  2 CRITICAL – Needs DCS within 2 h; rapid deterioration without OR
  3 TERMINAL – Expectant; palliative focus; high short-term mortality
  4 DEAD      – Absorbing state
  5 RTD       – Returned to Duty; absorbing state (treatment success)

Transition matrices are per *simulation-hour*.  Two matrices are provided:
  • WAITING_MATRIX  – no treatment available (queue / holding)
  • TREATMENT_MATRIX – receiving appropriate care (in bed / post-OR)

A Prolonged Casualty Care (PCC) modifier scales the WAITING matrix to model
accelerated deterioration for patients who spent time in the field before
reaching MAMC.
"""

from __future__ import annotations
import numpy as np
from .models import HealthState, PatientType

# Indices alias for readability
S, W, C, T, D, R = (
    HealthState.STABLE,
    HealthState.SERIOUS,
    HealthState.CRITICAL,
    HealthState.TERMINAL,
    HealthState.DEAD,
    HealthState.RTD,
)

N_STATES = 6


# ─── Transition matrices (rows = current state, cols = next state) ─────────────

# When WAITING in queue — no treatment received
_WAITING_BASE = np.array([
    #  S      W      C      T      D      RTD
    [0.800, 0.140, 0.045, 0.010, 0.005, 0.000],  # STABLE
    [0.000, 0.720, 0.175, 0.075, 0.030, 0.000],  # SERIOUS
    [0.000, 0.000, 0.630, 0.250, 0.120, 0.000],  # CRITICAL
    [0.000, 0.000, 0.000, 0.520, 0.480, 0.000],  # TERMINAL
    [0.000, 0.000, 0.000, 0.000, 1.000, 0.000],  # DEAD     (absorbing)
    [0.000, 0.000, 0.000, 0.000, 0.000, 1.000],  # RTD      (absorbing)
], dtype=np.float64)

# When RECEIVING appropriate care (bed assigned, post-op recovery)
_TREATMENT_BASE = np.array([
    #  S      W      C      T      D      RTD
    [0.550, 0.040, 0.000, 0.000, 0.000, 0.410],  # STABLE  → high RTD prob
    [0.250, 0.620, 0.080, 0.030, 0.020, 0.000],  # SERIOUS → improving
    [0.050, 0.310, 0.540, 0.060, 0.040, 0.000],  # CRITICAL post-DCS
    [0.000, 0.050, 0.200, 0.620, 0.130, 0.000],  # TERMINAL palliative
    [0.000, 0.000, 0.000, 0.000, 1.000, 0.000],  # DEAD
    [0.000, 0.000, 0.000, 0.000, 0.000, 1.000],  # RTD
], dtype=np.float64)


def _validate_matrix(m: np.ndarray) -> np.ndarray:
    """Ensure rows sum to 1 (floating-point safety)."""
    row_sums = m.sum(axis=1, keepdims=True)
    return m / row_sums


WAITING_MATRIX   = _validate_matrix(_WAITING_BASE)
TREATMENT_MATRIX = _validate_matrix(_TREATMENT_BASE)


def pcc_modified_waiting(pcc_hours: float) -> np.ndarray:
    """
    Return a modified WAITING matrix that reflects the accelerated deterioration
    caused by Prolonged Casualty Care (time spent in field before reaching MAMC).

    The modification linearly scales the off-diagonal deterioration transitions
    by a factor based on PCC delay (capped at 3× for >48 h in field).
    """
    if pcc_hours <= 0:
        return WAITING_MATRIX.copy()

    factor = min(1.0 + pcc_hours / 24.0, 3.0)   # cap at 3×

    modified = WAITING_MATRIX.copy()
    for row in range(N_STATES - 2):   # skip absorbing states
        diag     = modified[row, row]
        off_diag = 1.0 - diag
        if off_diag > 0:
            new_off = min(off_diag * factor, 0.95)
            scale   = new_off / off_diag
            modified[row] *= scale
            modified[row, row] = 1.0 - new_off
    return _validate_matrix(modified)


# ─── Initial state by patient type ────────────────────────────────────────────

INITIAL_STATE: dict[PatientType, HealthState] = {
    PatientType.BI_T1:       HealthState.CRITICAL,
    PatientType.BI_T2:       HealthState.SERIOUS,
    PatientType.BI_T3:       HealthState.STABLE,
    PatientType.BI_T4:       HealthState.TERMINAL,
    PatientType.DNBI_DISEASE: HealthState.SERIOUS,
    PatientType.DNBI_COSR:   HealthState.STABLE,
    PatientType.DNBI_NBI:    HealthState.STABLE,
}


# ─── MarkovPatient class ──────────────────────────────────────────────────────

class MarkovPatient:
    """Tracks the health state of a single patient through the simulation."""

    __slots__ = (
        "patient_id", "patient_type", "state",
        "arrival_time", "in_treatment", "hours_waiting",
        "is_preventable_death", "_rng",
    )

    def __init__(
        self,
        patient_id: int,
        patient_type: PatientType,
        arrival_time: float,
        pcc_hours: float = 0.0,
        rng: np.random.Generator | None = None,
    ):
        self.patient_id   = patient_id
        self.patient_type = patient_type
        self.state        = INITIAL_STATE[patient_type]
        self.arrival_time = arrival_time
        self.in_treatment = False
        self.hours_waiting = 0.0
        self.is_preventable_death = False
        self._rng = rng or np.random.default_rng()

        # Apply PCC degradation only to Battle Injury patients (not DNBI).
        # DNBI/COSR patients experience delayed care but not the same rapid
        # physiological deterioration as combat casualties in the field.
        bi_types = (PatientType.BI_T1, PatientType.BI_T2,
                    PatientType.BI_T3, PatientType.BI_T4)
        if pcc_hours > 0 and patient_type in bi_types:
            waiting_m = pcc_modified_waiting(pcc_hours)
            steps = max(1, int(pcc_hours))
            for _ in range(steps):
                if self.state in (HealthState.DEAD, HealthState.RTD):
                    break
                probs = waiting_m[self.state]
                self.state = HealthState(self._rng.choice(N_STATES, p=probs))

    def step(self, hours: float = 1.0, waiting_matrix: np.ndarray | None = None) -> None:
        """
        Advance patient health state by `hours` simulation hours.
        Uses WAITING_MATRIX if not in treatment, TREATMENT_MATRIX otherwise.
        """
        if self.state in (HealthState.DEAD, HealthState.RTD):
            return

        matrix = TREATMENT_MATRIX if self.in_treatment else (
            waiting_matrix if waiting_matrix is not None else WAITING_MATRIX
        )

        if not self.in_treatment:
            self.hours_waiting += hours

        # For fractional hours, interpolate toward identity
        if hours != 1.0:
            identity = np.eye(N_STATES)
            effective = identity + hours * (matrix - identity)
            row = np.clip(effective[self.state], 0, 1)
            row /= row.sum()
        else:
            row = matrix[self.state]

        new_state = HealthState(self._rng.choice(N_STATES, p=row))

        # Mark as preventable death if patient dies while waiting
        if new_state == HealthState.DEAD and not self.in_treatment:
            self.is_preventable_death = True

        self.state = new_state

    @property
    def is_alive(self) -> bool:
        return self.state != HealthState.DEAD

    @property
    def needs_immediate_care(self) -> bool:
        return self.state == HealthState.CRITICAL

    @property
    def priority(self) -> int:
        """Lower number = higher priority for resource allocation."""
        priority_map = {
            HealthState.CRITICAL: 1,
            HealthState.TERMINAL: 2,
            HealthState.SERIOUS:  3,
            HealthState.STABLE:   4,
            HealthState.RTD:      5,
            HealthState.DEAD:     6,
        }
        return priority_map[self.state]


# ─── Population-level Markov statistics ───────────────────────────────────────

def population_state_distribution(
    patients: list[MarkovPatient],
) -> dict[str, int]:
    """Return count of patients in each health state."""
    counts = {s.name.lower(): 0 for s in HealthState}
    for p in patients:
        counts[p.state.name.lower()] += 1
    return counts

"""
MAMC Surge Simulator — Discrete-Event Simulation Engine
========================================================
Uses SimPy for event-driven simulation.  All time units are HOURS.

Key sub-systems modelled
------------------------
1.  Patient arrival generator  – baseline Poisson + MASCAL pulse
2.  Triage & bed assignment     – priority queues with preemption
3.  OR pipeline                 – DCS vs Definitive Care, staff exhaustion
4.  Markov deterioration        – per-patient health state machine
5.  Supply chain                – blood, surgical sets, vents, O₂
6.  Staff exhaustion            – efficiency decay + AR-MEDCOM augmentees
7.  Evacuation / back-door      – NDMS/VA offload; gridlock detection
8.  Civilian displacement       – time-delayed bed release

Results
-------
Returns a SimResults object with an hourly HourlySnapshot time-series and
a summary roll-up.
"""

from __future__ import annotations

import uuid
import math
import numpy as np
import simpy
from collections import defaultdict, deque
from typing import Optional

from .constants import (
    MAMC_ICU_BASELINE, MAMC_ICU_SURGE,
    MAMC_WARD_BASELINE, MAMC_WARD_SURGE,
    MAMC_BH_BASELINE, MAMC_BH_SURGE,
    MAMC_OR_ROOMS, MAMC_OR_SURGE_ROOMS,
    OR_TURNOVER_BASE_HOURS, DCS_PROCEDURE_HOURS, DEFINITIVE_CARE_HOURS,
    INITIAL_PACKED_RBC_UNITS, RBC_SHELF_LIFE_DAYS, WALKING_BLOOD_BANK_THRESHOLD,
    SURGICAL_SETS_DOS_BASELINE, VENTILATORS_AVAILABLE,
    O2_CONCENTRATORS, O2_CYLINDERS_DOS,
    BLOOD_USE_T1, BLOOD_USE_T2, BLOOD_USE_T3, BLOOD_USE_DNBI,
    RESUPPLY_RATE_NORMAL, SURG_SET_PER_DCS, SURG_SET_PER_DEF,
    ACTIVE_DUTY_STAFF, SURGICAL_TEAMS, EXHAUSTION_RATE_PER_HOUR, MIN_EFFICIENCY,
    CIVILIAN_PATIENTS_BASELINE,
    PNW_CIVILIAN_SLACK_BEDS, VA_SLACK_BEDS,
    BI_FRACTION, DNBI_FRACTION,
    BI_T1_FRAC, BI_T2_FRAC, BI_T3_FRAC, BI_T4_FRAC,
    DNBI_DISEASE_FRAC, DNBI_COSR_FRAC, DNBI_NBI_FRAC,
    TREAT_T1_ICU_HOURS, TREAT_T1_WARD_HOURS, TREAT_T2_WARD_HOURS,
    TREAT_T3_HOURS, TREAT_BH_HOURS, TREAT_DNBI_HOURS,
    SNAPSHOT_INTERVAL_HOURS,
    NDMS_ACTIVATION_DELAY_H,
)
from .models import (
    SimParams, SimResults, SimSummary,
    HourlySnapshot, BedStatus, PatientCounts, ORStatus,
    LogisticsStatus, StaffStatus, EvacuationStatus,
    MarkovDistribution, Alert, PatientType, HealthState,
)
from .markov import MarkovPatient, pcc_modified_waiting, population_state_distribution


# ──────────────────────────────────────────────────────────────────────────────
#  Internal state container
# ──────────────────────────────────────────────────────────────────────────────

class SimState:
    """Mutable global state passed between SimPy processes."""

    def __init__(self, params: SimParams, rng: np.random.Generator):
        self.params = params
        self.rng    = rng

        # ── Bed resources ────────────────────────────────────────────────────
        self.icu_cap  = MAMC_ICU_SURGE  if True else MAMC_ICU_BASELINE
        self.ward_cap = MAMC_WARD_SURGE
        self.bh_cap   = MAMC_BH_SURGE

        # ── OR resources ─────────────────────────────────────────────────────
        self.or_cap = MAMC_OR_SURGE_ROOMS if params.or_surge_activated else MAMC_OR_ROOMS

        # ── Patient registry ─────────────────────────────────────────────────
        self.all_patients:      list[MarkovPatient] = []
        self.waiting_patients:  list[MarkovPatient] = []   # waiting for bed
        self.in_treatment:      list[MarkovPatient] = []
        self.or_queue:          list[MarkovPatient] = []
        self.patient_id_counter = 0

        # ── Counters ─────────────────────────────────────────────────────────
        self.total_arrivals     = 0
        self.cumulative_rtd     = 0
        self.cumulative_deaths  = 0
        self.preventable_deaths = 0
        self.cumulative_treated = 0
        self.patients_evacuated = 0
        self.dcs_completed      = 0
        self.definitive_completed = 0
        self.or_wait_times:     list[float] = []

        # ── Current occupancy ────────────────────────────────────────────────
        self.icu_occupied   = 0
        self.ward_occupied  = 0
        self.bh_occupied    = 0
        self.holding_overflow = 0

        # ── OR tracking ─────────────────────────────────────────────────────
        self.or_active = 0

        # ── Logistics ────────────────────────────────────────────────────────
        self.packed_rbc          = float(INITIAL_PACKED_RBC_UNITS)
        self.surgical_sets       = float(SURGICAL_SETS_DOS_BASELINE * 5)  # ~5 sets/day budget
        self.ventilators_in_use  = 0
        self.o2_mode             = "CONCENTRATOR"
        self.walking_blood_bank  = False
        self.resupply_contested  = params.supply_disruption_fraction > 0.3

        # RBC inventory tracking (date of manufacture buckets)
        # Each entry: [days_old, units]
        self.rbc_inventory: deque = deque()
        # Pre-load with random ages 0–42 days
        avg_age = 21
        self.rbc_inventory.append([avg_age, INITIAL_PACKED_RBC_UNITS])

        # ── Staff ─────────────────────────────────────────────────────────────
        self.staff_present       = ACTIVE_DUTY_STAFF
        self.augmentees_present  = 0
        self.surge_hours         = 0.0     # hours since MASCAL pulse start
        self.or_efficiency       = 1.0
        self.augmentees_arrived  = False
        self.ar_medcom_arrival_hour = params.ar_medcom_delay_days * 24.0

        # ── Evacuation / back-door ────────────────────────────────────────────
        self.ndms_activated      = False
        self.gridlock_active     = False
        self.gridlock_hours      = 0.0
        self.intake_multiplier   = 1.0
        self.blood_crisis_hours  = 0.0

        # ── Civilian displacement ─────────────────────────────────────────────
        self.civilian_beds_freed = 0
        self.displacement_complete = False
        self.displacement_complete_hour = params.civilian_displacement_days * 24.0
        self.civilian_beds_at_start = CIVILIAN_PATIENTS_BASELINE

        # ── Snapshots ────────────────────────────────────────────────────────
        self.snapshots: list[HourlySnapshot] = []

        # ── PCC waiting matrix (cached) ───────────────────────────────────────
        self.waiting_matrix = pcc_modified_waiting(params.pcc_delay_hours)

        # Track when MASCAL started (for surge_hours calc)
        self.mascal_started_at: Optional[float] = None

    # ── Derived properties ────────────────────────────────────────────────────

    @property
    def ndms_capacity(self) -> int:
        if not self.ndms_activated:
            return 0
        base = int(PNW_CIVILIAN_SLACK_BEDS * self.params.ndms_capacity_fraction)
        return base

    @property
    def va_capacity(self) -> int:
        return int(VA_SLACK_BEDS * max(0.0, 1.0 - self.params.supply_disruption_fraction * 0.3))

    @property
    def total_beds_available(self) -> int:
        return (self.icu_cap - self.icu_occupied
                + self.ward_cap - self.ward_occupied
                + self.bh_cap - self.bh_occupied)

    @property
    def total_beds_capacity(self) -> int:
        return self.icu_cap + self.ward_cap + self.bh_cap


# ──────────────────────────────────────────────────────────────────────────────
#  Helper: alert generator
# ──────────────────────────────────────────────────────────────────────────────

def build_alerts(state: SimState) -> list[Alert]:
    alerts: list[Alert] = []

    if state.gridlock_active:
        alerts.append(Alert(level="CRITICAL", code="GRIDLOCK",
            message="BACK-DOOR GRIDLOCK: NDMS/VA offload capacity exceeded. "
                    "Intake reduced."))

    if state.walking_blood_bank:
        alerts.append(Alert(level="CRITICAL", code="WBB_ACTIVE",
            message=f"WALKING BLOOD BANK PROTOCOL ACTIVE – "
                    f"Strategic resupply disrupted. "
                    f"RBC stock: {int(state.packed_rbc)} units."))

    occupancy = (state.icu_occupied + state.ward_occupied + state.bh_occupied
                 ) / max(1, state.total_beds_capacity)
    if occupancy > 0.95:
        alerts.append(Alert(level="CRITICAL", code="BED_SATURATION",
            message=f"HOSPITAL AT {occupancy*100:.0f}% CAPACITY – "
                    "Divert all non-critical intake."))
    elif occupancy > 0.85:
        alerts.append(Alert(level="WARNING", code="BED_WARNING",
            message=f"Bed occupancy at {occupancy*100:.0f}%. Surge protocols engaged."))

    if state.or_active >= state.or_cap and len(state.or_queue) > 5:
        alerts.append(Alert(level="WARNING", code="OR_QUEUE_DEPTH",
            message=f"OR queue depth: {len(state.or_queue)} patients waiting. "
                    f"Consider Damage Control Surgery only protocol."))

    if state.or_efficiency < 0.60:
        alerts.append(Alert(level="WARNING", code="STAFF_EXHAUSTION",
            message=f"Staff efficiency at {state.or_efficiency*100:.0f}%. "
                    "AR-MEDCOM augmentees required urgently."))

    if state.packed_rbc < 100:
        alerts.append(Alert(level="WARNING", code="BLOOD_LOW",
            message=f"Packed RBC stock below 100 units ({int(state.packed_rbc)}). "
                    "Request emergency ASBP resupply."))

    if state.o2_mode == "CRITICAL":
        alerts.append(Alert(level="CRITICAL", code="O2_CRITICAL",
            message="O₂ supply CRITICAL – concentrators and cylinders depleted."))

    if not state.augmentees_arrived:
        h_remain = state.ar_medcom_arrival_hour
        if h_remain <= 24:
            alerts.append(Alert(level="INFO", code="AUGMENTEE_ETA",
                message=f"AR-MEDCOM augmentees ETA: {h_remain:.0f} hours."))

    return alerts


# ──────────────────────────────────────────────────────────────────────────────
#  SimPy processes
# ──────────────────────────────────────────────────────────────────────────────

def patient_generator(env: simpy.Environment, state: SimState):
    """
    Generates patients via:
      • Baseline Poisson process (λ = baseline_daily / 24 per hour)
      • Single MASCAL pulse (exponential arrival decay)
    """
    params = state.params
    baseline_rate = params.baseline_daily_arrivals / 24.0   # per hour

    # Schedule MASCAL pulse end time
    mascal_end = params.mascal_pulse_timing_hours + params.mascal_pulse_spread_hours

    while env.now < params.sim_duration_hours:
        # ── Inter-arrival time (baseline) ───────────────────────────────────
        if baseline_rate > 0:
            iat = state.rng.exponential(1.0 / baseline_rate)
        else:
            iat = 9999.0

        # ── MASCAL pulse contribution ────────────────────────────────────────
        t = env.now
        mascal_hourly = 0.0
        if (params.mascal_pulse_timing_hours <= t <= mascal_end
                and params.mascal_pulse_size > 0):
            # Distribute pulse_size over spread window; exponential peak at start
            k = 3.0 / params.mascal_pulse_spread_hours   # decay constant
            raw_rate = (params.mascal_pulse_size * k
                        * math.exp(-k * (t - params.mascal_pulse_timing_hours)))
            mascal_hourly = raw_rate * state.intake_multiplier

        total_rate = (baseline_rate + mascal_hourly) * state.intake_multiplier

        if total_rate <= 0:
            yield env.timeout(1.0)
            continue

        # ── Track surge start ───────────────────────────────────────────────
        if (state.mascal_started_at is None
                and t >= params.mascal_pulse_timing_hours
                and mascal_hourly > 0):
            state.mascal_started_at = t

        # Sample number of arrivals this hour (Poisson)
        n_arrivals = state.rng.poisson(total_rate * min(iat, 1.0))

        for _ in range(n_arrivals):
            if env.now >= params.sim_duration_hours:
                return
            patient = _create_patient(env.now, state)
            state.total_arrivals += 1
            state.all_patients.append(patient)
            env.process(patient_pathway(env, patient, state))

        yield env.timeout(min(iat, 1.0))


def _create_patient(arrival_time: float, state: SimState) -> MarkovPatient:
    """Sample patient type and create a MarkovPatient."""
    state.patient_id_counter += 1
    pid = state.patient_id_counter
    p   = state.params
    rng = state.rng

    is_bi = rng.random() < p.bi_fraction

    if is_bi:
        r = rng.random()
        if r < BI_T1_FRAC:
            ptype = PatientType.BI_T1
        elif r < BI_T1_FRAC + BI_T2_FRAC:
            ptype = PatientType.BI_T2
        elif r < BI_T1_FRAC + BI_T2_FRAC + BI_T3_FRAC:
            ptype = PatientType.BI_T3
        else:
            ptype = PatientType.BI_T4
    else:
        r = rng.random()
        if r < DNBI_DISEASE_FRAC:
            ptype = PatientType.DNBI_DISEASE
        elif r < DNBI_DISEASE_FRAC + DNBI_COSR_FRAC:
            ptype = PatientType.DNBI_COSR
        else:
            ptype = PatientType.DNBI_NBI

    return MarkovPatient(
        patient_id=pid,
        patient_type=ptype,
        arrival_time=arrival_time,
        pcc_hours=p.pcc_delay_hours,
        rng=rng,
    )


def patient_pathway(env: simpy.Environment, patient: MarkovPatient,
                    state: SimState):
    """
    Complete care pathway for a single patient:
      triage → bed assignment → (OR if needed) → treatment → discharge
    """
    params = state.params

    # ── Immediate triage ─────────────────────────────────────────────────────
    pt = patient.patient_type

    # Dead on arrival (PCC-related death in the field)
    if patient.state == HealthState.DEAD:
        state.cumulative_deaths += 1
        state.preventable_deaths += 1
        return

    # T4 / Expectant: palliative only, no OR, minimal resources
    if pt == PatientType.BI_T4:
        yield env.timeout(0.25)    # brief assessment
        # Expectant — comfort care in holding
        state.holding_overflow += 1
        hold_time = state.rng.exponential(12.0)   # average 12h before outcome
        yield env.timeout(hold_time)
        patient.in_treatment = True
        patient.state = (HealthState.DEAD
                         if state.rng.random() < 0.85
                         else HealthState.RTD)
        if patient.state == HealthState.DEAD:
            state.cumulative_deaths += 1
        else:
            state.cumulative_rtd += 1
        state.holding_overflow = max(0, state.holding_overflow - 1)
        return

    # ── Wait for appropriate bed ──────────────────────────────────────────────
    state.waiting_patients.append(patient)
    bed_wait_start = env.now

    # Apply Markov deterioration while waiting (1-hour ticks)
    waiting_done = env.event()
    assigned_bed = [None]   # closure variable: bed_waiter writes, outer reads

    def bed_waiter():
        while True:
            if patient.state in (HealthState.DEAD, HealthState.RTD):
                waiting_done.succeed()
                return
            slot = _try_assign_bed(patient, state)
            if slot:
                assigned_bed[0] = slot   # store assignment; do NOT call again
                waiting_done.succeed()
                return
            yield env.timeout(SNAPSHOT_INTERVAL_HOURS)
            patient.step(1.0, state.waiting_matrix)
            if patient.state == HealthState.DEAD:
                state.cumulative_deaths += 1
                state.preventable_deaths += 1
                waiting_done.succeed()
                return

    env.process(bed_waiter())
    yield waiting_done

    if patient.state in (HealthState.DEAD, HealthState.RTD):
        _release_waiting(patient, state)
        if patient.state == HealthState.RTD:
            state.cumulative_rtd += 1
        return

    _release_waiting(patient, state)
    bed_type = assigned_bed[0]   # use already-assigned bed, no second call

    # ── OR pathway for surgical patients ─────────────────────────────────────
    needs_or = pt in (PatientType.BI_T1, PatientType.BI_T2)
    if needs_or and patient.state not in (HealthState.DEAD, HealthState.RTD):
        or_wait_start = env.now
        state.or_queue.append(patient)

        or_done = env.event()

        def or_waiter():
            while True:
                if patient.state in (HealthState.DEAD, HealthState.RTD):
                    or_done.succeed()
                    return
                if state.or_active < state.or_cap:
                    or_done.succeed()
                    return
                yield env.timeout(0.5)
                patient.step(0.5, state.waiting_matrix)
                if patient.state == HealthState.DEAD:
                    state.cumulative_deaths += 1
                    state.preventable_deaths += 1
                    or_done.succeed()
                    return

        env.process(or_waiter())
        yield or_done

        if patient.state not in (HealthState.DEAD, HealthState.RTD):
            _remove_from_or_queue(patient, state)
            state.or_active += 1
            patient.in_treatment = True

            wait_h = env.now - or_wait_start
            state.or_wait_times.append(wait_h)

            # Determine procedure type
            is_dcs = (patient.state in (HealthState.CRITICAL, HealthState.SERIOUS)
                      and pt == PatientType.BI_T1)
            proc_duration = (DCS_PROCEDURE_HOURS if is_dcs
                             else DEFINITIVE_CARE_HOURS) / state.or_efficiency
            turnover      = OR_TURNOVER_BASE_HOURS / state.or_efficiency

            # Blood consumption
            _consume_blood(BLOOD_USE_T1 if pt == PatientType.BI_T1
                           else BLOOD_USE_T2, state)
            _consume_surgical_set(SURG_SET_PER_DCS if is_dcs
                                  else SURG_SET_PER_DEF, state)

            yield env.timeout(proc_duration + turnover)
            state.or_active = max(0, state.or_active - 1)

            if is_dcs:
                state.dcs_completed += 1
            else:
                state.definitive_completed += 1

            if state.rng.random() < 0.08:
                patient.state = HealthState.DEAD
                state.cumulative_deaths += 1
                _release_bed(bed_type, state)
                return
        else:
            _remove_from_or_queue(patient, state)
            if patient.state == HealthState.DEAD:
                pass  # already counted
            _release_bed(bed_type, state)
            return

    # ── Treatment / recovery ─────────────────────────────────────────────────
    patient.in_treatment = True
    treat_hours = _treatment_hours(pt, state)

    # Step Markov chain in treatment
    steps = int(treat_hours)
    remainder = treat_hours - steps
    for _ in range(steps):
        if patient.state in (HealthState.DEAD, HealthState.RTD):
            break
        patient.step(1.0)

    if remainder > 0 and patient.state not in (HealthState.DEAD, HealthState.RTD):
        patient.step(remainder)

    yield env.timeout(treat_hours)

    # ── Outcome ──────────────────────────────────────────────────────────────
    if patient.state == HealthState.DEAD:
        state.cumulative_deaths += 1
    elif patient.state == HealthState.RTD:
        state.cumulative_rtd += 1
    else:
        # Patient is stable or recovering → discharge to NDMS/VA/home
        if _can_evacuate(state):
            state.patients_evacuated += 1
            state.cumulative_rtd += 1
            patient.state = HealthState.RTD
        else:
            # Gridlock — patient occupies bed
            pass

    state.cumulative_treated += 1
    _release_bed(bed_type, state)

    # Vent/O2 release
    if bed_type == "icu":
        state.ventilators_in_use = max(0, state.ventilators_in_use - 1)


# ──────────────────────────────────────────────────────────────────────────────
#  Bed management helpers
# ──────────────────────────────────────────────────────────────────────────────

def _try_assign_bed(patient: MarkovPatient, state: SimState) -> Optional[str]:
    """Attempt to assign a bed based on patient type/state. Returns bed type or None."""
    pt = patient.patient_type
    ps = patient.state

    if ps in (HealthState.DEAD, HealthState.RTD):
        return None

    # COSR → BH
    if pt == PatientType.DNBI_COSR:
        if state.bh_occupied < state.bh_cap:
            state.bh_occupied += 1
            return "bh"
        # Overflow to ward if no BH
        if state.ward_occupied < state.ward_cap:
            state.ward_occupied += 1
            return "ward"
        return None

    # Critical / T1 → ICU
    if ps == HealthState.CRITICAL or pt == PatientType.BI_T1:
        if state.icu_occupied < state.icu_cap:
            state.icu_occupied += 1
            state.ventilators_in_use = min(
                state.ventilators_in_use + 1, VENTILATORS_AVAILABLE)
            return "icu"
        # Overflow to ward (sub-optimal but prevents death)
        if state.ward_occupied < state.ward_cap:
            state.ward_occupied += 1
            return "ward"
        return None

    # Ward patients
    if state.ward_occupied < state.ward_cap:
        state.ward_occupied += 1
        return "ward"

    # Last resort: ICU overflow
    if state.icu_occupied < state.icu_cap:
        state.icu_occupied += 1
        return "icu"

    return None   # no bed available


def _release_bed(bed_type: Optional[str], state: SimState):
    if bed_type == "icu":
        state.icu_occupied = max(0, state.icu_occupied - 1)
    elif bed_type == "ward":
        state.ward_occupied = max(0, state.ward_occupied - 1)
    elif bed_type == "bh":
        state.bh_occupied = max(0, state.bh_occupied - 1)


def _release_waiting(patient: MarkovPatient, state: SimState):
    try:
        state.waiting_patients.remove(patient)
    except ValueError:
        pass


def _remove_from_or_queue(patient: MarkovPatient, state: SimState):
    try:
        state.or_queue.remove(patient)
    except ValueError:
        pass


def _treatment_hours(pt: PatientType, state: SimState) -> float:
    """Return expected treatment duration for patient type (with jitter)."""
    rng = state.rng
    base = {
        PatientType.BI_T1:       TREAT_T1_ICU_HOURS + TREAT_T1_WARD_HOURS,
        PatientType.BI_T2:       TREAT_T2_WARD_HOURS,
        PatientType.BI_T3:       TREAT_T3_HOURS,
        PatientType.DNBI_DISEASE: TREAT_DNBI_HOURS,
        PatientType.DNBI_COSR:   TREAT_BH_HOURS,
        PatientType.DNBI_NBI:    TREAT_T3_HOURS,
    }.get(pt, TREAT_T3_HOURS)
    # Gamma distribution: shape=2, mean=base
    return float(rng.gamma(2.0, base / 2.0))


# ──────────────────────────────────────────────────────────────────────────────
#  Logistics helpers
# ──────────────────────────────────────────────────────────────────────────────

def _consume_blood(units: float, state: SimState):
    state.packed_rbc = max(0.0, state.packed_rbc - units)


def _consume_surgical_set(sets: float, state: SimState):
    state.surgical_sets = max(0.0, state.surgical_sets - sets)


# ──────────────────────────────────────────────────────────────────────────────
#  Evacuation helper
# ──────────────────────────────────────────────────────────────────────────────

def _can_evacuate(state: SimState) -> bool:
    return (state.ndms_capacity > 0 or state.va_capacity > 0) and not state.gridlock_active


# ──────────────────────────────────────────────────────────────────────────────
#  Background monitoring processes
# ──────────────────────────────────────────────────────────────────────────────

def supply_monitor(env: simpy.Environment, state: SimState):
    """
    Hourly supply chain tick:
      • RBC resupply (disrupted by A2/AD)
      • Blood shelf-life expiry (42-day FIFO)
      • Walking Blood Bank trigger
      • O₂ mode management
      • Surgical set resupply
    """
    while env.now < state.params.sim_duration_hours:
        yield env.timeout(1.0)

        disruption = state.params.supply_disruption_fraction

        # ── RBC resupply (hourly fraction of weekly rate) ─────────────────────
        effective_resupply = RESUPPLY_RATE_NORMAL * (1.0 - disruption) / 168.0
        state.packed_rbc += effective_resupply

        # ── Shelf-life expiry (FIFO 42-day buckets) ───────────────────────────
        # Advance age of all buckets by 1 hour
        new_inv = deque()
        for entry in state.rbc_inventory:
            age_h, units = entry
            age_h += 1.0
            if age_h < RBC_SHELF_LIFE_DAYS * 24:
                new_inv.append([age_h, units])
            # else expired — discard silently (trigger alert above)
        state.rbc_inventory = new_inv

        # ── Walking Blood Bank trigger ────────────────────────────────────────
        resupply_disrupted = disruption > 0.5
        state.walking_blood_bank = (
            resupply_disrupted and state.packed_rbc < WALKING_BLOOD_BANK_THRESHOLD
        )
        if state.walking_blood_bank:
            state.blood_crisis_hours += 1.0

        # ── Surgical set resupply ─────────────────────────────────────────────
        surg_resupply = 2.0 * (1.0 - disruption * 0.8)  # sets/hour
        state.surgical_sets = min(state.surgical_sets + surg_resupply,
                                  SURGICAL_SETS_DOS_BASELINE * 10)

        # ── O₂ mode ───────────────────────────────────────────────────────────
        icu_pts = state.icu_occupied
        if icu_pts <= O2_CONCENTRATORS:
            state.o2_mode = "CONCENTRATOR"
        elif icu_pts <= O2_CONCENTRATORS + (O2_CYLINDERS_DOS * 24 * 4):
            # 4 cylinders/day assumption
            state.o2_mode = "CYLINDER"
        else:
            state.o2_mode = "CRITICAL"


def staff_manager(env: simpy.Environment, state: SimState):
    """
    Hourly staff exhaustion tick.
    Efficiency decreases during surge; augmentees restore partial capacity.
    """
    while env.now < state.params.sim_duration_hours:
        yield env.timeout(1.0)

        if state.mascal_started_at is not None:
            state.surge_hours = env.now - state.mascal_started_at

        # Exhaustion applies once surge begins
        if state.surge_hours > 0:
            decay = EXHAUSTION_RATE_PER_HOUR * state.surge_hours
            base_eff = max(MIN_EFFICIENCY, 1.0 - decay)
        else:
            base_eff = 1.0

        # Augmentees restore efficiency toward ~0.80
        if state.augmentees_arrived:
            base_eff = min(base_eff + 0.15, 0.85)

        state.or_efficiency = base_eff


def augmentee_integration(env: simpy.Environment, state: SimState):
    """Time-delayed AR-MEDCOM augmentee arrival."""
    delay = state.params.ar_medcom_delay_days * 24.0
    yield env.timeout(delay)
    state.augmentees_arrived = True
    state.augmentees_present = int(ACTIVE_DUTY_STAFF * 0.40)  # 40% augment


def civilian_displacement(env: simpy.Environment, state: SimState):
    """
    Model progressive displacement of civilian patients to PNW network.
    As civilian patients are offloaded, surge bed capacity increases.
    """
    total_hours  = state.params.civilian_displacement_days * 24.0
    pts_per_hour = CIVILIAN_PATIENTS_BASELINE / total_hours

    while (env.now < state.params.sim_duration_hours
           and not state.displacement_complete):
        yield env.timeout(1.0)
        freed = min(pts_per_hour, CIVILIAN_PATIENTS_BASELINE - state.civilian_beds_freed)
        state.civilian_beds_freed = min(
            state.civilian_beds_freed + freed, CIVILIAN_PATIENTS_BASELINE)
        if state.civilian_beds_freed >= CIVILIAN_PATIENTS_BASELINE:
            state.displacement_complete = True
            state.displacement_complete_hour = env.now


def evacuation_manager(env: simpy.Environment, state: SimState):
    """
    Monitor NDMS/VA offload capacity and trigger gridlock when overwhelmed.
    Also activates NDMS after the defined delay.
    """
    ndms_activated = False

    while env.now < state.params.sim_duration_hours:
        yield env.timeout(1.0)

        # NDMS activation (delayed)
        if not ndms_activated and env.now >= NDMS_ACTIVATION_DELAY_H:
            ndms_activated   = True
            state.ndms_activated = True

        # Gridlock condition:
        #   Total occupied > 98% capacity AND evacuation routes saturated
        occupancy_frac = (
            (state.icu_occupied + state.ward_occupied + state.bh_occupied)
            / max(1, state.total_beds_capacity)
        )
        evac_available = state.ndms_capacity + state.va_capacity

        if occupancy_frac > 0.97 and evac_available < 20:
            state.gridlock_active = True
            state.intake_multiplier = 0.10
            state.gridlock_hours += 1.0
        elif occupancy_frac > 0.90 and evac_available < 50:
            state.gridlock_active = False
            state.intake_multiplier = 0.50
        else:
            state.gridlock_active = False
            state.intake_multiplier = 1.0


def snapshot_collector(env: simpy.Environment, state: SimState):
    """Record a complete system snapshot every SNAPSHOT_INTERVAL_HOURS."""
    while env.now < state.params.sim_duration_hours:
        t = env.now

        # ── Bed status ────────────────────────────────────────────────────────
        beds = BedStatus(
            icu_capacity=state.icu_cap,
            icu_occupied=min(state.icu_occupied, state.icu_cap),
            ward_capacity=state.ward_cap,
            ward_occupied=min(state.ward_occupied, state.ward_cap),
            bh_capacity=state.bh_cap,
            bh_occupied=min(state.bh_occupied, state.bh_cap),
            holding_occupied=state.holding_overflow,
        )

        # ── Patient counts ────────────────────────────────────────────────────
        live_patients = [p for p in state.all_patients
                         if p.arrival_time <= t
                         and p.state not in (HealthState.DEAD, HealthState.RTD)]
        t1_active = sum(1 for p in live_patients if p.patient_type == PatientType.BI_T1)
        t2_active = sum(1 for p in live_patients if p.patient_type == PatientType.BI_T2)
        t3_active = sum(1 for p in live_patients if p.patient_type == PatientType.BI_T3)
        t4_active = sum(1 for p in live_patients if p.patient_type == PatientType.BI_T4)
        dnbi_active = sum(1 for p in live_patients
                          if p.patient_type in (PatientType.DNBI_DISEASE,
                                                 PatientType.DNBI_COSR,
                                                 PatientType.DNBI_NBI))

        patients = PatientCounts(
            total_in_system=len(live_patients),
            waiting_for_bed=len(state.waiting_patients),
            waiting_for_or=len(state.or_queue),
            in_treatment=len(state.in_treatment),
            t1_active=t1_active,
            t2_active=t2_active,
            t3_active=t3_active,
            t4_active=t4_active,
            dnbi_active=dnbi_active,
            cumulative_rtd=state.cumulative_rtd,
            cumulative_deaths=state.cumulative_deaths,
            cumulative_treated=state.cumulative_treated,
        )

        # ── OR status ─────────────────────────────────────────────────────────
        avg_or_wait = (float(np.mean(state.or_wait_times))
                       if state.or_wait_times else 0.0)
        or_status = ORStatus(
            or_capacity=state.or_cap,
            procedures_active=state.or_active,
            queue_depth=len(state.or_queue),
            avg_wait_hours=round(avg_or_wait, 2),
            dcs_completed=state.dcs_completed,
            definitive_completed=state.definitive_completed,
            or_efficiency=round(state.or_efficiency, 3),
            or_turnover_hours=round(OR_TURNOVER_BASE_HOURS / max(0.1, state.or_efficiency), 2),
        )

        # ── Logistics ─────────────────────────────────────────────────────────
        rbc = max(0.0, state.packed_rbc)
        daily_rbc_use = max(1.0,
            BLOOD_USE_T1 * t1_active / 24 + BLOOD_USE_T2 * t2_active / 24)
        rbc_dos = rbc / daily_rbc_use if daily_rbc_use > 0 else 99.0

        surg_daily = max(0.1, (state.dcs_completed + state.definitive_completed)
                         / max(1.0, t) * 24)
        surg_dos = state.surgical_sets / surg_daily if surg_daily > 0 else 99.0

        effective_resupply = RESUPPLY_RATE_NORMAL * (
            1.0 - state.params.supply_disruption_fraction)

        logistics = LogisticsStatus(
            packed_rbc_units=int(rbc),
            rbc_days_supply=round(min(rbc_dos, 99.0), 1),
            surgical_sets_remaining=round(state.surgical_sets, 1),
            surgical_sets_dos=round(min(surg_dos, 99.0), 1),
            ventilators_in_use=state.ventilators_in_use,
            ventilators_available=VENTILATORS_AVAILABLE - state.ventilators_in_use,
            o2_mode=state.o2_mode,
            walking_blood_bank_active=state.walking_blood_bank,
            resupply_rate=round(effective_resupply, 1),
        )

        # ── Staff ─────────────────────────────────────────────────────────────
        time_to_aug = max(0.0, state.ar_medcom_arrival_hour - t)
        staff = StaffStatus(
            active_duty_present=state.staff_present,
            augmentees_present=state.augmentees_present,
            avg_exhaustion_pct=round((1.0 - state.or_efficiency) * 100, 1),
            or_efficiency=round(state.or_efficiency, 3),
            time_to_augmentees_h=round(time_to_aug, 1),
        )

        # ── Evacuation ────────────────────────────────────────────────────────
        evac = EvacuationStatus(
            ndms_slots_available=state.ndms_capacity,
            va_slots_available=state.va_capacity,
            gridlock_active=state.gridlock_active,
            intake_multiplier=round(state.intake_multiplier, 2),
            patients_evacuated_cum=state.patients_evacuated,
            civilian_beds_freed=int(state.civilian_beds_freed),
        )

        # ── Markov distribution ────────────────────────────────────────────────
        dist = population_state_distribution(
            [p for p in state.all_patients if p.arrival_time <= t])
        markov = MarkovDistribution(
            stable=dist["stable"],
            serious=dist["serious"],
            critical=dist["critical"],
            terminal=dist["terminal"],
            dead=dist["dead"],
            rtd=dist["rtd"],
        )

        snapshot = HourlySnapshot(
            time_hours=round(t, 2),
            beds=beds,
            patients=patients,
            or_status=or_status,
            logistics=logistics,
            staff=staff,
            evacuation=evac,
            markov=markov,
            alerts=build_alerts(state),
        )
        state.snapshots.append(snapshot)

        yield env.timeout(SNAPSHOT_INTERVAL_HOURS)


# ──────────────────────────────────────────────────────────────────────────────
#  Main entry point
# ──────────────────────────────────────────────────────────────────────────────

def run_simulation(params: SimParams) -> SimResults:
    """
    Execute the MAMC surge simulation and return a complete SimResults object.
    """
    seed = params.random_seed if params.random_seed > 0 else None
    rng  = np.random.default_rng(seed)

    env   = simpy.Environment()
    state = SimState(params, rng)

    # Spawn all background processes
    env.process(patient_generator(env, state))
    env.process(supply_monitor(env, state))
    env.process(staff_manager(env, state))
    env.process(augmentee_integration(env, state))
    env.process(civilian_displacement(env, state))
    env.process(evacuation_manager(env, state))
    env.process(snapshot_collector(env, state))

    # Run to completion
    env.run(until=params.sim_duration_hours)

    # ── Summary ───────────────────────────────────────────────────────────────
    peak_census = max(
        (s.beds.icu_occupied + s.beds.ward_occupied + s.beds.bh_occupied
         for s in state.snapshots),
        default=0
    )
    max_or_queue = max((s.or_status.queue_depth for s in state.snapshots), default=0)

    summary = SimSummary(
        total_arrivals=state.total_arrivals,
        total_deaths=state.cumulative_deaths,
        preventable_deaths=state.preventable_deaths,
        total_rtd=state.cumulative_rtd,
        peak_census=peak_census,
        max_or_queue=max_or_queue,
        gridlock_hours=round(state.gridlock_hours, 1),
        blood_crisis_hours=round(state.blood_crisis_hours, 1),
        lowest_rbc_count=int(min(
            (s.logistics.packed_rbc_units for s in state.snapshots), default=0)),
        ar_medcom_arrival_hour=round(state.ar_medcom_arrival_hour, 1),
        civilian_displacement_complete_hour=round(
            state.displacement_complete_hour, 1),
    )

    return SimResults(
        simulation_id=str(uuid.uuid4()),
        params=params,
        timeline=state.snapshots,
        summary=summary,
    )

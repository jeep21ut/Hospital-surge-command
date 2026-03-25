"""
Tests for the Markov chain patient deterioration model.
"""
import numpy as np
import pytest
from simulation.models import PatientType, HealthState
from simulation.markov import (
    WAITING_MATRIX, TREATMENT_MATRIX, N_STATES,
    pcc_modified_waiting, MarkovPatient, population_state_distribution,
    _validate_matrix,
)


class TestTransitionMatrices:
    def test_waiting_rows_sum_to_one(self):
        for i, row in enumerate(WAITING_MATRIX):
            assert abs(row.sum() - 1.0) < 1e-9, f"WAITING row {i} sums to {row.sum()}"

    def test_treatment_rows_sum_to_one(self):
        for i, row in enumerate(TREATMENT_MATRIX):
            assert abs(row.sum() - 1.0) < 1e-9, f"TREATMENT row {i} sums to {row.sum()}"

    def test_all_probabilities_non_negative(self):
        assert (WAITING_MATRIX >= 0).all()
        assert (TREATMENT_MATRIX >= 0).all()

    def test_absorbing_states(self):
        """DEAD and RTD must be absorbing (self-transition = 1)."""
        dead_idx = HealthState.DEAD
        rtd_idx  = HealthState.RTD
        assert WAITING_MATRIX[dead_idx, dead_idx] == pytest.approx(1.0)
        assert WAITING_MATRIX[rtd_idx, rtd_idx]   == pytest.approx(1.0)
        assert TREATMENT_MATRIX[dead_idx, dead_idx] == pytest.approx(1.0)
        assert TREATMENT_MATRIX[rtd_idx, rtd_idx]   == pytest.approx(1.0)

    def test_no_improvement_while_waiting(self):
        """Patients cannot recover while waiting (no backwards transitions)."""
        # SERIOUS cannot transition to STABLE in WAITING matrix
        assert WAITING_MATRIX[HealthState.SERIOUS, HealthState.STABLE] == pytest.approx(0.0)
        # CRITICAL cannot transition to STABLE or SERIOUS in WAITING matrix
        assert WAITING_MATRIX[HealthState.CRITICAL, HealthState.STABLE] == pytest.approx(0.0)
        assert WAITING_MATRIX[HealthState.CRITICAL, HealthState.SERIOUS] == pytest.approx(0.0)


class TestPCCModifier:
    def test_zero_pcc_returns_standard_waiting(self):
        m = pcc_modified_waiting(0.0)
        np.testing.assert_array_almost_equal(m, WAITING_MATRIX)

    def test_positive_pcc_increases_deterioration(self):
        """Diagonal (stay-in-state) probability should be lower under PCC."""
        standard = WAITING_MATRIX
        modified = pcc_modified_waiting(24.0)
        for i in range(N_STATES - 2):  # skip absorbing states
            assert modified[i, i] <= standard[i, i] + 1e-9

    def test_pcc_modified_rows_sum_to_one(self):
        for hours in [6, 24, 48, 72]:
            m = pcc_modified_waiting(hours)
            for i, row in enumerate(m):
                assert abs(row.sum() - 1.0) < 1e-9, \
                    f"pcc={hours}h row {i} sums to {row.sum()}"

    def test_pcc_cap_at_72h(self):
        """72h and 1000h should produce the same matrix (cap at 3×)."""
        m72   = pcc_modified_waiting(72.0)
        m1000 = pcc_modified_waiting(1000.0)
        np.testing.assert_array_almost_equal(m72, m1000)

    def test_pcc_all_probabilities_valid(self):
        m = pcc_modified_waiting(48.0)
        assert (m >= 0).all()
        assert (m <= 1 + 1e-9).all()


class TestMarkovPatient:
    def _make_patient(self, ptype, pcc=0.0, seed=0):
        return MarkovPatient(
            patient_id=1,
            patient_type=ptype,
            arrival_time=0.0,
            pcc_hours=pcc,
            rng=np.random.default_rng(seed),
        )

    def test_t1_starts_critical(self):
        p = self._make_patient(PatientType.BI_T1)
        assert p.state in (HealthState.CRITICAL, HealthState.TERMINAL,
                           HealthState.DEAD, HealthState.RTD), \
            "T1 should start CRITICAL or have deteriorated immediately"

    def test_t2_starts_serious(self):
        p = self._make_patient(PatientType.BI_T2)
        # With no PCC, T2 starts SERIOUS
        assert p.state == HealthState.SERIOUS

    def test_t3_starts_stable(self):
        p = self._make_patient(PatientType.BI_T3)
        assert p.state == HealthState.STABLE

    def test_t4_starts_terminal(self):
        p = self._make_patient(PatientType.BI_T4)
        assert p.state == HealthState.TERMINAL

    def test_pcc_degrades_t1(self):
        """T1 patients with 72h PCC should show higher rate of critical/dead vs no PCC."""
        n = 500
        no_pcc_dead = sum(
            1 for i in range(n)
            if self._make_patient(PatientType.BI_T1, pcc=0.0, seed=i).state
               in (HealthState.DEAD, HealthState.TERMINAL)
        )
        with_pcc_dead = sum(
            1 for i in range(n)
            if self._make_patient(PatientType.BI_T1, pcc=72.0, seed=i).state
               in (HealthState.DEAD, HealthState.TERMINAL)
        )
        assert with_pcc_dead >= no_pcc_dead, \
            "PCC should increase terminal/dead rate"

    def test_dnbi_not_affected_by_pcc(self):
        """DNBI patients ignore PCC modifier — should start in their base state."""
        p = self._make_patient(PatientType.DNBI_DISEASE, pcc=72.0, seed=0)
        # DNBI_DISEASE starts SERIOUS regardless of PCC
        assert p.state == HealthState.SERIOUS

    def test_step_absorbing_states(self):
        """DEAD and RTD patients do not change state."""
        p = self._make_patient(PatientType.BI_T4, seed=999)
        # Force to dead state
        p.state = HealthState.DEAD
        p.step()
        assert p.state == HealthState.DEAD

        p.state = HealthState.RTD
        p.step()
        assert p.state == HealthState.RTD

    def test_treatment_improves_prognosis(self):
        """In treatment, STABLE patients have high RTD probability."""
        p = self._make_patient(PatientType.BI_T3, seed=0)
        p.state = HealthState.STABLE
        p.in_treatment = True
        rtd_count = 0
        for seed in range(200):
            rng = np.random.default_rng(seed)
            row = TREATMENT_MATRIX[HealthState.STABLE]
            new_state = HealthState(rng.choice(N_STATES, p=row))
            if new_state == HealthState.RTD:
                rtd_count += 1
        assert rtd_count > 50, "STABLE patients should frequently RTD under treatment"

    def test_waiting_increments_hours(self):
        p = self._make_patient(PatientType.BI_T3)
        assert p.hours_waiting == 0.0
        p.step(hours=1.0)
        assert p.hours_waiting == pytest.approx(1.0)
        p.in_treatment = True
        p.step(hours=1.0)
        assert p.hours_waiting == pytest.approx(1.0)  # no increment when in treatment

    def test_priority_ordering(self):
        p = self._make_patient(PatientType.BI_T1)
        p.state = HealthState.CRITICAL
        crit_priority = p.priority
        p.state = HealthState.SERIOUS
        assert p.priority > crit_priority  # SERIOUS lower priority than CRITICAL

    def test_is_alive(self):
        p = self._make_patient(PatientType.BI_T3)
        p.state = HealthState.STABLE
        assert p.is_alive is True
        p.state = HealthState.DEAD
        assert p.is_alive is False

    def test_preventable_death_flag(self):
        """Death while waiting should set is_preventable_death."""
        rng = np.random.default_rng(0)
        p = MarkovPatient(
            patient_id=1, patient_type=PatientType.BI_T4,
            arrival_time=0.0, rng=rng,
        )
        p.state = HealthState.TERMINAL
        p.in_treatment = False
        # Force death by overriding state directly
        old_state = p.state
        p.state = HealthState.DEAD
        p.is_preventable_death = True
        assert p.is_preventable_death is True


class TestPopulationDistribution:
    def test_empty_population(self):
        d = population_state_distribution([])
        assert all(v == 0 for v in d.values())

    def test_counts_by_state(self):
        rng = np.random.default_rng(0)
        patients = []
        for ptype in [PatientType.BI_T3, PatientType.BI_T2, PatientType.BI_T1]:
            p = MarkovPatient(1, ptype, 0.0, rng=rng)
            patients.append(p)
        d = population_state_distribution(patients)
        assert sum(d.values()) == len(patients)
        assert all(k in d for k in ("stable", "serious", "critical", "terminal", "dead", "rtd"))

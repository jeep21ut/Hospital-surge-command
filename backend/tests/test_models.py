"""
Tests for Pydantic simulation models — boundary conditions and validation.
"""
import pytest
from pydantic import ValidationError
from simulation.models import (
    SimParams, SimResults, SimSummary,
    BedStatus, PatientCounts, ORStatus,
    LogisticsStatus, StaffStatus, EvacuationStatus,
    MarkovDistribution, Alert, HourlySnapshot,
    MonteCarloRequest,
)


class TestSimParams:
    def test_defaults_are_valid(self):
        p = SimParams()
        assert 24 <= p.sim_duration_hours <= 720
        assert 0 <= p.mascal_pulse_size <= 5000
        assert 0.05 <= p.bi_fraction <= 0.80
        assert 0 <= p.supply_disruption_fraction <= 1.0
        assert isinstance(p.or_surge_activated, bool)

    def test_min_duration(self):
        p = SimParams(sim_duration_hours=24)
        assert p.sim_duration_hours == 24

    def test_max_duration(self):
        p = SimParams(sim_duration_hours=720)
        assert p.sim_duration_hours == 720

    def test_duration_below_min_rejected(self):
        with pytest.raises(ValidationError):
            SimParams(sim_duration_hours=1)

    def test_duration_above_max_rejected(self):
        with pytest.raises(ValidationError):
            SimParams(sim_duration_hours=999)

    def test_bi_fraction_bounds(self):
        SimParams(bi_fraction=0.05)
        SimParams(bi_fraction=0.80)
        with pytest.raises(ValidationError):
            SimParams(bi_fraction=0.0)
        with pytest.raises(ValidationError):
            SimParams(bi_fraction=0.99)

    def test_supply_disruption_bounds(self):
        SimParams(supply_disruption_fraction=0.0)
        SimParams(supply_disruption_fraction=1.0)
        with pytest.raises(ValidationError):
            SimParams(supply_disruption_fraction=1.5)

    def test_pcc_delay_bounds(self):
        SimParams(pcc_delay_hours=0)
        SimParams(pcc_delay_hours=72)
        with pytest.raises(ValidationError):
            SimParams(pcc_delay_hours=100)

    def test_random_seed_bounds(self):
        SimParams(random_seed=0)
        SimParams(random_seed=99999)
        with pytest.raises(ValidationError):
            SimParams(random_seed=-1)

    def test_mascal_pulse_zero(self):
        """Zero pulse is valid — models no MASCAL event."""
        p = SimParams(mascal_pulse_size=0)
        assert p.mascal_pulse_size == 0

    def test_or_surge_toggle(self):
        assert SimParams(or_surge_activated=True).or_surge_activated is True
        assert SimParams(or_surge_activated=False).or_surge_activated is False


class TestMonteCarloRequest:
    def test_defaults(self):
        r = MonteCarloRequest(params=SimParams())
        assert r.n_runs == 10

    def test_n_runs_bounds(self):
        MonteCarloRequest(params=SimParams(), n_runs=3)
        MonteCarloRequest(params=SimParams(), n_runs=50)
        with pytest.raises(ValidationError):
            MonteCarloRequest(params=SimParams(), n_runs=2)
        with pytest.raises(ValidationError):
            MonteCarloRequest(params=SimParams(), n_runs=51)


class TestAlertModel:
    def test_alert_levels(self):
        for level in ("INFO", "WARNING", "CRITICAL"):
            a = Alert(level=level, code="TEST_CODE", message="test message")
            assert a.level == level

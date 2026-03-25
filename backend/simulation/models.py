"""
Pydantic data models for simulation parameters and results.
"""
from __future__ import annotations
from enum import IntEnum
from typing import List, Optional
from pydantic import BaseModel, Field


# ─── Enumerations ─────────────────────────────────────────────────────────────

class PatientType(IntEnum):
    BI_T1   = 0   # Battle Injury – Immediate
    BI_T2   = 1   # Battle Injury – Delayed
    BI_T3   = 2   # Battle Injury – Minimal
    BI_T4   = 3   # Battle Injury – Expectant
    DNBI_DISEASE = 4
    DNBI_COSR    = 5
    DNBI_NBI     = 6


class HealthState(IntEnum):
    STABLE   = 0
    SERIOUS  = 1
    CRITICAL = 2
    TERMINAL = 3
    DEAD     = 4
    RTD      = 5


# ─── Simulation Input Parameters ─────────────────────────────────────────────

class SimParams(BaseModel):
    # Time
    sim_duration_hours: float = Field(default=168.0, ge=24, le=720,
        description="Simulation duration in hours (24–720)")

    # MASCAL event
    mascal_pulse_size: int = Field(default=500, ge=0, le=5000,
        description="Total patients in the MASCAL pulse")
    mascal_pulse_timing_hours: float = Field(default=12.0, ge=0, le=168,
        description="Hours after T=0 when MASCAL pulse begins")
    mascal_pulse_spread_hours: float = Field(default=8.0, ge=1, le=48,
        description="Duration over which MASCAL patients arrive")

    # Baseline ops
    baseline_daily_arrivals: float = Field(default=30.0, ge=1, le=200,
        description="Normal (pre-surge) daily patient arrivals")

    # Civilian offload
    ndms_capacity_fraction: float = Field(default=1.0, ge=0.0, le=1.0,
        description="NDMS civilian bed availability (0=none, 1=full)")
    civilian_displacement_days: float = Field(default=3.0, ge=0.5, le=14,
        description="Days to complete civilian patient displacement")

    # Logistics / supply chain
    supply_disruption_fraction: float = Field(default=0.5, ge=0.0, le=1.0,
        description="Supply chain disruption (0=none, 1=complete cutoff)")
    a2ad_medevac_disruption: float = Field(default=0.6, ge=0.0, le=1.0,
        description="A2/AD MEDEVAC disruption (0=normal, 1=fully denied)")

    # Personnel
    ar_medcom_delay_days: float = Field(default=5.0, ge=0, le=21,
        description="Days until AR-MEDCOM augmentees arrive")

    # Casualty mix
    bi_fraction: float = Field(default=0.25, ge=0.05, le=0.80,
        description="Battle Injury fraction of total casualties (rest = DNBI)")

    # Prolonged Casualty Care modifier
    pcc_delay_hours: float = Field(default=6.0, ge=0, le=72,
        description="Average hours patients spent in field before MAMC arrival"
                    " (increases initial deterioration)")

    # OR surge (activate holding areas as ORs)
    or_surge_activated: bool = Field(default=True,
        description="Whether to activate surge OR capacity (8→10 tables)")

    # Seed for reproducibility (0 = random)
    random_seed: int = Field(default=42, ge=0, le=99999)


# ─── Per-Snapshot State ───────────────────────────────────────────────────────

class BedStatus(BaseModel):
    icu_capacity:   int
    icu_occupied:   int
    ward_capacity:  int
    ward_occupied:  int
    bh_capacity:    int
    bh_occupied:    int
    holding_occupied: int      # overflow / non-standard beds


class PatientCounts(BaseModel):
    total_in_system:   int
    waiting_for_bed:   int
    waiting_for_or:    int
    in_treatment:      int
    t1_active:         int
    t2_active:         int
    t3_active:         int
    t4_active:         int
    dnbi_active:       int
    cumulative_rtd:    int
    cumulative_deaths: int
    cumulative_treated:int


class ORStatus(BaseModel):
    or_capacity:       int
    procedures_active: int
    queue_depth:       int
    avg_wait_hours:    float
    dcs_completed:     int
    definitive_completed: int
    or_efficiency:     float      # 0–1 (staff exhaustion factor)
    or_turnover_hours: float


class LogisticsStatus(BaseModel):
    packed_rbc_units:          int
    rbc_days_supply:           float
    surgical_sets_remaining:   float
    surgical_sets_dos:         float
    ventilators_in_use:        int
    ventilators_available:     int
    o2_mode:                   str   # "CONCENTRATOR" | "CYLINDER" | "CRITICAL"
    walking_blood_bank_active: bool
    resupply_rate:             float  # units/week currently available


class StaffStatus(BaseModel):
    active_duty_present:    int
    augmentees_present:     int
    avg_exhaustion_pct:     float    # 0–100%
    or_efficiency:          float    # 0–1
    time_to_augmentees_h:   float    # hours until AR-MEDCOM arrives (0 if arrived)


class EvacuationStatus(BaseModel):
    ndms_slots_available:   int
    va_slots_available:     int
    gridlock_active:        bool
    intake_multiplier:      float    # 1.0 = normal, <1 = reduced intake
    patients_evacuated_cum: int
    civilian_beds_freed:    int      # cumulative civilian displacement progress


class MarkovDistribution(BaseModel):
    stable:   int
    serious:  int
    critical: int
    terminal: int
    dead:     int
    rtd:      int


class Alert(BaseModel):
    level:   str    # "INFO" | "WARNING" | "CRITICAL"
    code:    str    # Machine-readable alert code
    message: str


class HourlySnapshot(BaseModel):
    time_hours:   float
    beds:         BedStatus
    patients:     PatientCounts
    or_status:    ORStatus
    logistics:    LogisticsStatus
    staff:        StaffStatus
    evacuation:   EvacuationStatus
    markov:       MarkovDistribution
    alerts:       List[Alert]


# ─── Simulation Output ─────────────────────────────────────────────────────────

class SimSummary(BaseModel):
    total_arrivals:          int
    total_deaths:            int
    preventable_deaths:      int       # deaths from queue deterioration
    total_rtd:               int
    peak_census:             int
    max_or_queue:            int
    gridlock_hours:          float
    blood_crisis_hours:      float     # hours with WBB active
    lowest_rbc_count:        int
    ar_medcom_arrival_hour:  float
    civilian_displacement_complete_hour: float


class SimResults(BaseModel):
    simulation_id: str
    params:        SimParams
    timeline:      List[HourlySnapshot]
    summary:       SimSummary

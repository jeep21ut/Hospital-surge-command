"""
MAMC / Pacific Northwest Baseline Constants
Source: JP 4-02, FM 4-02, DHA planning data, PNW hospital network data
All bed counts reflect validated regional estimates for planning purposes.
"""

# ─── MAMC Bed Capacity ──────────────────────────────────────────────────────
MAMC_BASELINE_BEDS = 210          # Typical inpatient census (205–220 range)
MAMC_SURGE_BEDS    = 318          # Max physical surge without modular expansion
MAMC_ICU_BASELINE  = 28           # ICU beds (standard ops)
MAMC_ICU_SURGE     = 56           # ICU with surge protocols activated
MAMC_WARD_BASELINE = 140          # Medical/Surgical ward
MAMC_WARD_SURGE    = 220          # Ward beds at full surge
MAMC_BH_BASELINE   = 42           # Behavioral Health / COSR beds
MAMC_BH_SURGE      = 42           # BH does not easily expand during surge

# ─── MAMC Surgical Capability ────────────────────────────────────────────────
MAMC_OR_ROOMS            = 8      # Operating rooms (standard)
MAMC_OR_SURGE_ROOMS      = 10     # ORs with surge (includes trauma bay conversions)
OR_TURNOVER_BASE_HOURS   = 0.5    # 30-min average turnover time under normal ops
DCS_PROCEDURE_HOURS      = 1.5    # Damage Control Surgery duration
DEFINITIVE_CARE_HOURS    = 3.5    # Definitive procedure average duration

# ─── PNW Civilian Network Slack Capacity ─────────────────────────────────────
# MultiCare, Providence, UW Medicine — combined inpatient ~2 500 beds
# Average occupancy 85–95% leaves approximately:
PNW_CIVILIAN_TOTAL_BEDS  = 2500
PNW_CIVILIAN_OCCUPANCY   = 0.90   # Baseline occupancy (90% midpoint)
PNW_CIVILIAN_SLACK_BEDS  = int(PNW_CIVILIAN_TOTAL_BEDS * (1 - PNW_CIVILIAN_OCCUPANCY))
# ≈ 250 beds available — highly constrained

# ─── VA Capacity ─────────────────────────────────────────────────────────────
VA_PUGET_SOUND_BEDS      = 120    # American Lake + Seattle campuses combined
VA_BASELINE_OCCUPANCY    = 0.82
VA_SLACK_BEDS            = int(VA_PUGET_SOUND_BEDS * (1 - VA_BASELINE_OCCUPANCY))

# ─── NDMS (National Disaster Medical System) ─────────────────────────────────
NDMS_NATIONAL_CAPACITY   = 2000   # Notional federal NDMS surge capacity
NDMS_ACTIVATION_DELAY_H  = 24     # Hours to activate NDMS

# ─── Logistics / Class VIII ───────────────────────────────────────────────────
INITIAL_PACKED_RBC_UNITS    = 400   # Whole-blood equivalent units on hand
RBC_SHELF_LIFE_DAYS         = 42    # FDA / ASBP shelf life packed RBCs
WALKING_BLOOD_BANK_THRESHOLD = 40   # Units; trigger WBB when stock < this AND resupply disrupted
SURGICAL_SETS_DOS_BASELINE  = 30    # Days of Supply surgical instrument sets
VENTILATORS_AVAILABLE       = 40    # Including ECRI reserves
O2_CONCENTRATORS            = 12    # On-site generators (continuous supply)
O2_CYLINDERS_DOS            = 7     # Days of cylinder backup

# Blood consumption per patient type (units of packed RBCs)
BLOOD_USE_T1  = 5.0   # Immediate/Critical BI — massive transfusion protocol
BLOOD_USE_T2  = 1.5   # Delayed BI
BLOOD_USE_T3  = 0.0   # Minimal / walking wounded
BLOOD_USE_DNBI = 0.0  # Non-battle injuries typically do not require transfusion
RESUPPLY_RATE_NORMAL = 80   # Units/week under normal ASBP logistics

# Surgical set consumption (sets per procedure)
SURG_SET_PER_DCS = 1.0
SURG_SET_PER_DEF = 1.5

# ─── Staff ────────────────────────────────────────────────────────────────────
ACTIVE_DUTY_STAFF        = 520    # Total clinical staff (physicians, nurses, techs)
SURGICAL_TEAMS           = 4      # Full trauma/surgical teams on surge
AUGMENTEE_DELAY_DAYS     = 5      # Default AR-MEDCOM activation + movement time
EXHAUSTION_RATE_PER_HOUR = 0.008  # Efficiency degrades this fraction per surge-hour
MIN_EFFICIENCY           = 0.45   # Floor on staff performance (never below 45%)

# ─── Civilian Displacement ────────────────────────────────────────────────────
CIVILIAN_PATIENTS_BASELINE  = 180    # Day-to-day civilian/dependent/retiree patients
DISPLACEMENT_COMPLETION_DAYS = 3     # Default days to complete civilian displacement

# ─── LSCO Casualty Ratios ─────────────────────────────────────────────────────
# FM 4-02 planning ratios for large-scale combat operations
BI_FRACTION   = 0.25   # Battle Injuries as fraction of total casualties
DNBI_FRACTION = 0.75   # Disease & Non-Battle Injuries (includes COSR)

# Of BI patients:
BI_T1_FRAC   = 0.12   # Immediate (Expectant survival with DCS)
BI_T2_FRAC   = 0.28   # Delayed
BI_T3_FRAC   = 0.48   # Minimal
BI_T4_FRAC   = 0.12   # Expectant

# Of DNBI patients:
DNBI_DISEASE_FRAC = 0.40
DNBI_COSR_FRAC    = 0.35
DNBI_NBI_FRAC     = 0.25

# RTD rates under normal care (fraction of each type that returns to duty)
RTD_T3     = 0.80
RTD_DNBI   = 0.72
RTD_COSR   = 0.65

# Treatment durations (hours) before bed release / discharge
TREAT_T1_ICU_HOURS   = 96     # ~4 days ICU
TREAT_T1_WARD_HOURS  = 120    # ~5 days ward step-down
TREAT_T2_WARD_HOURS  = 72     # ~3 days
TREAT_T3_HOURS       = 8      # Observation / minor treatment
TREAT_BH_HOURS       = 48     # COSR — 2-day stabilisation
TREAT_DNBI_HOURS     = 24     # General disease / NBI

# ─── Simulation Resolution ───────────────────────────────────────────────────
SNAPSHOT_INTERVAL_HOURS = 1   # Record system state every hour

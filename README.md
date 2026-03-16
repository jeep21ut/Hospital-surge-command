# MAMC Surge Simulator — Command Center

**Defense Health Agency (DHA) · Madigan Army Medical Center · Pacific Northwest**
*Large Scale Combat Operations (LSCO) Medical Planning Tool*

---

## Overview

A web-based discrete-event simulation and command-center dashboard for planning and analysis of massive casualty influxes at MAMC under Multi-Domain Operations (MDO) conditions. Built to reflect the realities of **JP 4-02 (Joint Health Services)** and **FM 4-02 (Army Health System)**.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  React Dashboard (Port 3000)                                  │
│  ├─ BedCapacityPanel   ICU/Ward/BH occupancy bars            │
│  ├─ PatientFlowPanel   Triage breakdown + RTD rate           │
│  ├─ ORStatusPanel      OR tables, queue, DCS vs DEF          │
│  ├─ LogisticsPanel     Blood bank, surgical sets, O₂         │
│  ├─ StaffPanel         Exhaustion + AR-MEDCOM integration    │
│  ├─ EvacuationPanel    NDMS/VA offload + gridlock indicator  │
│  ├─ MarkovPanel        Patient state stacked area chart      │
│  └─ TimelineChart      4-view time-series (Census/Flow/Logi/OR)│
└───────────────────┬──────────────────────────────────────────┘
                    │ REST (POST /api/simulate)
┌───────────────────▼──────────────────────────────────────────┐
│  FastAPI Backend (Port 8000)                                  │
│  └─ SimPy Simulation Engine                                   │
│     ├─ patient_generator()    Poisson + MASCAL pulse          │
│     ├─ patient_pathway()      Triage → Bed → OR → Discharge  │
│     ├─ MarkovPatient          Per-patient health state chain  │
│     ├─ supply_monitor()       Blood/surgical sets/vents/O₂   │
│     ├─ staff_manager()        Exhaustion decay + augmentees  │
│     ├─ evacuation_manager()   NDMS/VA/gridlock detection      │
│     └─ snapshot_collector()   Hourly state snapshot          │
└──────────────────────────────────────────────────────────────┘
```

---

## Key Simulation Features

### 1. Markov Chain Patient Deterioration
Each patient carries a health state machine with **6 states**:
`STABLE → SERIOUS → CRITICAL → TERMINAL → DEAD` (and `RTD`)

Two transition matrices govern state evolution:
- **WAITING_MATRIX** — deterioration accelerates without treatment
- **TREATMENT_MATRIX** — recovery possible once care is received
- **PCC modifier** — scales deterioration for patients with prolonged field time

### 2. MASCAL Pulse Modeling
Arrivals = baseline Poisson(λ) + exponential-decay surge pulse centered at `mascal_onset_hours`.

### 3. Back-Door Gridlock (`No System; No Space`)
When NDMS + VA discharge capacity < 20 slots AND occupancy > 97%, the system enters **GRIDLOCK** — intake drops to 10%. Models the PNW civilian network (MultiCare, Providence, UW Medicine) running at 85–95% baseline occupancy.

### 4. Class VIII / Blood Bank
- 42-day FIFO shelf-life tracking for packed RBCs
- **Walking Blood Bank** protocol triggers when strategic ASBP resupply is disrupted AND stock < 40 units
- Supply disruption fraction scales resupply rate linearly

### 5. Staff Exhaustion & AR-MEDCOM
- OR efficiency = `max(0.45, 1.0 − 0.008 × surge_hours)`
- AR-MEDCOM augmentees arrive at configurable delay (default D+5), restoring +15% efficiency
- OR turnover time scales inversely with efficiency

### 6. Civilian Displacement Friction
180 day-to-day civilian/dependent/retiree patients must be offloaded to the PNW network over a configurable number of days before surge beds are fully available.

---

## PNW Baseline Constants

| Parameter | Value | Source |
|-----------|-------|--------|
| MAMC standard inpatient beds | 210 | DHA planning data |
| MAMC disaster surge capacity | 318 | Max physical footprint |
| MAMC ICU (surge) | 56 | With surge protocols |
| PNW civilian total beds | ~2,500 | MultiCare + Providence + UW |
| PNW baseline occupancy | 90% | Regional average |
| PNW slack capacity | ~250 beds | Highly constrained |
| VA Puget Sound beds | 120 | American Lake + Seattle |
| Packed RBC shelf life | 42 days | FDA / ASBP standard |

---

## Quick Start

### Development (recommended)
```bash
chmod +x run_dev.sh
./run_dev.sh
# Dashboard: http://localhost:3000
# API Docs:  http://localhost:8000/docs
```

### Docker Compose
```bash
docker-compose up --build
# Dashboard: http://localhost:3000
```

### Manual
```bash
# Backend
cd backend
pip install -r requirements.txt
uvicorn api.main:app --port 8000 --reload

# Frontend (separate terminal)
cd frontend
npm install --legacy-peer-deps
npm start
```

---

## Simulation Controls (Dashboard Sliders)

| Slider | Range | Effect |
|--------|-------|--------|
| Simulation Duration | 24–720 h | Timeframe to model |
| MASCAL Pulse Size | 0–5,000 | Patients in surge event |
| MASCAL Onset | H+0 to H+168 | When pulse begins |
| BI Fraction | 5–80% | Battle Injury vs. DNBI ratio |
| PCC Field Delay | 0–72 h | Hours in field pre-MAMC |
| Supply Disruption | 0–100% | Logistics chain degradation |
| A2/AD MEDEVAC | 0–100% | Strategic MEDEVAC denial |
| NDMS Availability | 0–100% | Civilian offload capacity |
| AR-MEDCOM Delay | D+0 to D+21 | Reserve augmentee arrival |
| Civilian Displacement | 0.5–14 d | Time to offload civilians |
| OR Surge Activation | On/Off | 8 → 10 OR tables |

---

## Doctrinal References
- JP 4-02: Joint Health Services
- FM 4-02: Army Health System
- FM 3-0: Operations (MDO context)
- Defense Health Agency LSCO planning guidance
- Armed Services Blood Program (ASBP) shelf-life standards

---

*For planning and analysis purposes only. Not for operational medical decision-making.*

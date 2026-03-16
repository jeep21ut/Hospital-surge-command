"""
FastAPI application — MAMC Surge Simulator REST API
====================================================
Endpoints
---------
  POST  /api/simulate            Run simulation, return full results
  GET   /api/defaults            Return default SimParams
  GET   /api/health              Liveness probe
"""

from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import traceback

from simulation.engine import run_simulation
from simulation.models import SimParams, SimResults

app = FastAPI(
    title="MAMC Surge Simulator API",
    description="Defense Health Agency — Large Scale Combat Operations Surge Simulator",
    version="1.0.0",
)

# Allow all origins for dashboard access (restrict in production)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok", "service": "mamc-surge-simulator"}


@app.get("/api/defaults", response_model=SimParams)
def get_defaults():
    """Return default simulation parameters."""
    return SimParams()


@app.post("/api/simulate", response_model=SimResults)
def simulate(params: SimParams):
    """
    Run the MAMC surge simulation with the provided parameters.

    Returns a complete time-series of hourly snapshots plus a summary.
    Typical run times:
      •  168-h (1-week) simulation  →  ~1–3 s
      •  720-h (1-month) simulation →  ~5–15 s
    """
    try:
        results = run_simulation(params)
        return results
    except Exception as exc:
        tb = traceback.format_exc()
        raise HTTPException(status_code=500,
                            detail=f"Simulation error: {exc}\n{tb}")

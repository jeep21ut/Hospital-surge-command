"""
FastAPI application — MAMC Surge Simulator REST API
====================================================
Endpoints
---------
  POST  /api/simulate                Run simulation, return full results
  POST  /api/simulate/monte-carlo    Run N stochastic simulations, return bands
  GET   /api/defaults                Return default SimParams
  GET   /api/health                  Liveness probe

Authentication
--------------
Set MAMC_AUTH_USER + MAMC_AUTH_PASS env vars to enable HTTP Basic Auth.
If neither is set the endpoints are open (development mode).
"""

from __future__ import annotations

import os
import secrets
import traceback
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from simulation.engine import run_simulation
from simulation.models import (
    SimParams, SimResults,
    MonteCarloRequest, MonteCarloResults, MCBand, MonteCarloSummary,
)

# ── Auth ──────────────────────────────────────────────────────────────────────

_AUTH_USER = os.environ.get("MAMC_AUTH_USER", "")
_AUTH_PASS = os.environ.get("MAMC_AUTH_PASS", "")
_AUTH_ENABLED = bool(_AUTH_USER and _AUTH_PASS)

security = HTTPBasic(auto_error=False)


def verify_credentials(credentials: Optional[HTTPBasicCredentials] = Depends(security)):
    if not _AUTH_ENABLED:
        return  # open in dev mode
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Basic"},
        )
    ok_user = secrets.compare_digest(credentials.username.encode(), _AUTH_USER.encode())
    ok_pass = secrets.compare_digest(credentials.password.encode(), _AUTH_PASS.encode())
    if not (ok_user and ok_pass):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials",
            headers={"WWW-Authenticate": "Basic"},
        )


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="MAMC Surge Simulator API",
    description="Defense Health Agency — Large Scale Combat Operations Surge Simulator",
    version="1.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/api/health")
def health():
    return {"status": "ok", "service": "mamc-surge-simulator", "auth_enabled": _AUTH_ENABLED}


@app.get("/api/defaults", response_model=SimParams)
def get_defaults():
    """Return default simulation parameters."""
    return SimParams()


@app.post("/api/simulate", response_model=SimResults,
          dependencies=[Depends(verify_credentials)])
def simulate(params: SimParams):
    """
    Run the MAMC surge simulation with the provided parameters.

    Returns a complete time-series of hourly snapshots plus a summary.
    Typical run times:
      •  168-h (1-week) simulation  →  ~1–3 s
      •  720-h (1-month) simulation →  ~5–15 s
    """
    try:
        return run_simulation(params)
    except Exception as exc:
        raise HTTPException(status_code=500,
                            detail=f"Simulation error: {exc}\n{traceback.format_exc()}")


@app.post("/api/simulate/monte-carlo", response_model=MonteCarloResults,
          dependencies=[Depends(verify_credentials)])
def monte_carlo(req: MonteCarloRequest):
    """
    Run N stochastic simulations and return per-timestep confidence bands
    (P10 / mean / P90) for census, deaths, RBC stock, and waiting patients.

    Each run uses a different random seed derived from the base seed.
    Typical run times: ~n_runs × single-run time.
    """
    try:
        base_seed = req.params.random_seed
        all_results = []
        for i in range(req.n_runs):
            p = req.params.model_copy(update={"random_seed": (base_seed + i) % 100000})
            all_results.append(run_simulation(p))

        # Align timelines — all runs produce the same number of snapshots
        n_steps = min(len(r.timeline) for r in all_results)

        bands: list[MCBand] = []
        for step_idx in range(n_steps):
            snaps = [r.timeline[step_idx] for r in all_results]
            t = snaps[0].time_hours

            census  = np.array([s.patients.total_in_system for s in snaps], dtype=float)
            deaths  = np.array([s.patients.cumulative_deaths for s in snaps], dtype=float)
            rbc     = np.array([s.logistics.packed_rbc_units for s in snaps], dtype=float)
            waiting = np.array([s.patients.waiting_for_bed for s in snaps], dtype=float)

            def _band(arr):
                return float(np.mean(arr)), float(np.percentile(arr, 10)), float(np.percentile(arr, 90))

            cm, cp10, cp90 = _band(census)
            dm, dp10, dp90 = _band(deaths)
            rm, rp10, rp90 = _band(rbc)
            wm, wp10, wp90 = _band(waiting)

            bands.append(MCBand(
                time_hours=t,
                census_mean=cm, census_p10=cp10, census_p90=cp90,
                deaths_mean=dm, deaths_p10=dp10, deaths_p90=dp90,
                rbc_mean=rm,    rbc_p10=rp10,    rbc_p90=rp90,
                waiting_mean=wm, waiting_p10=wp10, waiting_p90=wp90,
            ))

        summaries = [r.summary for r in all_results]
        total_deaths  = np.array([s.total_deaths for s in summaries], dtype=float)
        peak_census   = np.array([s.peak_census for s in summaries], dtype=float)
        gridlock_h    = np.array([s.gridlock_hours for s in summaries], dtype=float)
        blood_crisis  = np.array([s.blood_crisis_hours for s in summaries], dtype=float)

        mc_summary = MonteCarloSummary(
            total_deaths_mean=float(np.mean(total_deaths)),
            total_deaths_p10=float(np.percentile(total_deaths, 10)),
            total_deaths_p90=float(np.percentile(total_deaths, 90)),
            peak_census_mean=float(np.mean(peak_census)),
            peak_census_p10=float(np.percentile(peak_census, 10)),
            peak_census_p90=float(np.percentile(peak_census, 90)),
            gridlock_hours_mean=float(np.mean(gridlock_h)),
            blood_crisis_hours_mean=float(np.mean(blood_crisis)),
        )

        return MonteCarloResults(
            n_runs=req.n_runs,
            params=req.params,
            bands=bands,
            summary=mc_summary,
        )

    except Exception as exc:
        raise HTTPException(status_code=500,
                            detail=f"Monte Carlo error: {exc}\n{traceback.format_exc()}")

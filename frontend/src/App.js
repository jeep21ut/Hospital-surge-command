import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api/client';
import ControlPanel from './components/ControlPanel';
import Dashboard from './components/Dashboard';
import AlertBanner from './components/AlertBanner';
import './App.css';

const DEFAULT_PARAMS = {
  sim_duration_hours: 168,
  mascal_pulse_size: 800,
  mascal_pulse_timing_hours: 24,
  mascal_pulse_spread_hours: 12,
  baseline_daily_arrivals: 35,
  ndms_capacity_fraction: 0.7,
  civilian_displacement_days: 3,
  supply_disruption_fraction: 0.5,
  a2ad_medevac_disruption: 0.6,
  ar_medcom_delay_days: 5,
  bi_fraction: 0.25,
  pcc_delay_hours: 8,
  or_surge_activated: true,
  random_seed: 42,
};

export default function App() {
  const [params, setParams]       = useState(DEFAULT_PARAMS);
  const [results, setResults]     = useState(null);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState(null);
  const [playhead, setPlayhead]   = useState(0);    // index into timeline
  const [playing, setPlaying]     = useState(false);
  const animRef                   = useRef(null);
  const lastTickRef               = useRef(null);

  // ── Animation playback ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !results) return;
    const maxIdx = results.timeline.length - 1;

    const tick = (ts) => {
      if (!lastTickRef.current) lastTickRef.current = ts;
      const elapsed = ts - lastTickRef.current;
      if (elapsed > 120) {  // advance 1 step per 120 ms
        lastTickRef.current = ts;
        setPlayhead(prev => {
          if (prev >= maxIdx) { setPlaying(false); return prev; }
          return prev + 1;
        });
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [playing, results]);

  const runSim = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    setPlayhead(0);
    try {
      const data = await api.simulate(params);
      setResults(data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, [params]);

  const currentSnapshot = results?.timeline?.[playhead] ?? null;
  const alerts = currentSnapshot?.alerts ?? [];

  const criticalAlerts = alerts.filter(a => a.level === 'CRITICAL');
  const warningAlerts  = alerts.filter(a => a.level === 'WARNING');

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-left">
          <span className="header-star">★</span>
          <div>
            <div className="header-title">MAMC SURGE SIMULATOR</div>
            <div className="header-sub">
              Defense Health Agency · Pacific Northwest Theater · LSCO Planning Tool
            </div>
          </div>
        </div>
        <div className="header-center">
          {results && currentSnapshot && (
            <div className="sim-clock">
              <span className="clock-label">SIM TIME</span>
              <span className="clock-value">
                H+{String(Math.floor(currentSnapshot.time_hours)).padStart(4,'0')}
                &nbsp;/&nbsp;
                {formatHoursToDate(currentSnapshot.time_hours)}
              </span>
            </div>
          )}
        </div>
        <div className="header-right">
          <div className={`threatcon ${criticalAlerts.length > 0 ? 'red' : warningAlerts.length > 0 ? 'amber' : 'green'}`}>
            {criticalAlerts.length > 0 ? '◈ CRITICAL' : warningAlerts.length > 0 ? '◈ WARNING' : '◈ NOMINAL'}
          </div>
        </div>
      </header>

      {/* ── Alert Banner ── */}
      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

      {/* ── Main layout ── */}
      <div className="app-body">
        {/* Left sidebar: controls */}
        <aside className="app-sidebar">
          <ControlPanel
            params={params}
            onChange={setParams}
            onRun={runSim}
            loading={loading}
          />
          {results && (
            <div className="playback-controls">
              <div className="panel-title">▶ PLAYBACK</div>
              <div className="playback-row">
                <button className="btn-sm" onClick={() => setPlayhead(0)}>|◀</button>
                <button className="btn-sm" onClick={() => setPlaying(p => !p)}>
                  {playing ? '⏸' : '▶'}
                </button>
                <button className="btn-sm" onClick={() => {
                  setPlaying(false);
                  setPlayhead(results.timeline.length - 1);
                }}>▶|</button>
              </div>
              <input
                type="range"
                min={0}
                max={results.timeline.length - 1}
                value={playhead}
                onChange={e => { setPlaying(false); setPlayhead(+e.target.value); }}
                className="playhead-slider"
              />
              <div className="playhead-info">
                Frame {playhead + 1} / {results.timeline.length}
              </div>
            </div>
          )}
          {results && (
            <SummaryPanel summary={results.summary} />
          )}
        </aside>

        {/* Main dashboard */}
        <main className="app-main">
          {error && (
            <div className="error-banner">
              ⚠ Simulation Error: {error}
            </div>
          )}
          {loading && (
            <div className="loading-screen">
              <div className="loading-spinner" />
              <div className="loading-text">RUNNING SIMULATION…</div>
              <div className="loading-sub">
                Executing discrete-event model · Markov chains · Supply chain analysis
              </div>
            </div>
          )}
          {!loading && results && currentSnapshot && (
            <Dashboard
              snapshot={currentSnapshot}
              timeline={results.timeline}
              playhead={playhead}
              params={params}
            />
          )}
          {!loading && !results && (
            <WelcomeScreen onRun={runSim} />
          )}
        </main>
      </div>
    </div>
  );
}

function formatHoursToDate(h) {
  const d = Math.floor(h / 24);
  const hr = Math.floor(h % 24);
  return `D+${d} ${String(hr).padStart(2,'0')}:00Z`;
}

function SummaryPanel({ summary }) {
  return (
    <div className="summary-panel">
      <div className="panel-title">EXERCISE SUMMARY</div>
      <div className="summary-grid">
        <SumRow label="Total Arrivals"    value={summary.total_arrivals.toLocaleString()} />
        <SumRow label="Total Deaths"      value={summary.total_deaths.toLocaleString()} color="var(--red)" />
        <SumRow label="Preventable Deaths" value={summary.preventable_deaths.toLocaleString()} color="var(--red)" />
        <SumRow label="RTD"               value={summary.total_rtd.toLocaleString()} color="var(--green)" />
        <SumRow label="Peak Census"       value={summary.peak_census} />
        <SumRow label="Gridlock Hours"    value={`${summary.gridlock_hours}h`}
          color={summary.gridlock_hours > 0 ? 'var(--red)' : 'var(--green)'} />
        <SumRow label="Blood Crisis Hours" value={`${summary.blood_crisis_hours}h`}
          color={summary.blood_crisis_hours > 0 ? 'var(--amber)' : 'var(--green)'} />
        <SumRow label="Augmentee Arrival"  value={`H+${summary.ar_medcom_arrival_hour}`} />
      </div>
    </div>
  );
}

function SumRow({ label, value, color }) {
  return (
    <div className="sum-row">
      <span className="sum-label">{label}</span>
      <span className="sum-value" style={color ? { color } : {}}>
        {value}
      </span>
    </div>
  );
}

function WelcomeScreen({ onRun }) {
  return (
    <div className="welcome">
      <div className="welcome-emblem">⚕</div>
      <h2 className="welcome-title">MAMC SURGE COMMAND CENTER</h2>
      <p className="welcome-sub">
        Madigan Army Medical Center · Pacific Northwest<br/>
        Large Scale Combat Operations Planning Tool
      </p>
      <div className="welcome-features">
        <div className="feature-item">
          <span className="feature-icon">⊕</span>
          Discrete-Event Simulation (SimPy)
        </div>
        <div className="feature-item">
          <span className="feature-icon">⊕</span>
          Markov Chain Patient Deterioration
        </div>
        <div className="feature-item">
          <span className="feature-icon">⊕</span>
          NDMS/VA Back-Door Gridlock Model
        </div>
        <div className="feature-item">
          <span className="feature-icon">⊕</span>
          Class VIII Blood Bank / ASBP Tracking
        </div>
        <div className="feature-item">
          <span className="feature-icon">⊕</span>
          Staff Exhaustion &amp; AR-MEDCOM Integration
        </div>
        <div className="feature-item">
          <span className="feature-icon">⊕</span>
          A2/AD MEDEVAC Disruption Modeling
        </div>
      </div>
      <button className="btn-run-large" onClick={onRun}>
        ▶ INITIALIZE SIMULATION
      </button>
    </div>
  );
}

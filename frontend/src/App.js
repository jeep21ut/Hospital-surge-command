import React, { useState, useEffect, useCallback, useRef } from 'react';
import { api } from './api/client';
import ControlPanel      from './components/ControlPanel';
import Dashboard         from './components/Dashboard';
import AlertBanner       from './components/AlertBanner';
import ScenarioManager   from './components/ScenarioManager';
import './App.css';

const DEFAULT_PARAMS = {
  sim_duration_hours:        168,
  mascal_pulse_size:         800,
  mascal_pulse_timing_hours: 24,
  mascal_pulse_spread_hours: 12,
  baseline_daily_arrivals:   35,
  ndms_capacity_fraction:    0.7,
  civilian_displacement_days:3,
  supply_disruption_fraction:0.5,
  a2ad_medevac_disruption:   0.6,
  ar_medcom_delay_days:      5,
  bi_fraction:               0.25,
  pcc_delay_hours:           8,
  or_surge_activated:        true,
  random_seed:               42,
};

const SIDEBAR_TABS = ['CONTROLS', 'SCENARIOS', 'COMPARE', 'MONTE CARLO'];

export default function App() {
  const [params, setParams]         = useState(DEFAULT_PARAMS);
  const [results, setResults]       = useState(null);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState(null);
  const [playhead, setPlayhead]     = useState(0);
  const [playing, setPlaying]       = useState(false);
  const animRef                     = useRef(null);
  const lastTickRef                 = useRef(null);

  // ── Sidebar tab ──────────────────────────────────────────────────────────
  const [sideTab, setSideTab] = useState('CONTROLS');

  // ── Pinned comparison runs ───────────────────────────────────────────────
  const [pinnedRuns, setPinnedRuns] = useState([]);   // [{label, timeline, summary}]

  // ── Monte Carlo ──────────────────────────────────────────────────────────
  const [mcRuns, setMcRuns]     = useState(10);
  const [mcResults, setMcResults] = useState(null);
  const [mcLoading, setMcLoading] = useState(false);

  // ── Animation playback ──────────────────────────────────────────────────
  useEffect(() => {
    if (!playing || !results) return;
    const maxIdx = results.timeline.length - 1;
    const tick = (ts) => {
      if (!lastTickRef.current) lastTickRef.current = ts;
      if (ts - lastTickRef.current > 120) {
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

  // ── Single simulation run ────────────────────────────────────────────────
  const runSim = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlaying(false);
    setPlayhead(0);
    setMcResults(null);
    try {
      const data = await api.simulate(params);
      setResults(data);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setLoading(false);
    }
  }, [params]);

  // ── Monte Carlo run ──────────────────────────────────────────────────────
  const runMC = useCallback(async () => {
    setMcLoading(true);
    setError(null);
    try {
      const data = await api.monteCarlo(params, mcRuns);
      setMcResults(data);
      setSideTab('MONTE CARLO');
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setMcLoading(false);
    }
  }, [params, mcRuns]);

  // ── Pin current run for comparison ──────────────────────────────────────
  function pinCurrentRun() {
    if (!results) return;
    if (pinnedRuns.length >= 3) {
      alert('Maximum 3 comparison runs. Remove one first.');
      return;
    }
    const label = prompt('Label for this run:', `Run ${pinnedRuns.length + 1}`) || `Run ${pinnedRuns.length + 1}`;
    setPinnedRuns(prev => [...prev, { label, timeline: results.timeline, summary: results.summary }]);
    setSideTab('COMPARE');
  }

  function unpinRun(idx) {
    setPinnedRuns(prev => prev.filter((_, i) => i !== idx));
  }

  // ── CSV export ───────────────────────────────────────────────────────────
  function exportCSV() {
    if (!results) return;
    const header = [
      'time_h', 'icu', 'ward', 'bh', 'holding',
      'total_in_system', 'waiting', 'in_treatment',
      't1', 't2', 't3', 't4', 'dnbi',
      'cum_rtd', 'cum_deaths',
      'or_active', 'or_queue', 'or_eff',
      'rbc_units', 'rbc_dos', 'surg_sets_dos', 'vents_used',
      'walking_blood_bank',
      'staff_exhaustion_pct', 'augmentees',
      'gridlock', 'evacuated',
    ].join(',');

    const rows = results.timeline.map(s => [
      s.time_hours.toFixed(1),
      s.beds.icu_occupied, s.beds.ward_occupied, s.beds.bh_occupied, s.beds.holding_occupied,
      s.patients.total_in_system, s.patients.waiting_for_bed, s.patients.in_treatment,
      s.patients.t1_active, s.patients.t2_active, s.patients.t3_active,
      s.patients.t4_active, s.patients.dnbi_active,
      s.patients.cumulative_rtd, s.patients.cumulative_deaths,
      s.or_status.procedures_active, s.or_status.queue_depth,
      s.or_status.or_efficiency.toFixed(3),
      s.logistics.packed_rbc_units, s.logistics.rbc_days_supply.toFixed(1),
      s.logistics.surgical_sets_dos.toFixed(1), s.logistics.ventilators_in_use,
      s.logistics.walking_blood_bank_active ? 1 : 0,
      s.staff.avg_exhaustion_pct.toFixed(1), s.staff.augmentees_present,
      s.evacuation.gridlock_active ? 1 : 0, s.evacuation.patients_evacuated_cum,
    ].join(','));

    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `mamc_simulation_${results.simulation_id.slice(0,8)}.csv`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Print/PDF report ─────────────────────────────────────────────────────
  function printReport() {
    window.print();
  }

  const currentSnapshot = results?.timeline?.[playhead] ?? null;
  const alerts          = currentSnapshot?.alerts ?? [];
  const criticalAlerts  = alerts.filter(a => a.level === 'CRITICAL');
  const warningAlerts   = alerts.filter(a => a.level === 'WARNING');

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
        <div className="header-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {results && (
            <>
              <button className="btn-sm" onClick={exportCSV} title="Export timeline as CSV">
                ↓ CSV
              </button>
              <button className="btn-sm" onClick={printReport} title="Print / Save as PDF">
                ⎙ PDF
              </button>
              <button className="btn-sm" onClick={pinCurrentRun} title="Pin run for comparison">
                📌 Pin
              </button>
            </>
          )}
          <div className={`threatcon ${criticalAlerts.length > 0 ? 'red' : warningAlerts.length > 0 ? 'amber' : 'green'}`}>
            {criticalAlerts.length > 0 ? '◈ CRITICAL' : warningAlerts.length > 0 ? '◈ WARNING' : '◈ NOMINAL'}
          </div>
        </div>
      </header>

      {/* ── Alert Banner ── */}
      {alerts.length > 0 && <AlertBanner alerts={alerts} />}

      {/* ── Main layout ── */}
      <div className="app-body">
        {/* Left sidebar */}
        <aside className="app-sidebar">
          {/* Sidebar tabs */}
          <div style={{ display: 'flex', gap: '2px', marginBottom: '8px', flexWrap: 'wrap' }}>
            {SIDEBAR_TABS.map(tab => (
              <button key={tab} onClick={() => setSideTab(tab)} style={{
                flex: '1 1 auto',
                padding: '3px 4px',
                background: sideTab === tab ? 'var(--blue-dim)' : 'var(--bg-deep)',
                border: `1px solid ${sideTab === tab ? 'var(--blue)' : 'var(--border)'}`,
                color: sideTab === tab ? 'var(--text-primary)' : 'var(--text-dim)',
                fontFamily: 'var(--font-mono)', fontSize: '7px',
                letterSpacing: '1px', cursor: 'pointer', borderRadius: '2px',
              }}>
                {tab}
              </button>
            ))}
          </div>

          {sideTab === 'CONTROLS' && (
            <>
              <ControlPanel params={params} onChange={setParams} onRun={runSim} loading={loading} />
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
                  <input type="range" min={0} max={results.timeline.length - 1}
                    value={playhead}
                    onChange={e => { setPlaying(false); setPlayhead(+e.target.value); }}
                    className="playhead-slider" />
                  <div className="playhead-info">
                    Frame {playhead + 1} / {results.timeline.length}
                  </div>
                </div>
              )}
              {results && <SummaryPanel summary={results.summary} />}
            </>
          )}

          {sideTab === 'SCENARIOS' && (
            <ScenarioManager
              currentParams={params}
              onLoad={p => { setParams(p); setSideTab('CONTROLS'); }}
            />
          )}

          {sideTab === 'COMPARE' && (
            <ComparePanel
              pinnedRuns={pinnedRuns}
              currentResults={results}
              onUnpin={unpinRun}
              onPinCurrent={pinCurrentRun}
            />
          )}

          {sideTab === 'MONTE CARLO' && (
            <MonteCarloPanel
              params={params}
              mcRuns={mcRuns}
              setMcRuns={setMcRuns}
              onRun={runMC}
              loading={mcLoading}
              results={mcResults}
            />
          )}
        </aside>

        {/* Main dashboard */}
        <main className="app-main">
          {error && <div className="error-banner">⚠ Simulation Error: {error}</div>}
          {(loading || mcLoading) && (
            <div className="loading-screen">
              <div className="loading-spinner" />
              <div className="loading-text">
                {mcLoading ? `RUNNING ${mcRuns} MONTE CARLO SIMULATIONS…` : 'RUNNING SIMULATION…'}
              </div>
              <div className="loading-sub">
                {mcLoading
                  ? 'Computing P10/P50/P90 confidence bands across stochastic runs'
                  : 'Executing discrete-event model · Markov chains · Supply chain analysis'}
              </div>
            </div>
          )}
          {!loading && !mcLoading && results && currentSnapshot && (
            <Dashboard
              snapshot={currentSnapshot}
              timeline={results.timeline}
              playhead={playhead}
              params={params}
              compareRuns={pinnedRuns}
              mcBands={mcResults?.bands ?? null}
            />
          )}
          {!loading && !mcLoading && !results && (
            <WelcomeScreen onRun={runSim} />
          )}
        </main>
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function formatHoursToDate(h) {
  const d  = Math.floor(h / 24);
  const hr = Math.floor(h % 24);
  return `D+${d} ${String(hr).padStart(2,'0')}:00Z`;
}

function SummaryPanel({ summary }) {
  return (
    <div className="summary-panel">
      <div className="panel-title">EXERCISE SUMMARY</div>
      <div className="summary-grid">
        <SumRow label="Total Arrivals"     value={summary.total_arrivals.toLocaleString()} />
        <SumRow label="Total Deaths"       value={summary.total_deaths.toLocaleString()} color="var(--red)" />
        <SumRow label="Preventable Deaths" value={summary.preventable_deaths.toLocaleString()} color="var(--red)" />
        <SumRow label="RTD"                value={summary.total_rtd.toLocaleString()} color="var(--green)" />
        <SumRow label="Peak Census"        value={summary.peak_census} />
        <SumRow label="Gridlock Hours"     value={`${summary.gridlock_hours}h`}
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
      <span className="sum-value" style={color ? { color } : {}}>{value}</span>
    </div>
  );
}

function ComparePanel({ pinnedRuns, currentResults, onUnpin, onPinCurrent }) {
  const COLORS = ['var(--green)', 'var(--amber)', 'var(--purple)'];
  return (
    <div className="control-panel">
      <div className="panel-title">SCENARIO COMPARISON</div>
      {pinnedRuns.length === 0 ? (
        <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: '8px' }}>
          No pinned runs. Run a simulation then click 📌 Pin in the header.
        </div>
      ) : (
        <div style={{ marginBottom: '8px' }}>
          {pinnedRuns.map((run, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '4px 0', borderBottom: '1px solid var(--border-dim)',
            }}>
              <span style={{
                width: '8px', height: '8px', borderRadius: '50%',
                background: COLORS[i % COLORS.length], flexShrink: 0,
              }} />
              <span style={{
                flex: 1, fontSize: '9px', color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>{run.label}</span>
              <span style={{ fontSize: '8px', color: 'var(--text-dim)' }}>
                {run.summary.total_deaths}↓ {run.summary.peak_census}⌈
              </span>
              <button className="btn-sm" onClick={() => onUnpin(i)}
                style={{ color: 'var(--red)' }}>✕</button>
            </div>
          ))}
        </div>
      )}
      {currentResults && pinnedRuns.length < 3 && (
        <button className="btn-sm" style={{ width: '100%' }} onClick={onPinCurrent}>
          📌 Pin Current Run
        </button>
      )}
      {pinnedRuns.length > 0 && (
        <div style={{ marginTop: '8px', fontSize: '8px', color: 'var(--text-dim)' }}>
          Pinned runs are overlaid on the Timeline chart in the main dashboard.
        </div>
      )}
    </div>
  );
}

function MonteCarloPanel({ params, mcRuns, setMcRuns, onRun, loading, results }) {
  return (
    <div className="control-panel">
      <div className="panel-title">MONTE CARLO</div>
      <div style={{ marginBottom: '8px' }}>
        <div className="control-label">
          <span>Number of Runs</span>
          <span className="control-value">{mcRuns}</span>
        </div>
        <input type="range" className="slider"
          min={3} max={50} step={1}
          value={mcRuns}
          onChange={e => setMcRuns(+e.target.value)} />
        <div style={{ fontSize: '8px', color: 'var(--text-dim)', marginTop: '4px' }}>
          Higher N → tighter confidence bands but slower
        </div>
      </div>

      <button className="btn-run" onClick={onRun} disabled={loading}>
        {loading ? `⏳ RUNNING ${mcRuns} SIMS…` : `▶ RUN ${mcRuns}× MONTE CARLO`}
      </button>

      {results && (
        <div style={{ marginTop: '10px' }}>
          <div className="panel-title" style={{ marginTop: '6px' }}>MC SUMMARY ({results.n_runs} runs)</div>
          <div className="summary-grid">
            <MCRow label="Deaths (mean)"  value={results.summary.total_deaths_mean.toFixed(0)} color="var(--red)" />
            <MCRow label="Deaths P10–P90"
              value={`${results.summary.total_deaths_p10.toFixed(0)}–${results.summary.total_deaths_p90.toFixed(0)}`}
              color="var(--red)" />
            <MCRow label="Peak Census (mean)" value={results.summary.peak_census_mean.toFixed(0)} />
            <MCRow label="Peak Census P10–P90"
              value={`${results.summary.peak_census_p10.toFixed(0)}–${results.summary.peak_census_p90.toFixed(0)}`} />
            <MCRow label="Gridlock (mean)"
              value={`${results.summary.gridlock_hours_mean.toFixed(1)}h`}
              color={results.summary.gridlock_hours_mean > 0 ? 'var(--red)' : 'var(--green)'} />
            <MCRow label="Blood Crisis (mean)"
              value={`${results.summary.blood_crisis_hours_mean.toFixed(1)}h`}
              color={results.summary.blood_crisis_hours_mean > 0 ? 'var(--amber)' : 'var(--green)'} />
          </div>
          <div style={{ fontSize: '8px', color: 'var(--text-dim)', marginTop: '6px' }}>
            Confidence bands visible in Timeline chart when a single run is also loaded.
          </div>
        </div>
      )}
    </div>
  );
}

function MCRow({ label, value, color }) {
  return (
    <div className="sum-row">
      <span className="sum-label">{label}</span>
      <span className="sum-value" style={color ? { color } : {}}>{value}</span>
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
        <div className="feature-item"><span className="feature-icon">⊕</span>Discrete-Event Simulation (SimPy)</div>
        <div className="feature-item"><span className="feature-icon">⊕</span>Markov Chain Patient Deterioration</div>
        <div className="feature-item"><span className="feature-icon">⊕</span>NDMS/VA Back-Door Gridlock Model</div>
        <div className="feature-item"><span className="feature-icon">⊕</span>Class VIII Blood Bank / ASBP Tracking</div>
        <div className="feature-item"><span className="feature-icon">⊕</span>Staff Exhaustion &amp; AR-MEDCOM Integration</div>
        <div className="feature-item"><span className="feature-icon">⊕</span>Monte Carlo Confidence Bands (P10–P90)</div>
        <div className="feature-item"><span className="feature-icon">⊕</span>Multi-Scenario COA Comparison</div>
        <div className="feature-item"><span className="feature-icon">⊕</span>CSV / PDF Export</div>
      </div>
      <button className="btn-run-large" onClick={onRun}>▶ INITIALIZE SIMULATION</button>
    </div>
  );
}

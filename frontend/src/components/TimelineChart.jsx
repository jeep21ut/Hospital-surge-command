import React, { useState } from 'react';
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const COMPARE_COLORS = ['var(--green)', 'var(--amber)', 'var(--purple)'];

const VIEWS = {
  census: {
    label: 'CENSUS',
    series: [
      { key: 'icu',     name: 'ICU',       color: 'var(--red)',    type: 'area' },
      { key: 'ward',    name: 'Ward',      color: 'var(--blue)',   type: 'area' },
      { key: 'bh',      name: 'BH',        color: 'var(--purple)', type: 'area' },
      { key: 'waiting', name: 'Waiting',   color: 'var(--amber)',  type: 'line' },
    ],
    extract: s => ({
      t:       Math.round(s.time_hours),
      icu:     s.beds.icu_occupied,
      ward:    s.beds.ward_occupied,
      bh:      s.beds.bh_occupied,
      waiting: s.patients.waiting_for_bed,
    }),
    // MC keys for band view
    mcKeys: { mean: 'census_mean', p10: 'census_p10', p90: 'census_p90' },
    // Single compare key (total census)
    compareKey: s => s.beds.icu_occupied + s.beds.ward_occupied + s.beds.bh_occupied,
    compareLabel: 'Total Census',
  },
  patients: {
    label: 'PATIENT FLOW',
    series: [
      { key: 'rtd',    name: 'Cumul. RTD',    color: 'var(--green)', type: 'line' },
      { key: 'deaths', name: 'Cumul. Deaths', color: 'var(--red)',   type: 'line' },
      { key: 'in_sys', name: 'In System',     color: 'var(--blue)',  type: 'area' },
    ],
    extract: s => ({
      t:       Math.round(s.time_hours),
      rtd:     s.patients.cumulative_rtd,
      deaths:  s.patients.cumulative_deaths,
      in_sys:  s.patients.total_in_system,
    }),
    mcKeys: { mean: 'deaths_mean', p10: 'deaths_p10', p90: 'deaths_p90' },
    compareKey: s => s.patients.cumulative_deaths,
    compareLabel: 'Cumul. Deaths',
  },
  logistics: {
    label: 'LOGISTICS',
    series: [
      { key: 'rbc',   name: 'RBC Units',     color: 'var(--red)',   type: 'area' },
      { key: 'surg',  name: 'Surgical Sets', color: 'var(--blue)',  type: 'line' },
      { key: 'vents', name: 'Vents In Use',  color: 'var(--amber)', type: 'line' },
    ],
    extract: s => ({
      t:     Math.round(s.time_hours),
      rbc:   s.logistics.packed_rbc_units,
      surg:  Math.round(s.logistics.surgical_sets_remaining),
      vents: s.logistics.ventilators_in_use,
    }),
    mcKeys: { mean: 'rbc_mean', p10: 'rbc_p10', p90: 'rbc_p90' },
    compareKey: s => s.logistics.packed_rbc_units,
    compareLabel: 'RBC Units',
  },
  or: {
    label: 'OR / SURGICAL',
    series: [
      { key: 'active', name: 'Active ORs',   color: 'var(--green)', type: 'bar' },
      { key: 'queue',  name: 'OR Queue',     color: 'var(--red)',   type: 'line' },
      { key: 'eff',    name: 'Efficiency %', color: 'var(--blue)',  type: 'line' },
    ],
    extract: s => ({
      t:      Math.round(s.time_hours),
      active: s.or_status.procedures_active,
      queue:  s.or_status.queue_depth,
      eff:    Math.round(s.or_status.or_efficiency * 100),
    }),
    mcKeys: { mean: 'waiting_mean', p10: 'waiting_p10', p90: 'waiting_p90' },
    compareKey: s => s.or_status.queue_depth,
    compareLabel: 'OR Queue Depth',
  },
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      padding: '8px 12px', fontSize: '9px',
    }}>
      <div style={{ color: 'var(--text-secondary)', marginBottom: '4px' }}>H+{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color, marginBottom: '1px' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </div>
      ))}
    </div>
  );
};

export default function TimelineChart({ timeline, compareRuns, mcBands }) {
  const [view, setView] = useState('census');
  const def = VIEWS[view];

  const hasMC      = Array.isArray(mcBands) && mcBands.length > 0;
  const hasCompare = Array.isArray(compareRuns) && compareRuns.length > 0;

  // ── MC band chart ────────────────────────────────────────────────────────
  if (hasMC) {
    const mcData = mcBands.map(b => ({
      t:    Math.round(b.time_hours),
      mean: b[def.mcKeys.mean],
      p10:  b[def.mcKeys.p10],
      p90:  b[def.mcKeys.p90],
      band: [b[def.mcKeys.p10], b[def.mcKeys.p90]],
    }));

    return (
      <div className="panel chart-panel">
        <ViewHeader view={view} setView={setView} label={def.label} badge="MC" />
        <div style={{ height: '160px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={mcData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border-dim)" />
              <XAxis dataKey="t" tick={{ fontSize: 8, fill: 'var(--text-dim)' }}
                tickFormatter={v => `H+${v}`} />
              <YAxis tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
              <Tooltip content={<CustomTooltip />} />
              {/* P10–P90 band */}
              <Area type="monotone" dataKey="p90" name="P90"
                stroke="var(--blue)" fill="var(--blue)" fillOpacity={0.15}
                strokeWidth={1} strokeDasharray="3 3" dot={false} />
              <Area type="monotone" dataKey="p10" name="P10"
                stroke="var(--blue)" fill="var(--bg-deep)" fillOpacity={1}
                strokeWidth={1} strokeDasharray="3 3" dot={false} />
              <Line type="monotone" dataKey="mean" name="Mean"
                stroke="var(--blue)" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: '8px', color: 'var(--text-dim)', marginTop: '4px', textAlign: 'right' }}>
          Shaded band = P10–P90 across Monte Carlo runs
        </div>
      </div>
    );
  }

  // ── Comparison overlay chart ─────────────────────────────────────────────
  if (hasCompare) {
    const primaryData = timeline.map(s => ({
      t:     Math.round(s.time_hours),
      run0:  def.compareKey(s),
    }));

    // Merge compare runs — align by index (same duration assumed)
    const mergedData = primaryData.map((row, i) => {
      const merged = { ...row };
      compareRuns.forEach((run, ri) => {
        const snap = run.timeline[i];
        if (snap) merged[`run${ri + 1}`] = def.compareKey(snap);
      });
      return merged;
    });

    const allRuns = [
      { key: 'run0', label: 'Current', color: 'var(--text-primary)' },
      ...compareRuns.map((run, ri) => ({
        key:   `run${ri + 1}`,
        label: run.label || `Run ${ri + 1}`,
        color: COMPARE_COLORS[ri % COMPARE_COLORS.length],
      })),
    ];

    return (
      <div className="panel chart-panel">
        <ViewHeader view={view} setView={setView} label={def.label} badge="CMP" />
        <div style={{ height: '160px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={mergedData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="var(--border-dim)" />
              <XAxis dataKey="t" tick={{ fontSize: 8, fill: 'var(--text-dim)' }}
                tickFormatter={v => `H+${v}`} />
              <YAxis tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '8px' }} />
              {allRuns.map(r => (
                <Line key={r.key} type="monotone" dataKey={r.key} name={r.label}
                  stroke={r.color} strokeWidth={1.5} dot={false} />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: '8px', color: 'var(--text-dim)', marginTop: '4px', textAlign: 'right' }}>
          {def.compareLabel} — {allRuns.length} runs overlaid
        </div>
      </div>
    );
  }

  // ── Standard single-run chart (original behavior) ────────────────────────
  const data = timeline.map(def.extract);

  return (
    <div className="panel chart-panel">
      <ViewHeader view={view} setView={setView} label={def.label} />
      <div style={{ height: '160px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border-dim)" />
            <XAxis dataKey="t" tick={{ fontSize: 8, fill: 'var(--text-dim)' }}
              tickFormatter={v => `H+${v}`} />
            <YAxis tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
            <Tooltip content={<CustomTooltip />} />
            {def.series.map(s => {
              if (s.type === 'area') {
                return (
                  <Area key={s.key} type="monotone" dataKey={s.key} name={s.name}
                    stroke={s.color} fill={s.color} fillOpacity={0.25} strokeWidth={1.5}
                    dot={false} stackId={view === 'census' ? 'stack' : undefined} />
                );
              }
              if (s.type === 'bar') {
                return (
                  <Bar key={s.key} dataKey={s.key} name={s.name}
                    fill={s.color} fillOpacity={0.7} />
                );
              }
              return (
                <Line key={s.key} type="monotone" dataKey={s.key} name={s.name}
                  stroke={s.color} strokeWidth={1.5} dot={false} />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function ViewHeader({ view, setView, label, badge }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
      <div className="panel-title" style={{ margin: 0, border: 'none', padding: 0 }}>
        TIMELINE — {label}
        {badge && (
          <span style={{
            marginLeft: '6px', fontSize: '7px', padding: '1px 4px',
            background: 'var(--blue-dim)', border: '1px solid var(--blue)',
            borderRadius: '2px', color: 'var(--blue)',
          }}>{badge}</span>
        )}
      </div>
      <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
        {Object.entries(VIEWS).map(([key, v]) => (
          <button key={key} onClick={() => setView(key)} style={{
            padding: '3px 8px',
            background: view === key ? 'var(--blue-dim)' : 'var(--bg-deep)',
            border: `1px solid ${view === key ? 'var(--blue)' : 'var(--border)'}`,
            color: view === key ? 'var(--text-primary)' : 'var(--text-dim)',
            fontFamily: 'var(--font-mono)', fontSize: '8px',
            letterSpacing: '1px', cursor: 'pointer', borderRadius: '2px',
          }}>
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

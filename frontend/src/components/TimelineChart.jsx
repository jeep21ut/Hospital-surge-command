import React, { useState } from 'react';
import {
  ComposedChart, Line, Area, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';

const VIEWS = {
  census: {
    label: 'CENSUS',
    series: [
      { key: 'icu',  name: 'ICU',      color: 'var(--red)',   type: 'area' },
      { key: 'ward', name: 'Ward',     color: 'var(--blue)',  type: 'area' },
      { key: 'bh',   name: 'BH',       color: 'var(--purple)',type: 'area' },
      { key: 'waiting', name: 'Waiting', color: 'var(--amber)', type: 'line' },
    ],
    extract: s => ({
      t:       Math.round(s.time_hours),
      icu:     s.beds.icu_occupied,
      ward:    s.beds.ward_occupied,
      bh:      s.beds.bh_occupied,
      waiting: s.patients.waiting_for_bed,
    }),
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
  },
  logistics: {
    label: 'LOGISTICS',
    series: [
      { key: 'rbc',  name: 'RBC Units',      color: 'var(--red)',   type: 'area' },
      { key: 'surg', name: 'Surgical Sets',  color: 'var(--blue)',  type: 'line' },
      { key: 'vents',name: 'Vents In Use',   color: 'var(--amber)', type: 'line' },
    ],
    extract: s => ({
      t:     Math.round(s.time_hours),
      rbc:   s.logistics.packed_rbc_units,
      surg:  Math.round(s.logistics.surgical_sets_remaining),
      vents: s.logistics.ventilators_in_use,
    }),
  },
  or: {
    label: 'OR / SURGICAL',
    series: [
      { key: 'active',  name: 'Active ORs',    color: 'var(--green)', type: 'bar' },
      { key: 'queue',   name: 'OR Queue',       color: 'var(--red)',   type: 'line' },
      { key: 'eff',     name: 'Efficiency %',  color: 'var(--blue)',  type: 'line' },
    ],
    extract: s => ({
      t:      Math.round(s.time_hours),
      active: s.or_status.procedures_active,
      queue:  s.or_status.queue_depth,
      eff:    Math.round(s.or_status.or_efficiency * 100),
    }),
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

export default function TimelineChart({ timeline }) {
  const [view, setView] = useState('census');
  const def = VIEWS[view];

  const data = timeline
    .filter((_, i) => i % 1 === 0)
    .map(def.extract);

  return (
    <div className="panel chart-panel">
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
        <div className="panel-title" style={{ margin: 0, border: 'none', padding: 0 }}>
          TIMELINE — {def.label}
        </div>
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
          {Object.entries(VIEWS).map(([key, v]) => (
            <button
              key={key}
              onClick={() => setView(key)}
              style={{
                padding: '3px 8px',
                background: view === key ? 'var(--blue-dim)' : 'var(--bg-deep)',
                border: `1px solid ${view === key ? 'var(--blue)' : 'var(--border)'}`,
                color: view === key ? 'var(--text-primary)' : 'var(--text-dim)',
                fontFamily: 'var(--font-mono)',
                fontSize: '8px',
                letterSpacing: '1px',
                cursor: 'pointer',
                borderRadius: '2px',
              }}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ height: '160px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="var(--border-dim)" />
            <XAxis
              dataKey="t"
              tick={{ fontSize: 8, fill: 'var(--text-dim)' }}
              tickFormatter={v => `H+${v}`}
            />
            <YAxis tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
            <Tooltip content={<CustomTooltip />} />
            {def.series.map(s => {
              if (s.type === 'area') {
                return (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    fill={s.color}
                    fillOpacity={0.25}
                    strokeWidth={1.5}
                    dot={false}
                    stackId={view === 'census' ? 'stack' : undefined}
                  />
                );
              }
              if (s.type === 'bar') {
                return (
                  <Bar key={s.key} dataKey={s.key} name={s.name}
                    fill={s.color} fillOpacity={0.7} />
                );
              }
              return (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.name}
                  stroke={s.color}
                  strokeWidth={1.5}
                  dot={false}
                />
              );
            })}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

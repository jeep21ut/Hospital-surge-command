import React from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const STATE_COLORS = {
  stable:   'var(--green)',
  serious:  'var(--blue)',
  critical: 'var(--amber)',
  terminal: 'var(--purple)',
  dead:     'var(--red)',
  rtd:      '#29f0b4',
};

const STATE_LABELS = {
  stable:   'Stable',
  serious:  'Serious',
  critical: 'Critical',
  terminal: 'Terminal',
  dead:     'Dead',
  rtd:      'RTD',
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
        <div key={p.dataKey} style={{ color: p.fill || p.stroke, marginBottom: '1px' }}>
          {STATE_LABELS[p.dataKey] || p.dataKey}: {p.value}
        </div>
      ))}
    </div>
  );
};

export default function MarkovPanel({ snapshot, timeline }) {
  const mk = snapshot.markov;
  const total = Object.values(mk).reduce((s, v) => s + v, 0) || 1;

  // Chart data — every 6th point to keep chart readable
  const chartData = timeline
    .filter((_, i) => i % 2 === 0 || i === timeline.length - 1)
    .map(s => ({
      t: Math.round(s.time_hours),
      ...s.markov,
    }));

  return (
    <div className="panel chart-panel">
      <div className="panel-title">
        MARKOV PATIENT HEALTH STATE DISTRIBUTION &nbsp;—&nbsp;
        Discrete-Time Chain · Per-Hour Transitions · PCC Deterioration Model
      </div>

      {/* Current state stacked bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '4px' }}>
            CURRENT POPULATION STATE DISTRIBUTION
          </div>
          <div className="markov-bar">
            {Object.entries(mk).map(([key, val]) => {
              const pct = (val / total) * 100;
              if (pct < 0.5) return null;
              return (
                <div
                  key={key}
                  className="markov-segment"
                  style={{
                    width: `${pct}%`,
                    background: STATE_COLORS[key],
                    opacity: 0.85,
                    fontSize: '8px',
                    color: '#000',
                    fontWeight: 'bold',
                  }}
                  title={`${STATE_LABELS[key]}: ${val}`}
                >
                  {pct > 5 ? `${Math.round(pct)}%` : ''}
                </div>
              );
            })}
          </div>
          <div className="markov-legend">
            {Object.entries(STATE_COLORS).map(([key, color]) => (
              <div key={key} className="legend-item">
                <div className="legend-dot" style={{ background: color }} />
                {STATE_LABELS[key]}: {mk[key] || 0}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Area chart over time */}
      <div style={{ height: '120px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
            <XAxis
              dataKey="t"
              tick={{ fontSize: 8, fill: 'var(--text-dim)' }}
              tickFormatter={v => `H+${v}`}
            />
            <YAxis tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
            <Tooltip content={<CustomTooltip />} />
            {Object.entries(STATE_COLORS).map(([key, color]) => (
              <Area
                key={key}
                type="monotone"
                dataKey={key}
                stackId="1"
                stroke={color}
                fill={color}
                fillOpacity={0.7}
                strokeWidth={0}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

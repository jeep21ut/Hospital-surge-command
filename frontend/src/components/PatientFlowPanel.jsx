import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'var(--bg-panel)', border: '1px solid var(--border)',
      padding: '6px 10px', fontSize: '10px',
    }}>
      {payload.map(p => (
        <div key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value}
        </div>
      ))}
    </div>
  );
};

export default function PatientFlowPanel({ snapshot, timeline }) {
  const p = snapshot.patients;

  // Build category chart data
  const categories = [
    { name: 'T1 IMM',  value: p.t1_active,   fill: 'var(--red)' },
    { name: 'T2 DEL',  value: p.t2_active,   fill: 'var(--amber)' },
    { name: 'T3 MIN',  value: p.t3_active,   fill: 'var(--green)' },
    { name: 'T4 EXP',  value: p.t4_active,   fill: 'var(--purple)' },
    { name: 'DNBI',    value: p.dnbi_active,  fill: 'var(--blue)' },
  ];

  // RTD rate
  const total = p.cumulative_rtd + p.cumulative_deaths + (p.total_in_system || 1);
  const rtdRate = total > 0 ? ((p.cumulative_rtd / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="panel">
      <div className="panel-title">PATIENT FLOW & TRIAGE BREAKDOWN</div>

      {/* Top stats */}
      <div className="stats-grid">
        <div className="stat-box">
          <span className="stat-label">IN SYSTEM</span>
          <span className="stat-value" style={{ color: 'var(--blue)' }}>
            {p.total_in_system.toLocaleString()}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">WAITING BED</span>
          <span className="stat-value" style={{
            color: p.waiting_for_bed > 20 ? 'var(--red)'
                 : p.waiting_for_bed > 5  ? 'var(--amber)'
                 : 'var(--text-primary)'
          }}>
            {p.waiting_for_bed}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">CUMUL. RTD</span>
          <span className="stat-value" style={{ color: 'var(--green)' }}>
            {p.cumulative_rtd.toLocaleString()}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">CUMUL. DEATHS</span>
          <span className="stat-value" style={{ color: 'var(--red)' }}>
            {p.cumulative_deaths.toLocaleString()}
          </span>
        </div>
      </div>

      {/* RTD rate bar */}
      <div style={{ marginTop: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px' }}>
            RTD RATE
          </span>
          <span style={{ fontSize: '9px', color: 'var(--green)', fontWeight: 'bold' }}>
            {rtdRate}%
          </span>
        </div>
        <div style={{ height: '6px', background: 'var(--bg-deep)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            width: `${rtdRate}%`, height: '100%',
            background: 'var(--green)', borderRadius: '3px',
          }} />
        </div>
      </div>

      {/* Category bar chart */}
      <div style={{ marginTop: '8px', height: '80px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={categories} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 8, fill: 'var(--text-secondary)' }} />
            <YAxis tick={{ fontSize: 8, fill: 'var(--text-dim)' }} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" name="Active">
              {categories.map((c, i) => (
                <rect key={i} fill={c.fill} />
              ))}
            </Bar>
            {/* Use individual bars with correct colors */}
            {categories.map((c, i) => (
              <Bar key={i} dataKey={() => c.value} fill={c.fill} name={c.name} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

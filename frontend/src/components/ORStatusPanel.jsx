import React from 'react';

export default function ORStatusPanel({ snapshot }) {
  const or = snapshot.or_status;

  const effPct = Math.round(or.or_efficiency * 100);
  const effColor = effPct >= 75 ? 'var(--green)'
                 : effPct >= 50 ? 'var(--amber)'
                 : 'var(--red)';

  const queueColor = or.queue_depth === 0 ? 'var(--green)'
                   : or.queue_depth < 5   ? 'var(--amber)'
                   : 'var(--red)';

  return (
    <div className="panel">
      <div className="panel-title">OPERATING ROOM STATUS</div>

      {/* OR table visualisation */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px', marginBottom: '4px' }}>
          OR TABLES ({or.procedures_active} / {or.or_capacity} active)
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {Array.from({ length: or.or_capacity }).map((_, i) => (
            <div key={i} className={`or-table-cell ${i < or.procedures_active ? 'active' : 'empty'}`}>
              {i < or.procedures_active ? '⚕' : '○'}
            </div>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="stats-grid">
        <div className="stat-box">
          <span className="stat-label">OR QUEUE</span>
          <span className="stat-value" style={{ color: queueColor }}>
            {or.queue_depth}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">AVG WAIT</span>
          <span className="stat-value" style={{ color: or.avg_wait_hours > 4 ? 'var(--red)' : 'var(--text-primary)' }}>
            {or.avg_wait_hours.toFixed(1)}h
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">DCS DONE</span>
          <span className="stat-value" style={{ color: 'var(--amber)' }}>
            {or.dcs_completed}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">DEF DONE</span>
          <span className="stat-value" style={{ color: 'var(--blue)' }}>
            {or.definitive_completed}
          </span>
        </div>
      </div>

      {/* Staff efficiency */}
      <div style={{ marginTop: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px' }}>
            OR STAFF EFFICIENCY
          </span>
          <span style={{ fontSize: '9px', color: effColor, fontWeight: 'bold' }}>
            {effPct}%
          </span>
        </div>
        <div className="efficiency-meter">
          <div
            className="efficiency-fill"
            style={{
              width: `${effPct}%`,
              background: `linear-gradient(90deg, ${effColor}88, ${effColor})`,
              color: effColor,
            }}
          >
            {effPct > 20 ? `${effPct}%` : ''}
          </div>
        </div>
      </div>

      {/* Turnover time */}
      <div style={{ marginTop: '6px', fontSize: '9px', color: 'var(--text-secondary)' }}>
        Turnover: <span style={{ color: 'var(--text-primary)' }}>{or.or_turnover_hours.toFixed(1)}h</span>
        &nbsp;(base 0.5h)
        &nbsp;|&nbsp; DCS: <span style={{ color: 'var(--amber)' }}>1.5h</span>
        &nbsp;|&nbsp; DEF: <span style={{ color: 'var(--blue)' }}>3.5h</span>
      </div>
    </div>
  );
}

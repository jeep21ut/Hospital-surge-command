import React from 'react';

export default function EvacuationPanel({ snapshot }) {
  const ev = snapshot.evacuation;

  const ndmsColor = ev.ndms_slots_available > 50 ? 'var(--green)'
                  : ev.ndms_slots_available > 10 ? 'var(--amber)'
                  : 'var(--red)';
  const vaColor = ev.va_slots_available > 10 ? 'var(--green)'
                : ev.va_slots_available > 5  ? 'var(--amber)'
                : 'var(--red)';

  const intakePct = Math.round(ev.intake_multiplier * 100);

  return (
    <div className="panel">
      <div className="panel-title">BACK-DOOR EVACUATION</div>

      {/* Gridlock indicator */}
      <div className={`gridlock-indicator ${ev.gridlock_active ? 'active' : 'clear'}`}>
        {ev.gridlock_active
          ? '⚠ GRIDLOCK ACTIVE — INTAKE RESTRICTED'
          : '✓ EVACUATION FLOW NOMINAL'}
      </div>

      <div className="stats-grid" style={{ marginTop: '8px', marginBottom: '8px' }}>
        <div className="stat-box">
          <span className="stat-label">NDMS SLOTS</span>
          <span className="stat-value" style={{ color: ndmsColor }}>
            {ev.ndms_slots_available}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">VA SLOTS</span>
          <span className="stat-value" style={{ color: vaColor }}>
            {ev.va_slots_available}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">EVACUATED</span>
          <span className="stat-value" style={{ color: 'var(--blue)' }}>
            {ev.patients_evacuated_cum.toLocaleString()}
          </span>
        </div>
        <div className="stat-box">
          <span className="stat-label">INTAKE RATE</span>
          <span className="stat-value" style={{
            color: intakePct < 50 ? 'var(--red)'
                 : intakePct < 90 ? 'var(--amber)'
                 : 'var(--green)'
          }}>
            {intakePct}%
          </span>
        </div>
      </div>

      {/* Civilian displacement */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px' }}>
            CIVILIAN DISPLACEMENT
          </span>
          <span style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
            {ev.civilian_beds_freed} / 180 pts
          </span>
        </div>
        <div style={{ height: '8px', background: 'var(--bg-deep)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(100, (ev.civilian_beds_freed / 180) * 100)}%`,
            height: '100%',
            background: 'var(--blue)',
            borderRadius: '3px',
            transition: 'width 0.3s ease',
          }} />
        </div>
        <div style={{ fontSize: '8px', color: 'var(--text-dim)', marginTop: '2px' }}>
          Offloading to MultiCare / Providence / UW Medicine (PNW 90% occupied)
        </div>
      </div>
    </div>
  );
}

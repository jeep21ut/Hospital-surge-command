import React from 'react';

export default function StaffPanel({ snapshot, params }) {
  const st = snapshot.staff;

  const effPct = Math.round(st.or_efficiency * 100);
  const exhPct = Math.round(st.avg_exhaustion_pct);
  const exhColor = exhPct > 60 ? 'var(--red)'
                 : exhPct > 35 ? 'var(--amber)'
                 : 'var(--green)';
  const effColor = effPct >= 75 ? 'var(--green)'
                 : effPct >= 50 ? 'var(--amber)'
                 : 'var(--red)';

  const augETA = st.time_to_augmentees_h;
  const augArrived = st.augmentees_present > 0;

  return (
    <div className="panel">
      <div className="panel-title">HUMAN CAPITAL & SUSTAINMENT</div>

      <div className="stats-grid" style={{ marginBottom: '8px' }}>
        <div className="stat-box">
          <span className="stat-label">ACTIVE DUTY</span>
          <span className="stat-value">{st.active_duty_present}</span>
        </div>
        <div className="stat-box">
          <span className="stat-label">AR-MEDCOM AUG</span>
          <span className="stat-value" style={{ color: augArrived ? 'var(--green)' : 'var(--text-dim)' }}>
            {augArrived ? st.augmentees_present : '—'}
          </span>
        </div>
      </div>

      {/* Exhaustion meter */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px' }}>
            STAFF EXHAUSTION
          </span>
          <span style={{ fontSize: '9px', color: exhColor, fontWeight: 'bold' }}>
            {exhPct}%
          </span>
        </div>
        <div className="efficiency-meter">
          <div
            className="efficiency-fill"
            style={{
              width: `${exhPct}%`,
              background: `linear-gradient(90deg, ${exhColor}66, ${exhColor})`,
            }}
          />
          <span className="efficiency-label">exhaustion</span>
        </div>
      </div>

      {/* OR efficiency */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
          <span style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px' }}>
            SURGICAL EFFICIENCY
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
              background: `linear-gradient(90deg, ${effColor}66, ${effColor})`,
            }}
          />
          <span className="efficiency-label">of baseline</span>
        </div>
      </div>

      {/* AR-MEDCOM status */}
      <div style={{
        background: augArrived ? 'rgba(0,230,118,0.08)' : 'var(--bg-deep)',
        border: `1px solid ${augArrived ? 'var(--green-dim)' : 'var(--border-dim)'}`,
        borderRadius: '3px',
        padding: '6px',
        fontSize: '9px',
      }}>
        {augArrived ? (
          <div style={{ color: 'var(--green)', fontWeight: 'bold', letterSpacing: '1px' }}>
            ✓ AR-MEDCOM AUGMENTEES INTEGRATED<br/>
            <span style={{ color: 'var(--text-secondary)', fontWeight: 'normal' }}>
              +{st.augmentees_present} personnel on station
            </span>
          </div>
        ) : (
          <div>
            <div style={{ color: 'var(--amber)', letterSpacing: '1px', fontWeight: 'bold' }}>
              ◷ AR-MEDCOM ETA: {augETA.toFixed(0)}h
            </div>
            <div style={{ color: 'var(--text-dim)', marginTop: '2px' }}>
              Delay: D+{params.ar_medcom_delay_days} (activation + movement)
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

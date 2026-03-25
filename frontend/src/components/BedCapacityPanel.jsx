import React from 'react';

function pct(occ, cap) { return cap > 0 ? Math.min(100, (occ / cap) * 100) : 0; }

function barColor(p) {
  if (p >= 95) return 'var(--red)';
  if (p >= 85) return 'var(--amber)';
  return 'var(--green)';
}

function BedBar({ label, occupied, capacity }) {
  const p = pct(occupied, capacity);
  const color = barColor(p);
  return (
    <div className="bed-row">
      <div className="bed-header">
        <span className="bed-label">{label}</span>
        <span className="bed-count" style={{ color }}>
          {occupied} / {capacity}
        </span>
      </div>
      <div className="bed-bar-track">
        <div
          className="bed-bar-fill"
          style={{ width: `${p}%`, background: color }}
        />
        <span className="bed-bar-text" style={{ color }}>
          {p.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

export default function BedCapacityPanel({ snapshot }) {
  const b = snapshot.beds;
  const totalOcc = b.icu_occupied + b.ward_occupied + b.bh_occupied;
  const totalCap = b.icu_capacity + b.ward_capacity + b.bh_capacity;
  const overallPct = pct(totalOcc, totalCap);

  return (
    <div className="panel">
      <div className="panel-title">INPATIENT BED STATUS</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <div>
          <div style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px' }}>
            TOTAL CENSUS
          </div>
          <div style={{ fontSize: '22px', fontWeight: 'bold', color: barColor(overallPct) }}>
            {totalOcc}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>
            of {totalCap} beds
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px' }}>
            HOLDING
          </div>
          <div style={{
            fontSize: '22px', fontWeight: 'bold',
            color: b.holding_occupied > 0 ? 'var(--amber)' : 'var(--text-dim)'
          }}>
            {b.holding_occupied}
          </div>
          <div style={{ fontSize: '9px', color: 'var(--text-secondary)' }}>overflow</div>
        </div>
      </div>

      <div className="bed-bars">
        <BedBar label="ICU / CRITICAL CARE"  occupied={b.icu_occupied}  capacity={b.icu_capacity} />
        <BedBar label="MED/SURG WARD"         occupied={b.ward_occupied} capacity={b.ward_capacity} />
        <BedBar label="BEHAVIORAL HEALTH"     occupied={b.bh_occupied}  capacity={b.bh_capacity} />
      </div>

      <div style={{
        marginTop: '8px',
        fontSize: '9px',
        color: 'var(--text-dim)',
        borderTop: '1px solid var(--border-dim)',
        paddingTop: '6px',
      }}>
        MAMC Surge Capacity: 318 beds &nbsp;|&nbsp; Baseline: 210 beds
      </div>
    </div>
  );
}

import React from 'react';

function DOSBar({ label, dos, max = 30 }) {
  const pct = Math.min(100, (dos / max) * 100);
  const color = dos <= 3   ? 'var(--red)'
              : dos <= 7   ? 'var(--amber)'
              : 'var(--green)';
  return (
    <tr>
      <td>{label}</td>
      <td>
        <div style={{ width: '80px', height: '8px', background: 'var(--bg-deep)', borderRadius: '2px', overflow: 'hidden', display: 'inline-block', marginRight: '6px', verticalAlign: 'middle' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px' }} />
        </div>
      </td>
      <td style={{ color }}>{dos.toFixed(1)}d</td>
    </tr>
  );
}

export default function LogisticsPanel({ snapshot }) {
  const lg = snapshot.logistics;

  const rbc = lg.packed_rbc_units;
  const rbcColor = rbc < 40  ? 'var(--red)'
                 : rbc < 100 ? 'var(--amber)'
                 : 'var(--green)';

  const o2Color = lg.o2_mode === 'CONCENTRATOR' ? 'var(--green)'
                : lg.o2_mode === 'CYLINDER'     ? 'var(--amber)'
                : 'var(--red)';

  return (
    <div className="panel">
      <div className="panel-title">CLASS VIII LOGISTICS</div>

      {/* Blood bank highlight */}
      <div style={{
        background: lg.walking_blood_bank_active ? 'rgba(255,23,68,0.12)' : 'var(--bg-deep)',
        border: `1px solid ${lg.walking_blood_bank_active ? 'var(--red)' : 'var(--border-dim)'}`,
        borderRadius: '3px',
        padding: '8px',
        marginBottom: '8px',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: '8px', color: 'var(--text-dim)', letterSpacing: '1px' }}>
              PACKED RBCs (ASBP)
            </div>
            <div style={{ fontSize: '22px', fontWeight: 'bold', color: rbcColor }}>
              {rbc} <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>units</span>
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '8px', color: 'var(--text-dim)' }}>SHELF LIFE</div>
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>42-day FIFO</div>
            <div style={{ fontSize: '8px', color: 'var(--text-dim)', marginTop: '2px' }}>RESUPPLY</div>
            <div style={{ fontSize: '11px', color: lg.resupply_rate < 20 ? 'var(--red)' : 'var(--text-primary)' }}>
              {lg.resupply_rate.toFixed(0)} u/wk
            </div>
          </div>
        </div>
        {lg.walking_blood_bank_active && (
          <div style={{
            marginTop: '6px',
            fontSize: '9px',
            color: 'var(--red)',
            fontWeight: 'bold',
            letterSpacing: '1px',
            animation: 'pulse-red 1.5s infinite',
          }}>
            ⚠ WALKING BLOOD BANK PROTOCOL ACTIVE
          </div>
        )}
      </div>

      {/* DOS table */}
      <table className="logistics-table">
        <tbody>
          <DOSBar label="Blood (RBC)"       dos={lg.rbc_days_supply}        max={30} />
          <DOSBar label="Surgical Sets"     dos={lg.surgical_sets_dos}       max={30} />
          <tr>
            <td>Ventilators</td>
            <td />
            <td style={{ color: lg.ventilators_available < 5 ? 'var(--red)' : 'var(--green)' }}>
              {lg.ventilators_in_use} / {lg.ventilators_in_use + lg.ventilators_available}
            </td>
          </tr>
          <tr>
            <td>O₂ Mode</td>
            <td />
            <td style={{ color: o2Color }}>{lg.o2_mode}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

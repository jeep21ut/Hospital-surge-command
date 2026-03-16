import React from 'react';

const SLIDER_DEFS = [
  {
    section: 'SCENARIO',
    items: [
      { key: 'sim_duration_hours',        label: 'Sim Duration',        min: 24,   max: 720,  step: 24,  unit: 'h',  fmt: v => `${v}h` },
      { key: 'mascal_pulse_size',         label: 'MASCAL Pulse Size',   min: 0,    max: 5000, step: 50,  unit: 'pts', fmt: v => v.toLocaleString() },
      { key: 'mascal_pulse_timing_hours', label: 'MASCAL Onset',        min: 0,    max: 168,  step: 6,   unit: 'h',  fmt: v => `H+${v}` },
      { key: 'mascal_pulse_spread_hours', label: 'Pulse Duration',      min: 2,    max: 72,   step: 2,   unit: 'h',  fmt: v => `${v}h` },
      { key: 'bi_fraction',               label: 'BI Fraction (rest=DNBI)', min: 0.05, max: 0.80, step: 0.05, unit: '', fmt: v => `${Math.round(v*100)}%` },
      { key: 'pcc_delay_hours',           label: 'PCC Field Delay',     min: 0,    max: 72,   step: 2,   unit: 'h',  fmt: v => `${v}h` },
    ]
  },
  {
    section: 'LOGISTICS & A2/AD',
    items: [
      { key: 'supply_disruption_fraction',  label: 'Supply Disruption',  min: 0, max: 1, step: 0.05, unit: '', fmt: v => `${Math.round(v*100)}%` },
      { key: 'a2ad_medevac_disruption',     label: 'A2/AD MEDEVAC',      min: 0, max: 1, step: 0.05, unit: '', fmt: v => `${Math.round(v*100)}%` },
      { key: 'ndms_capacity_fraction',      label: 'NDMS Availability',  min: 0, max: 1, step: 0.05, unit: '', fmt: v => `${Math.round(v*100)}%` },
    ]
  },
  {
    section: 'PERSONNEL & TRANSITION',
    items: [
      { key: 'ar_medcom_delay_days',        label: 'AR-MEDCOM Delay',    min: 0,   max: 21,  step: 1,   unit: 'd', fmt: v => `D+${v}` },
      { key: 'civilian_displacement_days',  label: 'Civilian Displacement', min: 0.5, max: 14, step: 0.5, unit: 'd', fmt: v => `${v}d` },
      { key: 'baseline_daily_arrivals',     label: 'Baseline Daily Arrivals', min: 5, max: 200, step: 5, unit: '/d', fmt: v => `${v}/d` },
    ]
  },
];

export default function ControlPanel({ params, onChange, onRun, loading }) {
  const set = (key, val) => onChange(prev => ({ ...prev, [key]: val }));

  return (
    <div className="control-panel">
      <div className="panel-title">SIMULATION CONTROLS</div>

      {SLIDER_DEFS.map(section => (
        <div key={section.section} className="control-section">
          <div style={{
            fontSize: '8px', letterSpacing: '2px',
            color: 'var(--blue)', marginBottom: '6px', marginTop: '4px',
          }}>
            — {section.section}
          </div>
          {section.items.map(item => (
            <div key={item.key} style={{ marginBottom: '8px' }}>
              <div className="control-label">
                <span>{item.label}</span>
                <span className="control-value">{item.fmt(params[item.key])}</span>
              </div>
              <input
                type="range"
                className="slider"
                min={item.min}
                max={item.max}
                step={item.step}
                value={params[item.key]}
                onChange={e => set(item.key, parseFloat(e.target.value))}
              />
            </div>
          ))}
        </div>
      ))}

      <div className="control-section">
        <div style={{
          fontSize: '8px', letterSpacing: '2px',
          color: 'var(--blue)', marginBottom: '6px',
        }}>
          — OR CONFIGURATION
        </div>
        <div className="toggle-row">
          <span className="toggle-label">Surge OR Activation (8→10 tables)</span>
          <button
            className={`toggle ${params.or_surge_activated ? 'on' : ''}`}
            onClick={() => set('or_surge_activated', !params.or_surge_activated)}
          />
        </div>
      </div>

      <button
        className="btn-run"
        onClick={onRun}
        disabled={loading}
      >
        {loading ? '⏳ RUNNING…' : '▶ RUN SIMULATION'}
      </button>
    </div>
  );
}

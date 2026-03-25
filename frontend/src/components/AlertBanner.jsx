import React from 'react';

export default function AlertBanner({ alerts }) {
  if (!alerts || alerts.length === 0) return null;
  return (
    <div className="alert-banner">
      {alerts.map((a, i) => (
        <div key={i} className={`alert-pill ${a.level}`}>
          <span>{a.level === 'CRITICAL' ? '⚠' : a.level === 'WARNING' ? '△' : 'ℹ'}</span>
          {a.message}
        </div>
      ))}
    </div>
  );
}

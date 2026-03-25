import React, { useState, useRef } from 'react';

const STORAGE_KEY = 'mamc_scenarios';

function loadScenarios() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveScenarios(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export default function ScenarioManager({ currentParams, onLoad }) {
  const [scenarios, setScenarios] = useState(loadScenarios);
  const [nameInput, setNameInput]   = useState('');
  const fileRef = useRef(null);

  function handleSave() {
    const name = nameInput.trim() || `Scenario ${scenarios.length + 1}`;
    const updated = [
      ...scenarios,
      { id: Date.now(), name, params: currentParams, savedAt: new Date().toISOString() },
    ];
    saveScenarios(updated);
    setScenarios(updated);
    setNameInput('');
  }

  function handleDelete(id) {
    const updated = scenarios.filter(s => s.id !== id);
    saveScenarios(updated);
    setScenarios(updated);
  }

  function handleExportAll() {
    const blob = new Blob([JSON.stringify(scenarios, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url, download: 'mamc_scenarios.json',
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleExportOne(scenario) {
    const blob = new Blob([JSON.stringify(scenario, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), {
      href: url,
      download: `${scenario.name.replace(/\s+/g, '_')}.json`,
    });
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result);
        // Accept both single scenario object and array
        const incoming = Array.isArray(parsed) ? parsed : [parsed];
        const merged = [...scenarios];
        for (const s of incoming) {
          if (s.params && !merged.find(x => x.id === s.id)) {
            merged.push({ ...s, id: s.id ?? Date.now() });
          }
        }
        saveScenarios(merged);
        setScenarios(merged);
      } catch {
        alert('Invalid scenario file.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  return (
    <div className="control-panel" style={{ marginTop: '8px' }}>
      <div className="panel-title">SCENARIOS</div>

      {/* Save current */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
        <input
          type="text"
          placeholder="Scenario name…"
          value={nameInput}
          onChange={e => setNameInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSave()}
          style={{
            flex: 1, background: 'var(--bg-deep)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontFamily: 'var(--font-mono)',
            fontSize: '9px', padding: '4px 6px', borderRadius: '2px',
          }}
        />
        <button className="btn-sm" onClick={handleSave} title="Save current params">
          💾
        </button>
      </div>

      {/* Saved list */}
      {scenarios.length === 0 ? (
        <div style={{ fontSize: '9px', color: 'var(--text-dim)', marginBottom: '6px' }}>
          No saved scenarios
        </div>
      ) : (
        <div style={{ maxHeight: '160px', overflowY: 'auto', marginBottom: '6px' }}>
          {scenarios.map(s => (
            <div key={s.id} style={{
              display: 'flex', alignItems: 'center', gap: '4px',
              padding: '3px 0', borderBottom: '1px solid var(--border-dim)',
            }}>
              <span style={{
                flex: 1, fontSize: '9px', color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}
                title={`Saved: ${new Date(s.savedAt).toLocaleString()}`}>
                {s.name}
              </span>
              <button className="btn-sm" onClick={() => onLoad(s.params)} title="Load params">
                ↺
              </button>
              <button className="btn-sm" onClick={() => handleExportOne(s)} title="Export JSON">
                ↓
              </button>
              <button className="btn-sm" onClick={() => handleDelete(s.id)} title="Delete"
                style={{ color: 'var(--red)' }}>
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Import / Export all */}
      <div style={{ display: 'flex', gap: '4px' }}>
        <button className="btn-sm" style={{ flex: 1 }} onClick={handleExportAll}
          disabled={scenarios.length === 0}>
          ↓ Export All
        </button>
        <button className="btn-sm" style={{ flex: 1 }}
          onClick={() => fileRef.current?.click()}>
          ↑ Import
        </button>
        <input ref={fileRef} type="file" accept=".json"
          onChange={handleImport} style={{ display: 'none' }} />
      </div>
    </div>
  );
}

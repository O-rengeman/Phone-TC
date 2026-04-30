import React from 'react';

const FPS_OPTIONS = [
  { label: '23.976', value: 23.976, drop: false, fpsNum: 24000, fpsDen: 1001 },
  { label: '24', value: 24, drop: false, fpsNum: 24000, fpsDen: 1000 },
  { label: '25', value: 25, drop: false, fpsNum: 25000, fpsDen: 1000 },
  { label: '29.97', value: 29.97, drop: false, fpsNum: 30000, fpsDen: 1001 },
  { label: '29.97 DF', value: 29.97, drop: true, fpsNum: 30000, fpsDen: 1001 },
  { label: '30', value: 30, drop: false, fpsNum: 30000, fpsDen: 1000 },
];

interface ControlPanelProps {
  fpsIndex: number;
  setFpsIndex: (index: number) => void;
  volume: number;
  setVolume: (v: number) => void;
  outputLevel: 'mic' | 'line';
  setOutputLevel: (level: 'mic' | 'line') => void;
  outputMode: 'stereo' | 'mono-l';
  setOutputMode: (mode: 'stereo' | 'mono-l') => void;
  userBits: string;
  setUserBits: (ub: string) => void;
  autoUserBits: boolean;
  setAutoUserBits: (auto: boolean) => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  fpsIndex, setFpsIndex,
  volume, setVolume,
  outputLevel, setOutputLevel,
  outputMode, setOutputMode,
  userBits, setUserBits,
  autoUserBits, setAutoUserBits
}) => {
  return (
    <>
      {/* FPS Setting */}
      <div className="control-section">
        <label className="section-label">FRAMERATE</label>
        <div className="fps-grid-compact">
          {FPS_OPTIONS.map((opt, i) => (
            <button 
              key={opt.label}
              className={`btn-pill ${fpsIndex === i ? 'active' : ''}`}
              onClick={() => setFpsIndex(i)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Output Level Setting */}
      <div className="control-section" style={{ marginTop: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <label className="section-label">OUTPUT LEVEL</label>
          <div className="level-toggle">
            <button 
              className={outputLevel === 'mic' ? 'active' : ''} 
              onClick={() => setOutputLevel('mic')}
            >MIC (-40dB)</button>
            <button 
              className={outputLevel === 'line' ? 'active' : ''} 
              onClick={() => setOutputLevel('line')}
            >LINE</button>
          </div>
        </div>
        <div className="volume-row">
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 800 }}>LTC VOL</span>
          <input 
            type="range" 
            min="0" max="1" step="0.01" 
            value={volume} 
            onChange={e => setVolume(parseFloat(e.target.value))} 
          />
        </div>
      </div>

      {/* Advanced Settings */}
      <div className="control-section" style={{ marginTop: '16px' }}>
        <label className="section-label">ADVANCED</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div className="tool-card" style={{ padding: '12px' }}>
            <label>ROUTING</label>
            <div className="level-toggle" style={{ width: '100%' }}>
              <button 
                style={{ flex: 1 }}
                className={outputMode === 'stereo' ? 'active' : ''} 
                onClick={() => setOutputMode('stereo')}
              >L/R</button>
              <button 
                style={{ flex: 1 }}
                className={outputMode === 'mono-l' ? 'active' : ''} 
                onClick={() => setOutputMode('mono-l')}
              >LTC:L MIC:R</button>
            </div>
          </div>
          <div className="tool-card" style={{ padding: '12px' }}>
            <label>USER BITS</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <input 
                type="checkbox" 
                checked={autoUserBits} 
                onChange={(e) => setAutoUserBits(e.target.checked)} 
              />
              <span style={{ fontSize: '0.6rem' }}>AUTO (DATE)</span>
            </div>
            <input 
              type="text" 
              value={userBits}
              disabled={autoUserBits}
              onChange={e => setUserBits(e.target.value.replace(/[^0-9A-Fa-f]/g, '').slice(0, 8))}
              style={{ 
                width: '100%', 
                background: 'rgba(0,0,0,0.3)', 
                border: '1px solid var(--border)', 
                color: 'var(--text)',
                padding: '4px',
                fontFamily: 'var(--font-mono)',
                textAlign: 'center',
                opacity: autoUserBits ? 0.5 : 1
              }}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export { FPS_OPTIONS };

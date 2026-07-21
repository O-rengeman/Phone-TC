import { FPS_OPTIONS } from '../constants';
import type { TallyState } from '../utils/tally';

interface HeaderBarProps {
  isRunning: boolean;
  isPreparing: boolean;
  syncMode: string;
  fpsIndex: number;
  batteryLevel: number | null;
  isCharging: boolean;
  batteryEta: number | null;
  tallyOpen: boolean;
  tallyState: TallyState;
  isHost: boolean;
  lang: 'en' | 'ja';
  setLang: (l: 'en' | 'ja' | ((prev: 'en' | 'ja') => 'en' | 'ja')) => void;
  setShowGuide: (v: boolean) => void;
  setDirectorPanelOpen: (v: boolean) => void;
  setIsVisualSlate: (v: boolean) => void;
  setTallyOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  tr: (key: string) => string;
}

export function HeaderBar({
  isRunning,
  isPreparing,
  syncMode,
  fpsIndex,
  batteryLevel,
  isCharging,
  batteryEta,
  tallyOpen,
  tallyState,
  isHost,
  lang,
  setLang,
  setShowGuide,
  setDirectorPanelOpen,
  setIsVisualSlate,
  setTallyOpen: setTallyOpenState,
  tr,
}: HeaderBarProps) {
  return (
    <header>
      <div className="logo-area">
        <div className="logo">LTC SYNC PRO</div>
        <div className="version">v1.3</div>
      </div>
      <div className="header-right">
        <div className="hdr-status">
          <div className={`status-pill ${isRunning ? 'live' : isPreparing ? 'prep' : 'idle'}`}>
            <span className="status-dot" />
            {isRunning ? tr('status.live') : isPreparing ? tr('status.syncing') : tr('status.ready')}
          </div>
          <div className="status-meta">
            <span>{FPS_OPTIONS[fpsIndex].label}</span>
            <span className="status-meta-sep">·</span>
            <span>{syncMode.toUpperCase()}</span>
          </div>
          {batteryLevel !== null && (
            <div className={`batt-chip ${batteryLevel <= 0.15 && !isCharging ? 'low' : ''}`}>
              <span className="batt-pct">{isCharging ? '⚡' : ''}{Math.round(batteryLevel * 100)}%</span>
              {!isCharging && isRunning && batteryEta !== null && (
                <span className="batt-eta">{batteryEta.toFixed(0)}s</span>
              )}
            </div>
          )}
        </div>
        <div className="hdr-divider" />
        <div className="hdr-actions">
          <button
            type="button"
            className={`hdr-tally-btn ${tallyOpen ? 'active' : ''}`}
            onClick={() => { setDirectorPanelOpen(false); setIsVisualSlate(false); setTallyOpenState((v: boolean) => !v); }}
            aria-label="タリーランプを開く"
            title="TALLY"
          >
            <span 
              className="hdr-tally-dot" 
              style={{ 
                background: tallyState === 'live' ? '#ff2222' : tallyState === 'preview' ? '#22cc55' : tallyState === 'standby' ? '#ff9900' : '#333' 
              }} 
            />
            TALLY
          </button>
          {isHost && (
            <button
              type="button"
              className="hdr-director-btn"
              onClick={() => { setTallyOpenState(false); setIsVisualSlate(false); setDirectorPanelOpen(true); }}
              aria-label="ディレクターパネルを開く"
              title="DIRECTOR"
            >
              DIR
            </button>
          )}
          <button
            type="button"
            className="lang-btn"
            onClick={() => setLang((l: 'en' | 'ja') => (l === 'en' ? 'ja' : 'en'))}
            aria-label="Toggle language"
            title="Language"
          >
            {lang === 'en' ? '日本語' : 'EN'}
          </button>
          <button
            type="button"
            className="help-btn"
            onClick={() => setShowGuide(true)}
            aria-label={tr('guide.aria')}
            title={tr('guide.aria')}
          >
            ?
          </button>
        </div>
      </div>
    </header>
  );
}
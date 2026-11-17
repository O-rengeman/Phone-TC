import { useEffect, useState } from 'react';
import { FPS_OPTIONS, APP_VERSION } from '../constants';
import { formatDuration } from '../utils/battery';

interface HeaderBarProps {
  isRunning: boolean;
  isPreparing: boolean;
  syncMode: string;
  fpsIndex: number;
  batteryLevel: number | null;
  isCharging: boolean;
  batteryEta: number | null;
  lang: 'en' | 'ja';
  setLang: (l: 'en' | 'ja' | ((prev: 'en' | 'ja') => 'en' | 'ja')) => void;
  setShowGuide: (v: boolean) => void;
  tr: (key: string) => string;
  onOpenPreflight?: () => void;
}

export function HeaderBar({
  isRunning,
  isPreparing,
  syncMode,
  fpsIndex,
  batteryLevel,
  isCharging,
  batteryEta,
  lang,
  setLang,
  setShowGuide,
  tr,
  onOpenPreflight,
}: HeaderBarProps) {
  const [isOnline, setIsOnline] = useState(() => (typeof navigator !== 'undefined' ? navigator.onLine : true));

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return (
    <header>
      <div className="logo-area">
        <div className="logo">LTC SYNC PRO</div>
        <div className="version">v{APP_VERSION}</div>
      </div>
      <div className="header-right">
        <div className="hdr-status">
          {!isOnline && (
            <div className="offline-chip" style={{ background: '#d32f2f', color: '#fff', padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }}>
              {tr('status.offline')}
            </div>
          )}
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
                <span className="batt-eta">{formatDuration(batteryEta)}</span>
              )}
            </div>
          )}
        </div>
        <div className="hdr-divider" />
        <div className="hdr-actions">
          {onOpenPreflight && <button type="button" className="preflight-open" onClick={onOpenPreflight}>{tr('preflight.open')}</button>}
          <button
            type="button"
            className="lang-btn"
            onClick={() => setLang((l: 'en' | 'ja') => (l === 'en' ? 'ja' : 'en'))}
            aria-label={tr('lang.toggle')}
            title={tr('lang.label')}
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
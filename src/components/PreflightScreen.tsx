import { useEffect, useRef } from 'react';
import { useLTC } from '../LTCSyncContext';
import { useMasterDrift } from '../masterDriftContext';
import { useVuMeter } from '../hooks/useVuMeter';
import { getPreflightChecks } from '../utils/preflight';
import type { PreflightState } from '../utils/preflight';
import { effectiveOutputVolume } from '../utils/audioLevel';
import type { OutputLevel } from '../utils/audioLevel';
import { formatDuration } from '../utils/battery';
import './preflight.css';

interface PreflightScreenProps {
  state: PreflightState;
  outputLevel: OutputLevel;
  batteryEta: number | null;
  tr: (key: string, vars?: Record<string, string | number>) => string;
  onClose: () => void;
  /** Mobile renders the checklist as an edge-to-edge sheet (v2 chrome). */
  isMobile?: boolean;
}

/** The dialog only observes the generator; closing it never stops LTC. */
export function PreflightScreen({ state, outputLevel, batteryEta, tr, onClose, isMobile = false }: PreflightScreenProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const checks = getPreflightChecks(state);
  const passed = checks.filter(c => c.ok).length;
  const ready = passed === checks.length;
  const outputDb = 20 * Math.log10(effectiveOutputVolume(state.volume, outputLevel));

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    dialog?.showModal();
    return () => {
      dialog?.close();
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
    };
  }, []);

  return (
    <dialog ref={dialogRef} className={`preflight-dialog${isMobile ? ' preflight-v2' : ''}`} aria-labelledby="preflight-title" onCancel={onClose}>
      <div className="preflight-heading">
        <div>
          <p className="preflight-eyebrow">PREFLIGHT / LTC SYNC PRO</p>
          <h1 id="preflight-title">{tr('preflight.title')}</h1>
        </div>
        <button type="button" className="preflight-close" onClick={onClose} aria-label={tr('preflight.close')}>×</button>
      </div>
      <div className={`preflight-summary ${ready ? 'is-ok' : 'is-problem'}`} role="status" aria-live="polite">
        <span className="preflight-summary-icon" aria-hidden="true">{ready ? '✓' : '!'}</span>
        <div>
          <h2>{tr(ready ? 'preflight.ready' : 'preflight.problem')}</h2>
          <p>{tr('preflight.count', { passed, total: checks.length })}</p>
        </div>
      </div>
      <p className="preflight-intro">{tr('preflight.intro')}</p>
      <ul className="preflight-checks">
        {checks.map(check => (
          <li key={check.id} className={`preflight-check ${check.ok ? 'is-ok' : 'is-problem'}`}>
            <span className="preflight-check-icon" aria-hidden="true">{check.ok ? '✓' : '!'}</span>
            <div className="preflight-check-copy">
              <h3>{tr(`preflight.${check.id}`)}</h3>
              {check.id === 'output' && <p className="preflight-reading">{outputLevel.toUpperCase()} · {Math.round(state.volume * 100)}% · {Number.isFinite(outputDb) ? outputDb.toFixed(1) : '−∞'} dBFS</p>}
              {check.id === 'battery' && state.batteryLevel !== null && <p className="preflight-reading">{Math.round(state.batteryLevel * 100)}%{!state.isCharging && batteryEta !== null ? ` · ${tr('preflight.remaining', { time: formatDuration(batteryEta) })}` : ''}</p>}
              <p>{tr(check.detail)}</p>
            </div>
            <span className="preflight-badge">{tr(check.ok ? 'preflight.pass' : 'preflight.check')}</span>
          </li>
        ))}
      </ul>
      <p className="preflight-note">{tr('preflight.hardwareNote')}</p>
      <button type="button" className="preflight-return" onClick={onClose}>{tr('preflight.return')}</button>
    </dialog>
  );
}

export function LivePreflightScreen({ onClose }: { onClose: () => void }) {
  const ltc = useLTC();
  // masterDrift lives on its own context (heartbeat-rate updates) — pull it
  // in explicitly so the sync check still sees the live value.
  const masterDrift = useMasterDrift();
  const { isClipping, hasInputMeter } = useVuMeter(ltc.analyserRef, ltc.isRunning, ltc.outputMode);
  return <PreflightScreen
    state={{ ...ltc, masterDrift, isClipping, hasInputMeter }}
    outputLevel={ltc.outputLevel}
    batteryEta={ltc.batteryEta}
    tr={ltc.tr}
    onClose={onClose}
    isMobile={ltc.isMobile}
  />;
}

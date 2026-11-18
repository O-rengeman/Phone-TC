import { useLTC } from '../../LTCSyncContext';
import { DesktopPanel } from './DesktopPanel';
import { useActivityLog, clearActivityLog } from '../../utils/activityLog';
import type { ActivityEntry } from '../../utils/activityLog';
import { formatP2pStatus } from '../../utils/p2pStatus';
import './activityPane.css';

function entryText(entry: ActivityEntry, tr: (k: string, v?: Record<string, string | number>) => string, lang: 'en' | 'ja'): string {
  // P2P entries store the machine status string; it is localized at render
  // time so a mid-session language switch still reads correctly.
  if (entry.kind === 'p2p' && entry.vars?.status !== undefined) {
    return formatP2pStatus(String(entry.vars.status), lang);
  }
  return tr(`log.${entry.kind}`, entry.vars);
}

/**
 * The session activity log: every transport action, marker stamp, sync-mode
 * change, P2P transition and re-jam warning, newest first. It answers the
 * question an operator actually has between setups — "when did that happen?"
 * — without scrolling three panes.
 *
 * The list is a polite live region so a screen reader hears each event as it
 * lands; rows carry a `dtv2-kind-*` hook so the stylesheet can rail the few
 * kinds an operator must not miss (re-jam, transport start) without
 * colouring the whole log.
 */
export function ActivityPane() {
  const { tr, lang } = useLTC();
  const entries = useActivityLog();

  return (
    <div className="dt-pane dt-pane-activity">
      <DesktopPanel
        title={tr('dtab.activity')}
        aside={
          <>
            <span className="dt-count">{entries.length}</span>
            {entries.length > 0 && (
              <button type="button" className="dt-btn-sm" onClick={clearActivityLog}>
                {tr('log.clear')}
              </button>
            )}
          </>
        }
        scroll
      >
        {entries.length === 0 ? (
          <div className="dt-empty">
            <strong>{tr('log.empty')}</strong>
            <span>{tr('log.emptyHint')}</span>
          </div>
        ) : (
          <ul
            className="dt-log"
            role="log"
            aria-live="polite"
            aria-relevant="additions"
            aria-label={tr('dtab.activity')}
          >
            {entries.map(entry => (
              <li key={entry.id} className={`dtv2-kind-${entry.kind}`}>
                <span className="dt-mono dt-log-time">
                  {new Date(entry.at).toLocaleTimeString(lang === 'ja' ? 'ja-JP' : 'en-US', { hour12: false })}
                </span>
                <span className="dt-log-text">
                  {entry.kind === 'marker' && entry.vars?.color !== undefined && (
                    <span className={`dt-marker-dot ${String(entry.vars.color).toLowerCase()}`} />
                  )}
                  {entryText(entry, tr, lang)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </DesktopPanel>
    </div>
  );
}

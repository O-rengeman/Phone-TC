import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  helpStepKeys,
  helpSummaryKey,
  helpTipKeys,
  helpTitleKey,
  parseHelpText,
} from '../utils/helpTopics';
import type { HelpTopicId } from '../utils/helpTopics';

interface HelpButtonProps {
  topic: HelpTopicId;
  /**
   * Injected rather than read from the LTC context, because some of the hosts
   * (MarkerList, the mobile sections) are deliberately context-free and take
   * their translator as a prop — a context dependency here would drag the
   * whole provider into their tests.
   */
  tr: (key: string) => string;
  /** `inline` sits next to a section label; `panel` sits in a panel header. */
  variant?: 'panel' | 'inline';
}

function HelpLine({ text }: { text: string }) {
  return (
    <>
      {parseHelpText(text).map((segment, i) => (
        segment.kind === 'control'
          ? <b key={i} className="fhelp-ctl">{segment.text}</b>
          : <span key={i}>{segment.text}</span>
      ))}
    </>
  );
}

/**
 * A "?" next to a feature that opens step-by-step instructions for it.
 *
 * The sheet is portalled to the body rather than rendered in place: several of
 * these sit inside panels that clip their overflow (and inside the switcher,
 * which is itself an overlay), so an in-place dialog would be cut off exactly
 * where it is most needed.
 */
export function HelpButton({ topic, tr, variant = 'panel' }: HelpButtonProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const label = tr('help.open');

  return (
    <>
      <button
        type="button"
        className={`fhelp-btn fhelp-btn-${variant}`}
        onClick={() => setOpen(true)}
        aria-label={`${label}: ${tr(helpTitleKey(topic))}`}
        title={label}
      >
        ?
      </button>

      {open && createPortal(
        <div className="fhelp-overlay" onClick={() => setOpen(false)} role="presentation">
          <div
            className="fhelp-sheet"
            onClick={event => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={tr(helpTitleKey(topic))}
          >
            <header className="fhelp-head">
              <div>
                <span className="fhelp-eyebrow">{label}</span>
                <h2 className="fhelp-title">{tr(helpTitleKey(topic))}</h2>
              </div>
              <button
                type="button"
                className="fhelp-x"
                onClick={() => setOpen(false)}
                aria-label={tr('help.close')}
              >
                ✕
              </button>
            </header>

            <p className="fhelp-summary">{tr(helpSummaryKey(topic))}</p>

            <ol className="fhelp-steps">
              {helpStepKeys(topic).map(key => (
                <li key={key}><HelpLine text={tr(key)} /></li>
              ))}
            </ol>

            <div className="fhelp-tips">
              {helpTipKeys(topic).map(key => (
                <p key={key} className="fhelp-tip"><HelpLine text={tr(key)} /></p>
              ))}
            </div>

            <button type="button" className="fhelp-done" onClick={() => setOpen(false)}>
              {tr('btn.gotIt')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

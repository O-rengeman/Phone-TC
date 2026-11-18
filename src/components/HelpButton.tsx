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
import { shouldUseMobileLayout } from '../utils/layout';
import { MobilePager } from './mobile/MobilePager';

interface HelpButtonProps {
  topic: HelpTopicId;
  /**
   * Injected rather than read from the LTC context, because some of the hosts
   * (MarkerList, the mobile sections) are deliberately context-free and take
   * their translator as a prop — a context dependency here would drag the
   * whole provider into their tests.
   */
  tr: (key: string, vars?: Record<string, string | number>) => string;
  /** `inline` sits next to a section label; `panel` sits in a panel header. */
  variant?: 'panel' | 'inline';
}

/** Steps shown per page in the mobile (no-scroll) sheet. */
const MOBILE_STEPS_PER_PAGE = 3;

/**
 * The same mobile-layout rule as LTCSyncContext's getIsMobileLayout, computed
 * locally so this context-free component stays context-free.
 */
function detectMobileLayout(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  const hasCoarsePointer = typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  return shouldUseMobileLayout({
    width: window.innerWidth,
    height: window.innerHeight,
    hasTouchInput: navigator.maxTouchPoints > 0 || hasCoarsePointer,
  });
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
 *
 * On mobile the fixed-height sheet cannot scroll, so the steps are paged —
 * each page keeps the summary plus up to MOBILE_STEPS_PER_PAGE steps, and the
 * closing tips ride on the last page.
 */
export function HelpButton({ topic, tr, variant = 'panel' }: HelpButtonProps) {
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [isMobile, setIsMobile] = useState(detectMobileLayout);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onResize = () => setIsMobile(detectMobileLayout());
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
    };
  }, [open]);

  const label = tr('help.open');
  const stepKeys = helpStepKeys(topic);
  const tipKeys = helpTipKeys(topic);
  const pageCount = Math.ceil(stepKeys.length / MOBILE_STEPS_PER_PAGE);
  const currentPage = Math.min(page, pageCount - 1);
  const pageSteps = stepKeys.slice(
    currentPage * MOBILE_STEPS_PER_PAGE,
    currentPage * MOBILE_STEPS_PER_PAGE + MOBILE_STEPS_PER_PAGE,
  );
  const isLastPage = currentPage >= pageCount - 1;

  return (
    <>
      <button
        type="button"
        className={`fhelp-btn fhelp-btn-${variant}`}
        onClick={() => {
          // Re-detect layout and restart at page 1 on every open.
          setPage(0);
          setIsMobile(detectMobileLayout());
          setOpen(true);
        }}
        aria-label={`${label}: ${tr(helpTitleKey(topic))}`}
        title={label}
      >
        ?
      </button>

      {open && createPortal(
        <div className="fhelp-overlay fhelp-overlay-v2" onClick={() => setOpen(false)} role="presentation">
          <div
            className={`fhelp-sheet fhelp-sheet-v2${isMobile ? ' fhelp-sheet-v3' : ''}`}
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

            {isMobile ? (
              <>
                <div className="fhelp-pages">
                  <p className="fhelp-summary">{tr(helpSummaryKey(topic))}</p>
                  <ol className="fhelp-steps" start={currentPage * MOBILE_STEPS_PER_PAGE + 1}>
                    {pageSteps.map(key => (
                      <li key={key}><HelpLine text={tr(key)} /></li>
                    ))}
                  </ol>
                  {isLastPage && (
                    <div className="fhelp-tips">
                      {tipKeys.map(key => (
                        <p key={key} className="fhelp-tip"><HelpLine text={tr(key)} /></p>
                      ))}
                    </div>
                  )}
                </div>
                <MobilePager page={currentPage} pageCount={pageCount} onPage={setPage} tr={tr} />
                <button type="button" className="fhelp-done" onClick={() => setOpen(false)}>
                  {tr('btn.gotIt')}
                </button>
              </>
            ) : (
              <>
                <p className="fhelp-summary">{tr(helpSummaryKey(topic))}</p>

                <ol className="fhelp-steps">
                  {stepKeys.map(key => (
                    <li key={key}><HelpLine text={tr(key)} /></li>
                  ))}
                </ol>

                <div className="fhelp-tips">
                  {tipKeys.map(key => (
                    <p key={key} className="fhelp-tip"><HelpLine text={tr(key)} /></p>
                  ))}
                </div>

                <button type="button" className="fhelp-done" onClick={() => setOpen(false)}>
                  {tr('btn.gotIt')}
                </button>
              </>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

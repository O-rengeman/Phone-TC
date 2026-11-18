/**
 * MobilePager — the shared "1 / N" page switcher for the no-scroll mobile UI.
 *
 * Every surface that cannot fit its content on one fixed-height screen
 * (sub-tab panes, the guide sheet, the feature-help sheet, the preflight
 * sheet) pages with this instead of scrolling: prev / status / next, with
 * the edge buttons disabled at the bounds. `pageCount <= 1` renders nothing
 * so callers can drop it in unconditionally.
 *
 * Styling lives in src/mobile-shell.css (.mobile-pager / .mobile-page-btn /
 * .mobile-page-status); the class set is part of the shared mobile contract.
 */
export interface MobilePagerProps {
  /** Zero-based current page (clamped for display). */
  page: number;
  /** Total pages; <=1 renders null. */
  pageCount: number;
  /** Called with the requested zero-based page. */
  onPage: (page: number) => void;
  tr: (key: string, vars?: Record<string, string | number>) => string;
  className?: string;
}

export function MobilePager({ page, pageCount, onPage, tr, className }: MobilePagerProps) {
  if (pageCount <= 1) return null;
  const current = Math.min(Math.max(page, 0), pageCount - 1);
  return (
    <div className={['mobile-pager', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="mobile-page-btn mobile-page-prev"
        onClick={() => onPage(current - 1)}
        disabled={current <= 0}
        aria-label={tr('pager.prev')}
      >
        ‹
      </button>
      <span className="mobile-page-status" role="status" aria-live="polite">
        {tr('pager.status', { page: current + 1, total: pageCount })}
      </span>
      <button
        type="button"
        className="mobile-page-btn mobile-page-next"
        onClick={() => onPage(current + 1)}
        disabled={current >= pageCount - 1}
        aria-label={tr('pager.next')}
      >
        ›
      </button>
    </div>
  );
}

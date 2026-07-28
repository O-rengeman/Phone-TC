import type { ReactNode } from 'react';

interface DesktopPanelProps {
  title: string;
  /** Optional right-aligned status text or control in the panel header. */
  aside?: ReactNode;
  /** Lets one panel in a pane absorb the leftover height. */
  grow?: boolean;
  /**
   * Allows this panel's body to scroll internally. Reserved for genuinely
   * unbounded content (marker list, connected cameras) — everything else must
   * fit, since the console as a whole never scrolls.
   */
  scroll?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * The single card primitive every desktop pane is built from: a labelled
 * header and a body. Having one of these rather than per-pane markup is what
 * keeps the five panes visually identical and stops each new section from
 * inventing its own spacing.
 */
export function DesktopPanel({ title, aside, grow, scroll, className, children }: DesktopPanelProps) {
  const classes = [
    'dt-panel',
    grow ? 'dt-panel-grow' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <section className={classes}>
      <header className="dt-panel-head">
        <h2 className="dt-panel-title">{title}</h2>
        {aside && <div className="dt-panel-aside">{aside}</div>}
      </header>
      <div className={`dt-panel-body ${scroll ? 'dt-scroll' : ''}`}>
        {children}
      </div>
    </section>
  );
}

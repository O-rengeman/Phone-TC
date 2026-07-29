import type { ReactNode } from 'react';

import { useLTC } from '../../LTCSyncContext';
import { HelpButton } from '../HelpButton';
import type { HelpTopicId } from '../../utils/helpTopics';

interface DesktopSectionProps {
  title: string;
  children: ReactNode;
}

/**
 * A titled block inside a panel.
 *
 * The console gives each grid slot exactly one panel, so groups that used to
 * be separate stacked panels live here instead — same visual grouping, but
 * the boxes stay one per slot and therefore all the same size.
 */
export function DesktopSection({ title, children }: DesktopSectionProps) {
  return (
    <section className="dt-section">
      <h3 className="dt-section-title">{title}</h3>
      {children}
    </section>
  );
}

interface DesktopPanelProps {
  title: string;
  /**
   * Puts a "?" next to the title that opens step-by-step instructions for this
   * feature. Set it on the panel an operator would look at first on each tab,
   * not on every panel — a console covered in question marks reads as noise.
   */
  help?: HelpTopicId;
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
export function DesktopPanel({ title, help, aside, grow, scroll, className, children }: DesktopPanelProps) {
  // The only reason this presentational primitive touches the context: the
  // help sheet needs a translator, and threading one through every pane's
  // panel would be five identical props for one shared concern.
  const { tr } = useLTC();
  const classes = [
    'dt-panel',
    grow ? 'dt-panel-grow' : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <section className={classes}>
      <header className="dt-panel-head">
        <h2 className="dt-panel-title">
          {title}
          {help && <HelpButton topic={help} tr={tr} />}
        </h2>
        {aside && <div className="dt-panel-aside">{aside}</div>}
      </header>
      <div className={`dt-panel-body ${scroll ? 'dt-scroll' : ''}`}>
        {children}
      </div>
    </section>
  );
}

import { useLTC } from '../../LTCSyncContext';
import { DirectorPanel } from '../DirectorPanel';
import type { DirectorPanelProps } from '../DirectorPanel';

export type SwitcherControls = Omit<DirectorPanelProps, 'embedded'>;

/**
 * Hosts the switcher inside the console. The panel itself is the same
 * component the fullscreen DIR button opens — only its framing differs — so
 * the two surfaces can never drift apart in behaviour.
 */
export function SwitcherPane(props: SwitcherControls) {
  const { isHost, tr } = useLTC();

  if (!isHost) {
    return (
      <div className="dt-pane dt-pane-switcher">
        <div className="dt-empty dt-empty-full">
          <strong>{tr('dt.hostOnly')}</strong>
          <span>{tr('dt.hostOnlyHint')}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dt-pane dt-pane-switcher">
      <DirectorPanel {...props} embedded />
    </div>
  );
}

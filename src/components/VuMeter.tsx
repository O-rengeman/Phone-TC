import { useLTC } from '../LTCSyncContext';
import { useVuMeter } from '../hooks/useVuMeter';

/**
 * Mic input level bar + clip badge for mono-L output mode.
 * Reads analyserRef straight from context and runs its own RAF loop via
 * useVuMeter, so its per-frame re-renders stay isolated to this component.
 */
export function VuMeter() {
  const { analyserRef, isRunning, outputMode } = useLTC();
  const { vuLevel, isClipping } = useVuMeter(analyserRef, isRunning, outputMode);

  return (
    <div className="vu-meter-row">
      <div className="vu-bar-track vu-meter-track">
        <div className="vu-bar-fill" style={{ width: `${Math.min(vuLevel * 120, 100)}%` }} />
      </div>
      <span className={`vu-clip-badge ${isClipping ? '' : 'hidden'}`}>
        CLIP
      </span>
    </div>
  );
}

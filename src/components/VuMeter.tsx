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
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%' }}>
      <div className="vu-bar-track" style={{ flex: 1 }}>
        <div className="vu-bar-fill" style={{ width: `${Math.min(vuLevel * 120, 100)}%` }} />
      </div>
      {isClipping && (
        <span className="vu-clip-badge" style={{ background: '#ff3b30', color: '#fff', fontSize: '0.75rem', fontWeight: 'bold', padding: '2px 6px', borderRadius: '3px' }}>
          CLIP
        </span>
      )}
    </div>
  );
}

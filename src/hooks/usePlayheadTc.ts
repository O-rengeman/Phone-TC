import { useEffect, useState } from 'react';

/**
 * Playhead refresh for the live timeline strip — the live TC lives in refs by
 * design (no per-frame context state), so it is polled. 125ms pairs with the
 * 120ms `transition: left` on .mtl-dot so the strip glides instead of jumping.
 */
export const PLAYHEAD_POLL_MS = 125;

/**
 * Polls `getTc` on a plain window.setInterval and returns the latest string.
 * The getter is called once on mount so the playhead appears immediately,
 * then again every `intervalMs` (default PLAYHEAD_POLL_MS).
 *
 * An interval — not requestAnimationFrame — is used deliberately: rAF pauses
 * in backgrounded tabs, but the timeline must keep sampling the ref-backed TC
 * even when the app is not visible, matching the existing poll design.
 */
export function usePlayheadTc(getTc: () => string, intervalMs: number = PLAYHEAD_POLL_MS): string {
  const [tc, setTc] = useState('');

  useEffect(() => {
    const tick = () => setTc(getTc());
    tick();
    const id = window.setInterval(tick, intervalMs);
    return () => window.clearInterval(id);
  }, [getTc, intervalMs]);

  return tc;
}

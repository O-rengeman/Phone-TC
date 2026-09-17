import { useEffect } from 'react';

/**
 * Resumes a suspended AudioContext when the app returns to the foreground.
 *
 * Mobile browsers suspend the audio graph while the app is backgrounded, and
 * on return the context can stay `suspended` even though the UI is live again
 * — the timecode keeps counting on screen while nothing comes out of the
 * headphone jack, which is the worst possible failure on a set because it
 * looks like everything is fine. There is already a resume for the native
 * audio-interruption callback (see LTCSyncContext); this covers the plain
 * web path, where no interruption event is delivered at all.
 *
 * Safe to run unconditionally: resuming a running context is a no-op.
 */
export function useAudioContextRecovery(
  audioCtxRef: React.RefObject<AudioContext | null>,
  isActive: boolean,
): void {
  useEffect(() => {
    if (!isActive) return;

    const resumeIfSuspended = () => {
      const ctx = audioCtxRef.current;
      if (!ctx || ctx.state !== 'suspended') return;
      ctx.resume().catch((err: unknown) =>
        console.warn('AudioContext resume on foreground failed', err));
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') resumeIfSuspended();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    // Desktop browsers and some Android WebViews suspend on blur without
    // ever flipping visibilityState, so focus is watched as well.
    window.addEventListener('focus', resumeIfSuspended);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', resumeIfSuspended);
    };
  }, [audioCtxRef, isActive]);
}

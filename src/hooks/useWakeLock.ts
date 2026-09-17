import { useEffect, useRef } from 'react';

/**
 * Holds a screen wake lock while `isRunning` is true, releasing it whenever
 * playback stops or the component unmounts. No-ops silently in browsers
 * without Screen Wake Lock API support.
 *
 * iOS and Android revoke the lock as soon as the app is backgrounded or the
 * screen locks, and never hand it back on return — so the lock is also
 * re-requested whenever the app becomes visible again while still running.
 * Without that, checking a message mid-take is enough to let the display
 * sleep for the rest of the shoot.
 */
export function useWakeLock(isRunning: boolean): void {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

    const release = () => {
      const lock = wakeLockRef.current;
      wakeLockRef.current = null;
      lock?.release().catch(() => {});
    };

    if (!supported || !isRunning) {
      release();
      return;
    }

    let cancelled = false;

    const acquire = () => {
      // A sentinel the OS already revoked is still referenced here but no
      // longer holds anything, so it must not block a fresh request.
      if (wakeLockRef.current && !wakeLockRef.current.released) return;

      navigator.wakeLock.request('screen').then((lock) => {
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        wakeLockRef.current = lock;
      }).catch((err: unknown) => console.warn('Wake Lock error', err));
    };

    acquire();

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') acquire();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      release();
    };
  }, [isRunning]);
}

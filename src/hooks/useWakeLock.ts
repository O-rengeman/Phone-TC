import { useEffect, useRef, useState } from 'react';

export type WakeLockStatus = 'unsupported' | 'inactive' | 'requesting' | 'active' | 'released' | 'error';

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
export function useWakeLock(isRunning: boolean): WakeLockStatus {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
  const [status, setStatus] = useState<WakeLockStatus>(supported ? 'inactive' : 'unsupported');

  useEffect(() => {
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
    let pending = false;

    const acquire = () => {
      // A sentinel the OS already revoked is still referenced here but no
      // longer holds anything, so it must not block a fresh request.
      if (pending || (wakeLockRef.current && !wakeLockRef.current.released)) return;
      pending = true;

      navigator.wakeLock.request('screen').then((lock) => {
        if (cancelled) {
          lock.release().catch(() => {});
          return;
        }
        wakeLockRef.current = lock;
        setStatus(lock.released ? 'released' : 'active');
        lock.addEventListener('release', () => {
          if (!cancelled && wakeLockRef.current === lock) setStatus('released');
        }, { once: true });
      }).catch((err: unknown) => {
        if (!cancelled) setStatus('error');
        console.warn('Wake Lock error', err);
      }).finally(() => { pending = false; });
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
      setStatus('inactive');
    };
  }, [isRunning, supported]);

  return !supported ? 'unsupported' : !isRunning ? 'inactive' : status === 'inactive' ? 'requesting' : status;
}

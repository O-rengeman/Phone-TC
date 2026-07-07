import { useEffect, useRef } from 'react';

/**
 * Holds a screen wake lock while `isRunning` is true, releasing it whenever
 * playback stops or the component unmounts. No-ops silently in browsers
 * without Screen Wake Lock API support.
 */
export function useWakeLock(isRunning: boolean): void {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (isRunning && typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      navigator.wakeLock.request('screen').then((lock) => {
        wakeLockRef.current = lock;
      }).catch((err: unknown) => console.warn('Wake Lock error', err));
    } else {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    }
    return () => {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [isRunning]);
}

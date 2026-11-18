import { useEffect, useRef } from 'react';

import { useLTC } from '../../LTCSyncContext';
import { logActivity } from '../../utils/activityLog';

/**
 * useActivityRecorder.ts — turns context state transitions into activity-log
 * entries. It lives in DesktopShell (mounted for the whole desktop session)
 * and diffs the previous render's snapshot against the current one, so no
 * producer code has to know the log exists.
 *
 * Deliberately conservative about noise: P2P status strings are deduped
 * against the last logged value, and only transitions (not levels) are
 * recorded — a held heartbeat never spams the log.
 */
export function useActivityRecorder(): void {
  const {
    isRunning, isPaused, syncMode, p2pStatus, driftStatus, markers,
  } = useLTC();

  const prevRef = useRef({
    isRunning: false,
    isPaused: false,
    syncMode: '',
    p2pStatus: '',
    rejam: false,
    markerIds: new Set<number>(),
    seeded: false,
  });

  useEffect(() => {
    const prev = prevRef.current;

    // First run only seeds the snapshot — logging "TC STOP" for a session
    // that was never started would be noise.
    if (!prev.seeded) {
      prev.seeded = true;
      prev.isRunning = isRunning;
      prev.isPaused = isPaused;
      prev.syncMode = syncMode;
      prev.p2pStatus = p2pStatus;
      prev.rejam = !!driftStatus?.rejamRecommended;
      prev.markerIds = new Set(markers.map(m => m.id));
      return;
    }

    // Transport transitions. Pause lands as isPaused rising while the engine
    // is already stopped, so it is checked before the plain stop case.
    if (!prev.isRunning && isRunning) {
      logActivity('transportStart');
    } else if (prev.isRunning && !isRunning && isPaused && !prev.isPaused) {
      logActivity('transportPause');
    } else if (prev.isRunning && !isRunning && !isPaused) {
      logActivity('transportStop');
    }

    if (syncMode !== prev.syncMode && prev.syncMode !== '') {
      logActivity('syncMode', { mode: syncMode.toUpperCase() });
    }

    if (p2pStatus !== prev.p2pStatus && p2pStatus) {
      logActivity('p2p', { status: p2pStatus });
    }

    const rejam = !!driftStatus?.rejamRecommended;
    if (rejam && !prev.rejam) {
      logActivity('rejam');
    }

    // Markers: anything whose id we haven't seen is a fresh stamp. Iterating
    // newest-first keeps same-tick bursts in drop order.
    for (const m of markers) {
      if (!prev.markerIds.has(m.id)) {
        logActivity('marker', { tc: m.tc, color: m.color });
      }
    }

    prev.isRunning = isRunning;
    prev.isPaused = isPaused;
    prev.syncMode = syncMode;
    prev.p2pStatus = p2pStatus;
    prev.rejam = rejam;
    prev.markerIds = new Set(markers.map(m => m.id));
  }, [isRunning, isPaused, syncMode, p2pStatus, driftStatus, markers]);
}

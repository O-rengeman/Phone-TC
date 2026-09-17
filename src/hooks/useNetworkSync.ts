import { useState, useEffect } from 'react';
import { TimeSync } from '../utils/TimeSync';
import type { LtcEngine } from '../utils/LtcEngine';
import type { DriftMonitor, DriftStatus } from '../utils/DriftMonitor';
import { t as translate } from '../utils/i18n';
import type { Lang } from '../utils/i18n';
import { FPS_OPTIONS } from '../constants';
import type { SyncMode } from '../LTCSyncContext';

type ToastLevel = 'info' | 'warn' | 'error';
type SyncStatus = { offset: number; latency: number } | null;

const NETWORK_SYNC_INTERVAL_MS = 30000;
const DRIFT_TICK_MS = 1000;
// Correction thresholds: ~1 frame at 30fps, or the NTP offset itself moved
// by 33ms since the last applied correction.
const OFFSET_DELTA_THRESHOLD_MS = 33;
const DRIFT_THRESHOLD_SEC = 0.033;

interface UseNetworkSyncParams {
  syncMode: SyncMode;
  isRunning: boolean;
  p2pRole: 'master' | 'client' | null;
  fpsIndex: number;
  outputOffset: number;
  engineRef: React.RefObject<LtcEngine | null>;
  driftMonitorRef: React.RefObject<DriftMonitor>;
  lastNetworkOffsetRef: React.RefObject<number | null>;
  applySyncToWorklet: (masterTcStr: string, oneWayLatencyMs: number, isMasterRunning: boolean) => void;
  langRef: React.RefObject<Lang>;
  addToast: (msg: string, level?: ToastLevel) => void;
}

interface UseNetworkSyncResult {
  syncStatus: SyncStatus;
  setSyncStatus: React.Dispatch<React.SetStateAction<SyncStatus>>;
  driftStatus: DriftStatus | null;
  setDriftStatus: React.Dispatch<React.SetStateAction<DriftStatus | null>>;
  isResyncing: boolean;
  handleManualResync: () => Promise<void>;
}

/**
 * Owns periodic NTP-style time sync (while syncMode === 'network' and
 * running), the drift-status polling display, and the manual "resync now"
 * action. setSyncStatus/setDriftStatus are still exposed because
 * startSequence/stopEngine (in the main provider, pending the useLtcEngine
 * extraction) also need to update them at start/stop time.
 */
export function useNetworkSync({
  syncMode,
  isRunning,
  p2pRole,
  fpsIndex,
  outputOffset,
  engineRef,
  driftMonitorRef,
  lastNetworkOffsetRef,
  applySyncToWorklet,
  langRef,
  addToast,
}: UseNetworkSyncParams): UseNetworkSyncResult {
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(null);
  const [driftStatus, setDriftStatus] = useState<DriftStatus | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);

  useEffect(() => {
    if (syncMode !== 'network' || !isRunning) return;

    const interval = setInterval(async () => {
      try {
        const result = await TimeSync.sync(1);
        setSyncStatus(result);
        driftMonitorRef.current.addSync(result.offset);
        const engine = engineRef.current;
        if (!engine || p2pRole === 'master') return;

        const lastOffset = lastNetworkOffsetRef.current;
        const offsetDelta = lastOffset !== null ? Math.abs(result.offset - lastOffset) : Infinity;
        const targetTc = engine.getTimecodeForOffset(result.offset);
        const driftSec = engine.getDiffSeconds(targetTc);
        const shouldCorrect = offsetDelta >= OFFSET_DELTA_THRESHOLD_MS || driftSec >= DRIFT_THRESHOLD_SEC;

        if (shouldCorrect) {
          applySyncToWorklet(targetTc, 0, true);
          engine.syncWithOffset(result.offset);
          lastNetworkOffsetRef.current = result.offset;
        }
      } catch (e) {
        console.warn('Background sync failed', e);
      }
    }, NETWORK_SYNC_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [syncMode, isRunning, p2pRole, applySyncToWorklet, driftMonitorRef, engineRef, lastNetworkOffsetRef]);

  useEffect(() => {
    if (syncMode !== 'network' || !isRunning) return;
    const fps = FPS_OPTIONS[fpsIndex].value;
    const tick = () => setDriftStatus(driftMonitorRef.current.getStatus(fps));
    tick();
    const id = setInterval(tick, DRIFT_TICK_MS);
    return () => clearInterval(id);
  }, [syncMode, isRunning, fpsIndex, driftMonitorRef]);

  const handleManualResync = async () => {
    if (syncMode !== 'network') return;
    setIsResyncing(true);
    try {
      const result = await TimeSync.sync();
      setSyncStatus(result);
      driftMonitorRef.current.addSync(result.offset);
      const engine = engineRef.current;
      if (engine && p2pRole !== 'master') {
        const frameMs = 1000 / FPS_OPTIONS[fpsIndex].value;
        engine.syncWithOffset(result.offset + (outputOffset * frameMs));
        lastNetworkOffsetRef.current = result.offset;
        if (isRunning) {
          applySyncToWorklet(engine.getTimecodeForOffset(result.offset), 0, true);
        }
      }
      addToast(translate('toast.resynced', langRef.current), 'info');
    } catch {
      addToast(translate('toast.resyncFailed', langRef.current), 'error');
    } finally {
      setIsResyncing(false);
    }
  };

  return { syncStatus, setSyncStatus, driftStatus, setDriftStatus, isResyncing, handleManualResync };
}

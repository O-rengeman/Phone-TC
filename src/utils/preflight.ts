import { CLIENT_DRIFT_WARN_SEC } from '../constants';
import { isClientDrifting, isClientOffline } from './clients';
import type { ClientStatLike } from './clients';
import type { DriftStatus } from './DriftMonitor';
import type { SyncMode } from '../LTCSyncContext';
import type { WakeLockStatus } from '../hooks/useWakeLock';

export interface PreflightState {
  isRunning: boolean;
  volume: number;
  outputMode: 'stereo' | 'mono-l';
  isClipping: boolean;
  hasInputMeter: boolean;
  batteryLevel: number | null;
  isCharging: boolean;
  syncMode: SyncMode;
  syncStatus: { offset: number; latency: number } | null;
  driftStatus: DriftStatus | null;
  isPreparing: boolean;
  isResyncing: boolean;
  p2pRole: 'master' | 'client' | null;
  p2pStatus: string;
  p2pSyncSource: 'manual' | 'network';
  masterDrift: number | null;
  clients: Record<string, ClientStatLike>;
  nowTick: number;
  wakeLockStatus: WakeLockStatus;
}

export interface PreflightCheck {
  id: 'output' | 'clipping' | 'battery' | 'sync' | 'wake';
  ok: boolean;
  detail: string;
}

/** Unknown/unavailable measurements never count as a pass. Local clock modes
 * are valid choices, but are explicitly labelled as NOT externally synced. */
export function getPreflightChecks(s: PreflightState): PreflightCheck[] {
  const outputOk = s.isRunning && Number.isFinite(s.volume) && s.volume > 0 && s.volume <= 1;
  const clipMeasured = s.isRunning && (s.outputMode === 'stereo' || s.hasInputMeter);
  const batteryKnown = s.batteryLevel !== null && Number.isFinite(s.batteryLevel)
    && s.batteryLevel >= 0 && s.batteryLevel <= 1;
  const batteryOk = batteryKnown && (s.isCharging || s.batteryLevel! > 0.20);
  const networkKnown = s.syncStatus !== null
    && Number.isFinite(s.syncStatus.offset) && Number.isFinite(s.syncStatus.latency);
  let syncOk = false;
  let syncDetail = 'preflight.syncMissing';
  if (s.isPreparing || s.isResyncing) {
    syncDetail = 'preflight.syncBusy';
  } else if (s.syncMode === 'system' || s.syncMode === 'freerun') {
    syncOk = true;
    syncDetail = s.syncMode === 'system' ? 'preflight.syncSystem' : 'preflight.syncFree';
  } else if (s.syncMode === 'network') {
    syncOk = networkKnown && !!s.driftStatus?.hasSync && !s.driftStatus.rejamRecommended;
    syncDetail = syncOk ? 'preflight.syncNetwork' : 'preflight.syncMissing';
  } else if (s.p2pRole === 'client') {
    syncOk = /^(SYNCED|OK) \(/.test(s.p2pStatus) && s.masterDrift !== null
      && Number.isFinite(s.masterDrift) && Math.abs(s.masterDrift) < CLIENT_DRIFT_WARN_SEC;
    syncDetail = syncOk ? 'preflight.syncClient' : 'preflight.syncPeerProblem';
  } else if (s.p2pRole === 'master') {
    const peers = Object.values(s.clients);
    syncOk = peers.length > 0 && peers.every(c => Number.isFinite(c.drift)
      && Number.isFinite(c.lastSeen) && !isClientOffline(c, s.nowTick) && !isClientDrifting(c.drift))
      && (s.p2pSyncSource === 'manual' || networkKnown);
    syncDetail = syncOk ? 'preflight.syncMaster' : 'preflight.syncPeerProblem';
  }
  return [
    { id: 'output', ok: outputOk, detail: !s.isRunning ? 'preflight.outputStopped' : outputOk ? 'preflight.outputReady' : 'preflight.outputMuted' },
    { id: 'clipping', ok: clipMeasured && !s.isClipping, detail: !clipMeasured ? 'preflight.clipUnknown' : s.isClipping ? 'preflight.clipDetected' : s.outputMode === 'stereo' ? 'preflight.clipGenerated' : 'preflight.clipClear' },
    { id: 'battery', ok: batteryOk, detail: !batteryKnown ? 'preflight.batteryUnknown' : s.isCharging ? 'preflight.batteryCharging' : batteryOk ? 'preflight.batteryReady' : 'preflight.batteryLow' },
    { id: 'sync', ok: syncOk, detail: syncDetail },
    { id: 'wake', ok: s.wakeLockStatus === 'active', detail: `preflight.wake.${s.wakeLockStatus}` },
  ];
}

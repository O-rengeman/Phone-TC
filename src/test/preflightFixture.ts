import type { PreflightState } from '../utils/preflight';
import { DriftMonitor } from '../utils/DriftMonitor';

const now = 100_000;
const drift = new DriftMonitor();
drift.addSync(4, now);
export const healthyPreflight: PreflightState = {
  isRunning: true, volume: 0.5, outputMode: 'stereo', isClipping: false,
  hasInputMeter: false, batteryLevel: 0.8, isCharging: false,
  syncMode: 'network', syncStatus: { offset: 4, latency: 12 },
  driftStatus: drift.getStatus(25, now), isPreparing: false, isResyncing: false,
  p2pRole: null, p2pStatus: '', p2pSyncSource: 'manual', masterDrift: null,
  clients: {}, nowTick: now, wakeLockStatus: 'active',
};

import { describe, expect, it } from 'vitest';
import { getPreflightChecks } from './preflight';
import type { PreflightState } from './preflight';
import { healthyPreflight } from '../test/preflightFixture';

const now = 100_000;
const check = (id: string, patch: Partial<PreflightState>) =>
  getPreflightChecks({ ...healthyPreflight, ...patch }).find(c => c.id === id)!;

describe('preflight readiness', () => {
  it('passes all five only when every check is healthy', () => {
    expect(getPreflightChecks(healthyPreflight).every(c => c.ok)).toBe(true);
    expect(getPreflightChecks(healthyPreflight)).toHaveLength(5);
  });

  it.each([0, NaN, Infinity, -0.1, 1.1])('fails muted/invalid output volume %s', volume => {
    expect(check('output', { volume }).ok).toBe(false);
  });

  it('does not pass stopped output or unmeasured clipping', () => {
    expect(check('output', { isRunning: false }).ok).toBe(false);
    expect(check('clipping', { isRunning: false }).detail).toBe('preflight.clipUnknown');
    expect(check('clipping', { outputMode: 'mono-l' }).ok).toBe(false);
    expect(check('clipping', { outputMode: 'mono-l', hasInputMeter: true }).ok).toBe(true);
    expect(check('clipping', { outputMode: 'mono-l', hasInputMeter: true, isClipping: true }).detail).toBe('preflight.clipDetected');
  });

  it.each([null, NaN, -1, 2])('does not pass unknown/invalid battery %s even on power', batteryLevel => {
    expect(check('battery', { batteryLevel, isCharging: true }).detail).toBe('preflight.batteryUnknown');
  });

  it('treats 20% as low, and passes known charging batteries', () => {
    expect(check('battery', { batteryLevel: 0.2 }).ok).toBe(false);
    expect(check('battery', { batteryLevel: 0.21 }).ok).toBe(true);
    expect(check('battery', { batteryLevel: 0.1, isCharging: true }).detail).toBe('preflight.batteryCharging');
    expect(check('battery', { batteryLevel: 0.1, isCharging: true }).ok).toBe(true);
  });

  it('does not pass missing, stale or pending network sync', () => {
    for (const patch of [
      { syncStatus: null }, { syncStatus: { offset: NaN, latency: 12 } },
      { syncStatus: { offset: 4, latency: 12, fromCache: true } },
      { driftStatus: null }, { driftStatus: { ...healthyPreflight.driftStatus!, hasSync: false } },
      { driftStatus: { ...healthyPreflight.driftStatus!, rejamRecommended: true } },
      { isPreparing: true }, { isResyncing: true },
    ]) expect(check('sync', patch).ok).toBe(false);
    expect(check('sync', { syncStatus: { offset: 4, latency: 12, fromCache: true } }).detail).toBe('preflight.syncCached');
  });

  it.each(['system', 'freerun'] as const)('labels %s explicitly as local-only', syncMode => {
    const result = check('sync', { syncMode, syncStatus: null });
    expect(result.ok).toBe(true);
    expect(result.detail).toBe(syncMode === 'system' ? 'preflight.syncSystem' : 'preflight.syncFree');
  });

  it('requires fresh peer reports and below-threshold absolute drift on a master', () => {
    const master: Partial<PreflightState> = { syncMode: 'p2p', p2pRole: 'master', clients: { camera: { drift: 0.01, rtt: 10, lastSeen: now } } };
    expect(check('sync', master).ok).toBe(true);
    expect(check('sync', { ...master, clients: {} }).ok).toBe(false);
    for (const stat of [
      { drift: -0.03, lastSeen: now }, { drift: NaN, lastSeen: now },
      { drift: 0, lastSeen: now - 30_001 }, { drift: 0, lastSeen: NaN },
    ]) expect(check('sync', { ...master, clients: { camera: { ...stat, rtt: 10 } } }).ok).toBe(false);
    expect(check('sync', { ...master, p2pSyncSource: 'network', syncStatus: null }).ok).toBe(false);
  });

  it('requires a synced client, not just a peer connection or old drift', () => {
    const client: Partial<PreflightState> = { syncMode: 'p2p', p2pRole: 'client', p2pStatus: 'OK (HB)', masterDrift: 0.01 };
    expect(check('sync', client).ok).toBe(true);
    expect(check('sync', { ...client, p2pStatus: 'SYNCED (RTT 10ms / MIN 10ms)' }).ok).toBe(true);
    for (const p2pStatus of ['CONNECTED TO master', 'MASTER TIMEOUT', 'RECONNECTING...', 'CONNECTION CLOSED', 'SKIP (bad RTT 5001ms)']) {
      expect(check('sync', { ...client, p2pStatus }).ok).toBe(false);
    }
    for (const masterDrift of [null, NaN, -0.03, 0.03]) expect(check('sync', { ...client, masterDrift }).ok).toBe(false);
    expect(check('sync', { syncMode: 'p2p' }).ok).toBe(false);
  });

  it.each(['unsupported', 'inactive', 'requesting', 'released', 'error'] as const)('never passes a %s wake lock', wakeLockStatus => {
    expect(check('wake', { wakeLockStatus }).ok).toBe(false);
  });
});

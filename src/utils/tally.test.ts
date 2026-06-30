import { describe, it, expect } from 'vitest';
import {
  resolveTally,
  adoptTally,
  tallyTorchOn,
  tallyLabelKey,
  TALLY_COLORS,
  type TallyPayload,
} from './tally';

const payload = (rev: number, all: TallyPayload['all'], assignments: TallyPayload['assignments'] = {}): TallyPayload =>
  ({ rev, all, assignments });

describe('resolveTally', () => {
  it('uses the per-camera assignment when connected', () => {
    const p = payload(1, 'standby', { CAM2: 'live', CAM3: 'preview' });
    expect(resolveTally(p, 'CAM2', { connected: true, autoMode: false, selfIsRunning: false })).toBe('live');
    expect(resolveTally(p, 'CAM3', { connected: true, autoMode: false, selfIsRunning: false })).toBe('preview');
  });

  it('falls back to the `all` default when no assignment for this id', () => {
    const p = payload(1, 'standby', { CAM2: 'live' });
    expect(resolveTally(p, 'CAM9', { connected: true, autoMode: false, selfIsRunning: false })).toBe('standby');
  });

  it('AUTO derives live/standby from local LTC when not connected', () => {
    expect(resolveTally(null, 'X', { connected: false, autoMode: true, selfIsRunning: true })).toBe('live');
    expect(resolveTally(null, 'X', { connected: false, autoMode: true, selfIsRunning: false })).toBe('standby');
  });

  it('is off when standalone and AUTO is disabled', () => {
    expect(resolveTally(null, 'X', { connected: false, autoMode: false, selfIsRunning: true })).toBe('off');
  });

  it('ignores a payload when not connected (standalone wins)', () => {
    const p = payload(5, 'live', { X: 'live' });
    expect(resolveTally(p, 'X', { connected: false, autoMode: false, selfIsRunning: false })).toBe('off');
    expect(resolveTally(p, 'X', { connected: false, autoMode: true, selfIsRunning: false })).toBe('standby');
  });

  it('standalone MANUAL returns the explicit manualState', () => {
    expect(resolveTally(null, 'X', { connected: false, autoMode: false, selfIsRunning: false, manualState: 'live' })).toBe('live');
    expect(resolveTally(null, 'X', { connected: false, autoMode: false, selfIsRunning: false, manualState: 'preview' })).toBe('preview');
  });

  it('connected but no payload yet falls through to standalone rules', () => {
    expect(resolveTally(null, 'X', { connected: true, autoMode: true, selfIsRunning: true })).toBe('live');
    expect(resolveTally(null, 'X', { connected: true, autoMode: false, selfIsRunning: true })).toBe('off');
  });
});

describe('adoptTally', () => {
  it('keeps the newer payload by rev', () => {
    const a = payload(1, 'standby');
    const b = payload(2, 'live');
    expect(adoptTally(a, b)).toBe(b);
    expect(adoptTally(b, a)).toBe(b);
  });

  it('adopts equal rev (latest wins on tie)', () => {
    const a = payload(3, 'standby');
    const b = payload(3, 'live');
    expect(adoptTally(a, b)).toBe(b);
  });

  it('handles null current / incoming', () => {
    const a = payload(1, 'live');
    expect(adoptTally(null, a)).toBe(a);
    expect(adoptTally(a, null)).toBe(a);
    expect(adoptTally(null, null)).toBeNull();
  });
});

describe('helpers', () => {
  it('torch on only for live', () => {
    expect(tallyTorchOn('live')).toBe(true);
    expect(tallyTorchOn('preview')).toBe(false);
    expect(tallyTorchOn('standby')).toBe(false);
    expect(tallyTorchOn('off')).toBe(false);
  });

  it('label key + colors exist for every state', () => {
    for (const s of ['live', 'preview', 'standby', 'off'] as const) {
      expect(tallyLabelKey(s)).toBe(`tally.${s}`);
      expect(TALLY_COLORS[s]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });
});

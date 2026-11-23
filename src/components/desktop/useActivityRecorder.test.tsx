import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useActivityRecorder } from './useActivityRecorder';
import { clearActivityLog, getActivityEntries } from '../../utils/activityLog';

const state = vi.hoisted(() => ({
  isRunning: false,
  isPaused: false,
  syncMode: 'ltc',
  p2pStatus: '',
  driftStatus: null as { rejamRecommended: boolean } | null,
  markers: [] as { id: number; tc: string; color: string }[],
}));

vi.mock('../../LTCSyncContext', () => ({
  useLTC: () => state,
}));

function kinds(): string[] {
  return getActivityEntries().map(e => e.kind);
}

describe('useActivityRecorder transport logging', () => {
  beforeEach(() => {
    state.isRunning = false;
    state.isPaused = false;
    state.syncMode = 'ltc';
    state.p2pStatus = '';
    state.driftStatus = null;
    state.markers = [];
    clearActivityLog();
  });

  it('logs transportStart when the engine starts from idle', () => {
    const { rerender } = renderHook(() => useActivityRecorder());
    state.isRunning = true;
    rerender();
    expect(kinds()).toEqual(['transportStart']);
  });

  it('logs transportResume (not a second start) when resuming from pause', () => {
    const { rerender } = renderHook(() => useActivityRecorder());
    state.isRunning = true;
    rerender();
    state.isRunning = false;
    state.isPaused = true;
    rerender();
    state.isRunning = true;
    state.isPaused = false;
    rerender();
    // Newest first: resume, pause, start.
    expect(kinds()).toEqual(['transportResume', 'transportPause', 'transportStart']);
  });

  it('logs transportStop when stopping out of pause', () => {
    const { rerender } = renderHook(() => useActivityRecorder());
    state.isRunning = true;
    rerender();
    state.isRunning = false;
    state.isPaused = true;
    rerender();
    state.isPaused = false;
    rerender();
    // The engine never rises again, but the stop must still be recorded.
    expect(kinds()).toEqual(['transportStop', 'transportPause', 'transportStart']);
  });
});

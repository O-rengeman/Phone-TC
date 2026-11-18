import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMarkers } from './useMarkers';
import type { LtcEngine } from '../utils/LtcEngine';
import type { Lang } from '../utils/i18n';
import { DriftMonitor } from '../utils/DriftMonitor';

// vi.mock factories are hoisted above regular const declarations — anything
// referenced inside one must be created via vi.hoisted() or the factory
// closes over a stale/undefined binding.
const { isNativePlatform, writeFile } = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => false),
  writeFile: vi.fn<(...args: unknown[]) => Promise<undefined>>(() => Promise.resolve(undefined)),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => isNativePlatform() },
}));

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: { writeFile: (...args: unknown[]) => writeFile(...args) },
  Directory: { Documents: 'DOCUMENTS' },
  Encoding: { UTF8: 'utf8' },
}));

function makeEngineRef(tc = '01:00:00:00') {
  return { current: { getTimecodeString: () => tc } as unknown as LtcEngine };
}

function makeParams(overrides: Partial<Parameters<typeof useMarkers>[0]> = {}) {
  return {
    engineRef: makeEngineRef(),
    fpsIndex: 2, // 25fps per FPS_OPTIONS
    defaultReelName: 'A001',
    sceneName: '001',
    langRef: { current: 'en' as Lang },
    addToast: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
  isNativePlatform.mockReturnValue(false);
  writeFile.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useMarkers', () => {
  it.each(['exportToFCPXML', 'exportToResolve', 'exportToCSV', 'exportToOTIO'] as const)('%s saves, skips empty logs and reports save failures', async action => {
    isNativePlatform.mockReturnValue(true);
    const addToast = vi.fn();
    const { result } = renderHook(() => useMarkers(makeParams({ addToast })));
    act(() => result.current[action]());
    expect(writeFile).not.toHaveBeenCalled();
    act(() => result.current.addMarker('Red'));
    await act(async () => { result.current[action](); await Promise.resolve(); });
    const suffix = { exportToFCPXML: '.fcpxml', exportToResolve: '_resolve_markers.edl', exportToCSV: '.csv', exportToOTIO: '.otio' }[action];
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: expect.stringContaining(suffix) as unknown as string }));
    if (action === 'exportToCSV') expect((writeFile.mock.calls[0][0] as { data: string }).data.charCodeAt(0)).toBe(0xFEFF);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    writeFile.mockRejectedValueOnce(new Error('disk full'));
    await act(async () => { result.current[action](); await Promise.resolve(); });
    expect(addToast).toHaveBeenLastCalledWith(expect.any(String), 'error');
  });


  it('does not log stopped heartbeat drift or an age until a P2P sync is applied', () => {
    const lastSyncRef = { current: 0 };
    const { result } = renderHook(() => useMarkers(makeParams({ syncMode: 'p2p', p2pDriftSeconds: 0.012, p2pLastSyncRef: lastSyncRef })));
    act(() => result.current.addMarker('Red'));
    expect(result.current.markers[0].sync).toEqual({ method: 'p2p', driftMs: null, driftFrames: null, msSinceSync: null, confidence: 'none' });
    lastSyncRef.current = Date.now() - 1000;
    act(() => result.current.addMarker('Blue'));
    expect(result.current.markers[0].sync).toMatchObject({ method: 'p2p', driftMs: 12, driftFrames: 0.3 });
    expect(result.current.markers[0].sync?.msSinceSync).toBeGreaterThanOrEqual(1000);
    lastSyncRef.current = 0;
    act(() => result.current.addMarker('Green'));
    expect(result.current.markers[0].sync?.msSinceSync).toBeNull();
    expect(result.current.markers[0].sync?.driftMs).toBeNull();
  });
  it('snapshots current mode and measured P2P seconds in milliseconds without changing earlier takes', () => {
    const { result, rerender } = renderHook(({ mode, drift }: { mode: 'p2p' | 'system'; drift: number | null }) => useMarkers(makeParams({ syncMode: mode, p2pDriftSeconds: drift, p2pLastSyncRef: { current: Date.now() - 1000 } })), { initialProps: { mode: 'p2p', drift: 0.01234 } });
    act(() => result.current.addMarker('Red'));
    const first = result.current.markers[0];
    expect(first.sync).toMatchObject({ method: 'p2p', driftMs: 12.34, driftFrames: 0.309, confidence: 'none' });
    rerender({ mode: 'system', drift: null });
    act(() => result.current.addMarker('Blue'));
    expect(result.current.markers[0].sync).toEqual({ method: 'system', driftMs: null, driftFrames: null, msSinceSync: null, confidence: 'none' });
    expect(first.sync?.driftMs).toBe(12.34);
  });

  it('reads the live monitor after a stopped resync without a state update, using current time and fps', () => {
    vi.useFakeTimers();
    const monitor = new DriftMonitor();
    const { result, rerender } = renderHook(({ fpsIndex }) => useMarkers(makeParams({ driftMonitorRef: { current: monitor }, fpsIndex })), { initialProps: { fpsIndex: 2 } });
    act(() => result.current.addMarker('Red'));
    expect(result.current.markers[0].sync?.driftMs).toBeNull();
    monitor.addSync(10);
    vi.setSystemTime(Date.now() + 41152);
    rerender({ fpsIndex: 5 });
    act(() => result.current.addMarker('Red'));
    expect(result.current.markers[0].sync).toEqual({ method: 'network', driftMs: 1.235, driftFrames: 0.037, msSinceSync: 41152, confidence: 'medium' });
    monitor.reset();
    act(() => result.current.addMarker('Blue'));
    expect(result.current.markers[0].sync?.driftMs).toBeNull();
    expect(result.current.markers[0].sync?.confidence).toBe('none');
    vi.useRealTimers();
  });
  it('starts empty when localStorage has no saved markers', () => {
    const { result } = renderHook(() => useMarkers(makeParams()));
    expect(result.current.markers).toEqual([]);
  });

  it('restores markers from localStorage on init', () => {
    localStorage.setItem('ltc-markers', JSON.stringify([
      { id: 1, tc: '00:00:01:00', time: 't', color: 'Red', reelName: 'A001', take: 1, sceneName: '001', comment: '' },
    ]));
    const { result } = renderHook(() => useMarkers(makeParams()));
    expect(result.current.markers).toHaveLength(1);
  });

  it('falls back to empty array when localStorage JSON is malformed', () => {
    localStorage.setItem('ltc-markers', '{not json');
    const { result } = renderHook(() => useMarkers(makeParams()));
    expect(result.current.markers).toEqual([]);
  });

  it('addMarker prepends a new marker using the engine timecode and increments take', () => {
    const { result } = renderHook(() => useMarkers(makeParams({ engineRef: makeEngineRef('01:02:03:04') })));

    act(() => result.current.addMarker('Red'));

    expect(result.current.markers).toHaveLength(1);
    expect(result.current.markers[0]).toMatchObject({
      tc: '01:02:03:04', color: 'Red', reelName: 'A001', take: 1, sceneName: '001', comment: '',
    });

    act(() => result.current.addMarker('Blue'));
    expect(result.current.markers).toHaveLength(2);
    expect(result.current.markers[0].take).toBe(2); // newest prepended, take incremented
    expect(result.current.markers[1].take).toBe(1);
  });

  it('addMarker falls back to 00:00:00:00 when the engine ref is empty', () => {
    const { result } = renderHook(() => useMarkers(makeParams({ engineRef: { current: null } })));
    act(() => result.current.addMarker('Green'));
    expect(result.current.markers[0].tc).toBe('00:00:00:00');
  });

  it('addMarker sets a transient markerFlash that clears after the timeout', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useMarkers(makeParams()));

    act(() => result.current.addMarker('Yellow'));
    expect(result.current.markerFlash).toMatchObject({ color: 'Yellow' });

    act(() => { vi.advanceTimersByTime(1300); });
    expect(result.current.markerFlash).toBeNull();
    vi.useRealTimers();
  });

  it('removeMarker deletes the marker with the matching id', () => {
    const { result } = renderHook(() => useMarkers(makeParams()));
    act(() => result.current.addMarker('Red'));
    const id = result.current.markers[0].id;

    act(() => result.current.removeMarker(id));
    expect(result.current.markers).toHaveLength(0);
  });

  it('updateMarkerComment updates only the targeted marker', () => {
    // addMarker ids come from Date.now(); back-to-back calls in the same test
    // tick can collide on the same millisecond, so force distinct values.
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    const { result } = renderHook(() => useMarkers(makeParams()));
    act(() => result.current.addMarker('Red'));
    act(() => result.current.addMarker('Blue'));
    nowSpy.mockRestore();
    const targetId = result.current.markers[1].id; // the older (Red) marker

    act(() => result.current.updateMarkerComment(targetId, 'nice take'));

    const updated = result.current.markers.find(m => m.id === targetId);
    const other = result.current.markers.find(m => m.id !== targetId);
    expect(updated?.comment).toBe('nice take');
    expect(other?.comment).toBe('');
  });

  it('persists markers to localStorage whenever they change', () => {
    const { result } = renderHook(() => useMarkers(makeParams()));
    act(() => result.current.addMarker('Red'));

    const saved = JSON.parse(localStorage.getItem('ltc-markers')!) as { color: string }[];
    expect(saved).toHaveLength(1);
    expect(saved[0].color).toBe('Red');
  });

  it('backs up markers to native filesystem only when running on a native platform', () => {
    // The filesystem backup is debounced (comment keystrokes rewrite markers
    // constantly) — advance past the debounce window to observe the write.
    vi.useFakeTimers();
    isNativePlatform.mockReturnValue(true);
    const { result } = renderHook(() => useMarkers(makeParams()));
    act(() => result.current.addMarker('Red'));
    act(() => { vi.advanceTimersByTime(2100); });

    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'ltc_sync_pro_backup.json' }));
    vi.useRealTimers();
  });

  it('does not touch the filesystem when not on a native platform', () => {
    vi.useFakeTimers();
    isNativePlatform.mockReturnValue(false);
    const { result } = renderHook(() => useMarkers(makeParams()));
    act(() => result.current.addMarker('Red'));
    act(() => { vi.advanceTimersByTime(2100); });

    expect(writeFile).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('exportToEDL is a no-op with zero markers', () => {
    const { result } = renderHook(() => useMarkers(makeParams()));
    expect(() => act(() => result.current.exportToEDL())).not.toThrow();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('exportToEDL writes to the native filesystem when markers exist and running native', async () => {
    isNativePlatform.mockReturnValue(true);
    const addToast = vi.fn();
    const { result } = renderHook(() => useMarkers(makeParams({ addToast })));
    act(() => result.current.addMarker('Red'));

    await act(async () => {
      result.current.exportToEDL();
      await Promise.resolve();
    });

    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({
      path: expect.stringMatching(/\.edl$/) as unknown as string,
    }));
    expect(addToast).toHaveBeenCalledWith(expect.any(String));
  });

  it('exportToALE writes to the native filesystem when markers exist and running native', async () => {
    isNativePlatform.mockReturnValue(true);
    const { result } = renderHook(() => useMarkers(makeParams()));
    act(() => result.current.addMarker('Blue'));

    await act(async () => {
      result.current.exportToALE();
      await Promise.resolve();
    });

    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({
      path: expect.stringMatching(/\.ale$/) as unknown as string,
    }));
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMarkers } from './useMarkers';
import type { LtcEngine } from '../utils/LtcEngine';
import type { Lang } from '../utils/i18n';

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
    isNativePlatform.mockReturnValue(true);
    const { result } = renderHook(() => useMarkers(makeParams()));
    act(() => result.current.addMarker('Red'));

    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({ path: 'ltc_sync_pro_backup.json' }));
  });

  it('does not touch the filesystem when not on a native platform', () => {
    isNativePlatform.mockReturnValue(false);
    const { result } = renderHook(() => useMarkers(makeParams()));
    act(() => result.current.addMarker('Red'));

    expect(writeFile).not.toHaveBeenCalled();
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

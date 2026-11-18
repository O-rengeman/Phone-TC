import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  LIVE_TIMELINE_FUTURE_SECONDS,
  LIVE_TIMELINE_PAST_SECONDS,
  liveMarkerTimelineLayout,
  markerTimelineLayout,
  parseTcFrame,
} from './markerTimeline';
import { FPS_OPTIONS } from '../constants';
import type { Marker } from './export';

const FPS_24 = FPS_OPTIONS[1]; // 24fps
const FPS_2997DF = FPS_OPTIONS[4]; // 29.97 DF

const makeMarker = (overrides: Partial<Marker> = {}): Marker => ({
  id: 1,
  tc: '00:00:05:00',
  time: '10:00:05',
  color: 'Red',
  reelName: 'A001',
  take: 1,
  sceneName: '001',
  comment: '',
  ...overrides,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('parseTcFrame', () => {
  it('converts a timecode to absolute frames at the given rate', () => {
    expect(parseTcFrame('00:00:05:00', FPS_24.value, FPS_24.drop)).toBe(120);
    expect(parseTcFrame('01:00:00:00', FPS_24.value, FPS_24.drop)).toBe(86400);
  });

  it('accepts drop-frame separators', () => {
    expect(parseTcFrame('00:01:00;02', FPS_2997DF.value, FPS_2997DF.drop)).toBe(1800);
  });

  it('returns null for unparseable input instead of throwing', () => {
    expect(parseTcFrame('not-a-tc', FPS_24.value, FPS_24.drop)).toBeNull();
    expect(parseTcFrame('', FPS_24.value, FPS_24.drop)).toBeNull();
  });
});

describe('markerTimelineLayout', () => {
  it('returns an empty layout for no markers', () => {
    const layout = markerTimelineLayout([], FPS_24.value, FPS_24.drop);
    expect(layout.items).toEqual([]);
    expect(layout.skippedCount).toBe(0);
  });

  it('sorts markers oldest→newest regardless of input order', () => {
    // App stores newest-first.
    const markers = [
      makeMarker({ id: 3, tc: '00:00:20:00' }),
      makeMarker({ id: 2, tc: '00:00:05:00' }),
      makeMarker({ id: 1, tc: '00:00:10:00' }),
    ];
    const layout = markerTimelineLayout(markers, FPS_24.value, FPS_24.drop);
    expect(layout.items.map(i => i.marker.id)).toEqual([2, 1, 3]);
    expect(layout.items.map(i => i.tc)).toEqual(['00:00:05:00', '00:00:10:00', '00:00:20:00']);
  });

  it('positions markers proportionally inside the padded range', () => {
    const markers = [
      makeMarker({ id: 2, tc: '00:00:10:00' }), // frame 240
      makeMarker({ id: 1, tc: '00:00:05:00' }), // frame 120
    ];
    const layout = markerTimelineLayout(markers, FPS_24.value, FPS_24.drop);
    // span 120 frames → pad 6 each side → view 114..246, span 132.
    expect(layout.minFrame).toBe(120);
    expect(layout.maxFrame).toBe(240);
    expect(layout.viewMinFrame).toBe(114);
    expect(layout.viewMaxFrame).toBe(246);
    expect(layout.items[0].leftPct).toBeCloseTo(((120 - 114) / 132) * 100, 5);
    expect(layout.items[1].leftPct).toBeCloseTo(((240 - 114) / 132) * 100, 5);
    for (const item of layout.items) {
      expect(item.leftPct).toBeGreaterThan(0);
      expect(item.leftPct).toBeLessThan(100);
    }
  });

  it('still renders a single marker, centred in the padded view', () => {
    const layout = markerTimelineLayout([makeMarker({ tc: '00:00:05:00' })], FPS_24.value, FPS_24.drop);
    expect(layout.items).toHaveLength(1);
    // span 0 → pad 1 each side → view 119..121, marker sits at 50%.
    expect(layout.viewMinFrame).toBe(119);
    expect(layout.viewMaxFrame).toBe(121);
    expect(layout.items[0].leftPct).toBeCloseTo(50, 5);
    expect(layout.items[0].frame).toBe(120);
    expect(layout.items[0].tc).toBe('00:00:05:00');
  });

  it('keeps same-frame ties in oldest→newest order', () => {
    const markers = [
      makeMarker({ id: 9, tc: '00:00:05:00' }), // newest-first input
      makeMarker({ id: 4, tc: '00:00:05:00' }),
    ];
    const layout = markerTimelineLayout(markers, FPS_24.value, FPS_24.drop);
    expect(layout.items.map(i => i.marker.id)).toEqual([4, 9]);
    expect(layout.items[0].leftPct).toBe(layout.items[1].leftPct);
  });

  it('skips unparseable timecodes with a warning and keeps the rest', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const markers = [
      makeMarker({ id: 2, tc: 'bogus' }),
      makeMarker({ id: 1, tc: '00:00:05:00' }),
    ];
    const layout = markerTimelineLayout(markers, FPS_24.value, FPS_24.drop);
    expect(layout.items).toHaveLength(1);
    expect(layout.items[0].marker.id).toBe(1);
    expect(layout.skippedCount).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('handles drop-frame positions using the drop flag', () => {
    const markers = [
      makeMarker({ id: 2, tc: '00:02:00;02' }),
      makeMarker({ id: 1, tc: '00:01:00;02' }),
    ];
    const layout = markerTimelineLayout(markers, FPS_2997DF.value, FPS_2997DF.drop);
    // Drop-frame labels skip frames: 00:01:00;02 → 1800, 00:02:00;02 → 3598.
    expect(layout.items.map(i => i.frame)).toEqual([1800, 3598]);
    expect(layout.items[0].leftPct).toBeLessThan(layout.items[1].leftPct);
  });
});

describe('liveMarkerTimelineLayout', () => {
  it('anchors the playhead ~75% with default windows around currentFrame at 24fps', () => {
    const currentFrame = 24 * 200; // 4800
    const layout = liveMarkerTimelineLayout([], FPS_24.value, FPS_24.drop, currentFrame);
    const pastFrames = Math.round(LIVE_TIMELINE_PAST_SECONDS * FPS_24.value); // 2880
    const futureFrames = Math.round(LIVE_TIMELINE_FUTURE_SECONDS * FPS_24.value); // 960
    expect(layout.viewMinFrame).toBe(currentFrame - pastFrames);
    expect(layout.viewMaxFrame).toBe(currentFrame + futureFrames);
    expect(layout.playheadPct).toBeCloseTo(75, 5);
    expect(layout.items).toEqual([]);
    expect(layout.skippedCount).toBe(0);
    expect(layout.outsideCount).toBe(0);
  });

  it('positions in-window markers monotonically within (0,100)', () => {
    const currentFrame = 24 * 10; // 240 — window [-2640, 1200]
    const markers = [
      makeMarker({ id: 3, tc: '00:00:20:00' }), // 480
      makeMarker({ id: 1, tc: '00:00:05:00' }), // 120
      makeMarker({ id: 2, tc: '00:00:10:00' }), // 240
    ];
    const layout = liveMarkerTimelineLayout(markers, FPS_24.value, FPS_24.drop, currentFrame);
    expect(layout.items.map(i => i.marker.id)).toEqual([1, 2, 3]);
    const pcts = layout.items.map(i => i.leftPct);
    for (let i = 1; i < pcts.length; i += 1) {
      expect(pcts[i]).toBeGreaterThan(pcts[i - 1]);
    }
    for (const pct of pcts) {
      expect(pct).toBeGreaterThan(0);
      expect(pct).toBeLessThan(100);
    }
    expect(layout.outsideCount).toBe(0);
  });

  it('excludes markers outside the window and counts them in outsideCount', () => {
    const currentFrame = 24 * 10; // 240 — window [-2640, 1200]
    const markers = [
      makeMarker({ id: 1, tc: '00:00:05:00' }), // 120 — inside
      makeMarker({ id: 2, tc: '00:03:00:00' }), // 4320 — outside (future)
      makeMarker({ id: 3, tc: '01:00:00:00' }), // 86400 — outside (future)
    ];
    const layout = liveMarkerTimelineLayout(markers, FPS_24.value, FPS_24.drop, currentFrame);
    expect(layout.items.map(i => i.marker.id)).toEqual([1]);
    expect(layout.outsideCount).toBe(2);
  });

  it('slides the window with currentFrame: same marker, new leftPct, same playheadPct', () => {
    const markers = [makeMarker({ id: 1, tc: '00:00:10:00' })]; // frame 240
    const before = liveMarkerTimelineLayout(markers, FPS_24.value, FPS_24.drop, 240);
    const after = liveMarkerTimelineLayout(markers, FPS_24.value, FPS_24.drop, 2400);
    expect(before.items).toHaveLength(1);
    expect(after.items).toHaveLength(1);
    expect(after.items[0].leftPct).not.toBeCloseTo(before.items[0].leftPct, 5);
    expect(after.playheadPct).toBeCloseTo(before.playheadPct, 5);
    // The window itself moved by exactly the currentFrame delta.
    expect(after.viewMinFrame - before.viewMinFrame).toBe(2160);
    expect(after.viewMaxFrame - before.viewMaxFrame).toBe(2160);
  });

  it('counts unparseable TCs in skippedCount with a warning', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const markers = [
      makeMarker({ id: 2, tc: 'bogus' }),
      makeMarker({ id: 1, tc: '00:00:05:00' }),
    ];
    const layout = liveMarkerTimelineLayout(markers, FPS_24.value, FPS_24.drop, 240);
    expect(layout.items).toHaveLength(1);
    expect(layout.skippedCount).toBe(1);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('honours custom pastFrames/futureFrames for the playhead anchor and window', () => {
    const layout = liveMarkerTimelineLayout([], FPS_24.value, FPS_24.drop, 1000, {
      pastFrames: 100,
      futureFrames: 100,
    });
    expect(layout.playheadPct).toBeCloseTo(50, 5);
    expect(layout.viewMinFrame).toBe(900);
    expect(layout.viewMaxFrame).toBe(1100);
    const asymmetric = liveMarkerTimelineLayout([], FPS_24.value, FPS_24.drop, 1000, {
      pastFrames: 300,
      futureFrames: 100,
    });
    expect(asymmetric.playheadPct).toBeCloseTo(75, 5);
  });

  it('handles drop-frame rates using the drop flag', () => {
    const markers = [
      makeMarker({ id: 2, tc: '00:02:00;02' }), // 3598
      makeMarker({ id: 1, tc: '00:01:00;02' }), // 1800
      makeMarker({ id: 3, tc: '01:00:00;00' }), // far future — outside
    ];
    const layout = liveMarkerTimelineLayout(markers, FPS_2997DF.value, FPS_2997DF.drop, 3598);
    const pastFrames = Math.round(LIVE_TIMELINE_PAST_SECONDS * FPS_2997DF.value);
    const futureFrames = Math.round(LIVE_TIMELINE_FUTURE_SECONDS * FPS_2997DF.value);
    expect(layout.viewMinFrame).toBe(3598 - pastFrames);
    expect(layout.viewMaxFrame).toBe(3598 + futureFrames);
    expect(layout.items.map(i => i.frame)).toEqual([1800, 3598]);
    expect(layout.items[0].leftPct).toBeLessThan(layout.items[1].leftPct);
    expect(layout.outsideCount).toBe(1);
  });
});

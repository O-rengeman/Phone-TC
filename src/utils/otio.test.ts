import { describe, it, expect, vi } from 'vitest';
import { buildOtio } from './otio';
import { FPS_OPTIONS } from '../constants';
import type { Marker } from './export';

const markers: Marker[] = [
  // App stores newest-first.
  { id: 2, tc: '00:00:10:00', time: '10:00:10', color: 'Blue', reelName: 'A002', take: 2, sceneName: '002', comment: 'Great shot' },
  { id: 1, tc: '00:00:05:00', time: '10:00:05', color: 'Red', reelName: 'A001', take: 1, sceneName: '001', comment: '' },
];

interface OtioDoc {
  OTIO_SCHEMA: string;
  name: string;
  metadata: Record<string, unknown>;
  tracks: {
    OTIO_SCHEMA: string;
    children: {
      OTIO_SCHEMA: string;
      kind: string;
      children: {
        OTIO_SCHEMA: string;
        name: string;
        comment: string;
        marked_range: {
          start_time: { value: number; rate: number };
          duration: { value: number; rate: number };
        };
      }[];
    }[];
  };
}

function parse(text: string): OtioDoc {
  return JSON.parse(text) as OtioDoc;
}

function videoMarkers(doc: OtioDoc) {
  expect(doc.tracks.children).toHaveLength(1);
  const track = doc.tracks.children[0];
  expect(track.OTIO_SCHEMA).toBe('Track.1');
  expect(track.kind).toBe('Video');
  return track.children;
}

describe('buildOtio', () => {
  it('emits a parseable Timeline.1 document with one Video track of Marker.1 clips', () => {
    const doc = parse(buildOtio(markers, FPS_OPTIONS[2])); // 25fps
    expect(doc.OTIO_SCHEMA).toBe('Timeline.1');
    expect(doc.tracks.OTIO_SCHEMA).toBe('Stack.1');
    const clips = videoMarkers(doc);
    expect(clips).toHaveLength(2);
    for (const clip of clips) {
      expect(clip.OTIO_SCHEMA).toBe('Marker.1');
      expect(clip.marked_range.duration.value).toBe(1);
    }
  });

  it('orders markers oldest-first like the other exporters', () => {
    const clips = videoMarkers(parse(buildOtio(markers, FPS_OPTIONS[2])));
    expect(clips.map(c => c.name)).toEqual([
      'Scene 001 Take 1 — Red',
      'Scene 002 Take 2 — Blue',
    ]);
  });

  it('computes marked_range frame values and rational rate at 24fps', () => {
    const fps = FPS_OPTIONS[1]; // 24fps
    const clips = videoMarkers(parse(buildOtio(markers, fps)));
    // 00:00:05:00 @ 24fps = frame 120; 00:00:10:00 = frame 240.
    expect(clips[0].marked_range.start_time).toEqual({ value: 120, rate: 24 });
    expect(clips[1].marked_range.start_time).toEqual({ value: 240, rate: 24 });
    expect(clips[0].marked_range.duration).toEqual({ value: 1, rate: 24 });
  });

  it('uses the exact 30000/1001 rational rate for 29.97', () => {
    const fps = FPS_OPTIONS[3]; // 29.97 NDF
    const clips = videoMarkers(parse(buildOtio(markers, fps)));
    expect(clips[0].marked_range.start_time.rate).toBeCloseTo(30000 / 1001, 10);
    // Same nominal-fps frame math as buildFcpxml: 5s * 30 = 150.
    expect(clips[0].marked_range.start_time.value).toBe(150);
  });

  it('parses drop-frame timecodes for marked_range positions', () => {
    const df = [{ ...markers[0], tc: '00:01:00;02' }];
    const clips = videoMarkers(parse(buildOtio(df, FPS_OPTIONS[4]))); // 29.97 DF
    // Matches buildFcpxml's 1801800/30000s expectation for this TC.
    expect(clips[0].marked_range.start_time.value).toBe(1800);
    expect(clips[0].marked_range.start_time.rate).toBeCloseTo(30000 / 1001, 10);
  });

  it('puts TC, wall time, color, scene/take and comment into the marker comment', () => {
    const clips = videoMarkers(parse(buildOtio(markers, FPS_OPTIONS[2])));
    expect(clips[0].comment).toContain('TC 00:00:05:00');
    expect(clips[0].comment).toContain('10:00:05');
    expect(clips[0].comment).toContain('Red');
    expect(clips[1].comment).toContain('Great shot');
    expect(clips[1].comment).toContain('Blue');
  });

  it('mirrors the ALE sync fields when a marker carries sync data', () => {
    const synced: Marker[] = [{
      ...markers[0],
      sync: { method: 'network', driftMs: 1.2, driftFrames: 0.03, msSinceSync: 1500, confidence: 'high' },
    }];
    const clips = videoMarkers(parse(buildOtio(synced, FPS_OPTIONS[2])));
    expect(clips[0].comment).toContain('sync method=network');
    expect(clips[0].comment).toContain('driftMs=1.2');
    expect(clips[0].comment).toContain('driftFrames=0.03');
    expect(clips[0].comment).toContain('ageS=1.5');
    expect(clips[0].comment).toContain('confidence=high');
  });

  it('leaves unknown sync numerics blank like buildAle', () => {
    const synced: Marker[] = [{
      ...markers[0],
      sync: { method: 'p2p', driftMs: null, driftFrames: null, msSinceSync: null, confidence: 'none' },
    }];
    const clips = videoMarkers(parse(buildOtio(synced, FPS_OPTIONS[2])));
    expect(clips[0].comment).toContain('driftMs= driftFrames= ageS=');
    expect(clips[0].comment).toContain('confidence=none');
  });

  it('escapes JSON-hostile characters safely via JSON.stringify', () => {
    const dirty: Marker[] = [{
      ...markers[0],
      sceneName: 'A&B <scene>',
      comment: '日本語 "quoted" \n newline',
    }];
    const doc = parse(buildOtio(dirty, FPS_OPTIONS[2]));
    const clip = videoMarkers(doc)[0];
    expect(clip.name).toBe('Scene A&B <scene> Take 2 — Blue');
    expect(clip.comment).toContain('日本語 "quoted" \n newline');
  });

  it('produces a valid empty timeline when there are no markers', () => {
    const doc = parse(buildOtio([], FPS_OPTIONS[2]));
    expect(doc.OTIO_SCHEMA).toBe('Timeline.1');
    expect(videoMarkers(doc)).toHaveLength(0);
  });

  it('skips markers with unparseable timecodes and warns instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mixed: Marker[] = [
      { ...markers[0], tc: 'not-a-timecode' },
      { ...markers[1] },
    ];
    const clips = videoMarkers(parse(buildOtio(mixed, FPS_OPTIONS[2])));
    expect(clips).toHaveLength(1);
    expect(clips[0].name).toBe('Scene 001 Take 1 — Red');
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

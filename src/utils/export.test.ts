import { describe, it, expect } from 'vitest';
import { buildEdl, buildAle } from './export';
import type { Marker } from './export';

const markers: Marker[] = [
  // App stores newest-first.
  { id: 2, tc: '00:00:10:00', time: '10:00:10', color: 'Blue', reelName: 'A002', take: 2, sceneName: '001', comment: 'Great shot' },
  { id: 1, tc: '00:00:05:00', time: '10:00:05', color: 'Red', reelName: 'A001', take: 1, sceneName: '001', comment: '' },
];

describe('buildEdl', () => {
  it('emits a header with the correct FCM for non-drop frame', () => {
    const edl = buildEdl(markers, false);
    expect(edl).toContain('TITLE: Logged Takes');
    expect(edl).toContain('FCM: NON-DROP FRAME');
  });

  it('uses DROP FRAME in the header when drop frame', () => {
    expect(buildEdl(markers, true)).toContain('FCM: DROP FRAME');
  });

  it('orders events oldest-first with padded event numbers', () => {
    const edl = buildEdl(markers, false);
    // Oldest (Red/A001) should be event 001, newest (Blue/A002) event 002.
    const idx001 = edl.indexOf('001');
    const idx002 = edl.indexOf('002');
    expect(idx001).toBeGreaterThanOrEqual(0);
    expect(idx002).toBeGreaterThan(idx001);
    expect(edl).toContain('|C:ResolveColorRed');
    expect(edl.indexOf('ResolveColorRed')).toBeLessThan(edl.indexOf('ResolveColorBlue'));
  });

  it('falls back to AX and strips control characters from reel names', () => {
    const dirty: Marker[] = [
      { id: 1, tc: '00:00:01:00', time: 't', color: 'Green', reelName: 'RE\tEL\n1', take: 1, sceneName: '001', comment: '' },
      { id: 2, tc: '00:00:02:00', time: 't', color: 'Yellow', reelName: '', take: 2, sceneName: '001', comment: '' },
    ];
    const edl = buildEdl(dirty, false);
    expect(edl).not.toMatch(/\tEL/);
    expect(edl).toContain('AX'); // empty reel name falls back to AX
  });

  it('returns just the header when there are no markers', () => {
    const edl = buildEdl([], false);
    expect(edl).toContain('TITLE: Logged Takes');
    expect(edl).not.toContain('ResolveColor');
  });
});

describe('buildAle', () => {
  it('appends five sync columns, keeps legacy fields blank and sanitizes rows', () => {
    const ale = buildAle([{ ...markers[0], sceneName: 'a\tb\nc', comment: 'x\ry', sync: { method: 'ntp', driftMs: 1.2, driftFrames: 0.03, msSinceSync: 1500, confidence: 'high' } }, markers[1]], '25\n');
    const columns = ale.split('Column\n')[1].split('\n')[0].split('\t');
    expect(columns.slice(7)).toEqual(['Sync_Method', 'Sync_Drift_ms', 'Sync_Drift_Frames', 'Sync_Age_s', 'Sync_Confidence']);
    const rows = ale.split('Data\n')[1].split('\n').filter(Boolean).map(row => row.split('\t'));
    expect(rows.map(row => row.length)).toEqual([12, 12]);
    expect(rows[0].slice(7)).toEqual(['ntp', '1.2', '0.03', '1.5', 'high']);
    expect(rows[1].slice(7)).toEqual(['', '', '', '', '']);
    expect(rows[0][4]).toBe('abc');
    expect(rows[0][6]).toContain('xy');
  });

  it('leaves unknown and nonfinite numeric sync fields blank', () => {
    const ale = buildAle([{ ...markers[0], sync: { method: 'p2p', driftMs: Infinity, driftFrames: NaN, msSinceSync: null, confidence: 'none' } }], '25');
    expect(ale).toContain('\tp2p\t\t\t\tnone\n');
  });
  it('includes the FPS label and a heading block', () => {
    const ale = buildAle(markers, '23.976');
    expect(ale).toContain('FPS\t23.976');
    expect(ale).toContain('Heading');
    expect(ale).toContain('Data');
  });

  it('emits one descending-numbered row per marker with tab delimiters', () => {
    const ale = buildAle(markers, '30');
    expect(ale).toContain('Scene 001 Take 2\tV\t00:00:10:00\t00:00:10:00\t001\t2\tBlue marker at 10:00:10 - Great shot');
    expect(ale).toContain('Scene 001 Take 1\tV\t00:00:05:00\t00:00:05:00\t001\t1\tRed marker at 10:00:05');
  });

  it('produces no data rows for an empty marker list', () => {
    const ale = buildAle([], '25');
    expect(ale).not.toContain('MARKER_');
  });
});

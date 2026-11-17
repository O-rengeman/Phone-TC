import { describe, it, expect } from 'vitest';
import { buildEdl, buildAle, buildFcpxml, buildResolveMarkers, buildCsv } from './export';
import { FPS_OPTIONS } from '../constants';
import type { Marker } from './export';

const markers: Marker[] = [
  // App stores newest-first.
  { id: 2, tc: '00:00:10:00', time: '10:00:10', color: 'Blue', reelName: 'A002', take: 2, sceneName: '001', comment: 'Great shot' },
  { id: 1, tc: '00:00:05:00', time: '10:00:05', color: 'Red', reelName: 'A001', take: 1, sceneName: '001', comment: '' },
];

describe('editor exports', () => {
  const parse = (text: string) => {
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    expect(doc.querySelector('parsererror')).toBeNull();
    return doc;
  };

  it.each(FPS_OPTIONS)('builds valid FCPXML at $label', fps => {
    const doc = parse(buildFcpxml(markers, fps));
    expect(doc.querySelector('format')?.getAttribute('frameDuration')).toBe(`${fps.fpsDen}/${fps.fpsNum}s`);
    expect(doc.querySelector('sequence')?.getAttribute('tcFormat')).toBe(fps.drop ? 'DF' : 'NDF');
    expect([...doc.querySelectorAll('marker')].map(m => m.getAttribute('value'))).toEqual(['Scene 001 Take 1', 'Scene 001 Take 2']);
  });

  it('escapes XML attributes without losing Japanese notes or whitespace', () => {
    const comment = '日本語 & < > " \'\n\t';
    const doc = parse(buildFcpxml([{ ...markers[0], sceneName: 'A&B', comment }], FPS_OPTIONS[0]));
    expect(doc.querySelector('marker')?.getAttribute('note')).toBe(comment);
    expect(doc.querySelector('marker')?.getAttribute('value')).toBe('Scene A&B Take 2');
  });

  it('uses real drop-frame frame counts and a one-frame Resolve event across a skipped label', () => {
    const df = [{ ...markers[0], tc: '00:01:00;02' }];
    expect(parse(buildFcpxml(df, FPS_OPTIONS[4])).querySelector('marker')?.getAttribute('start')).toBe('1801800/30000s');
    const edl = buildResolveMarkers([{ ...markers[0], tc: '00:00:59;29' }], FPS_OPTIONS[4]);
    expect(edl).toContain('FCM: DROP FRAME');
    expect(edl).toContain('00:00:59;29 00:01:00;02 00:00:59;29 00:01:00;02');
  });

  it('builds chronological Resolve events with comments and sanitized lines', () => {
    const edl = buildResolveMarkers(markers, FPS_OPTIONS[2]);
    expect(edl).toContain('00:00:05:00 00:00:05:01');
    expect(edl).toContain('|C:ResolveColorBlue |M:Scene 001 Take 2 - Great shot |D:1');
    expect(edl.indexOf('ResolveColorRed')).toBeLessThan(edl.indexOf('ResolveColorBlue'));
    expect(buildResolveMarkers([{ ...markers[0], reelName: '', comment: 'a\nb\tc' }], FPS_OPTIONS[2])).toContain(' - abc |D:1');
  });

  it('preserves CSV commas, quotes, newlines and Japanese with RFC 4180 escaping', () => {
    const csv = buildCsv([{ ...markers[0], comment: '日本語,"OK"\r\n次' }, markers[1]]);
    expect(csv.startsWith('"Scene","Take","Timecode","Reel","Color","Time","Comment"\r\n')).toBe(true);
    expect(csv).toContain('"日本語,""OK""\r\n次"\r\n');
    expect(csv.indexOf('A001')).toBeLessThan(csv.indexOf('A002'));
  });

  it('produces empty documents and header-only tabular exports', () => {
    expect(parse(buildFcpxml([], FPS_OPTIONS[2])).querySelectorAll('marker')).toHaveLength(0);
    expect(buildResolveMarkers([], FPS_OPTIONS[2])).toBe('TITLE: Logged Takes\nFCM: NON-DROP FRAME\n\n');
    expect(buildCsv([]).split('\r\n')).toHaveLength(2);
  });

  it('rejects invalid timecodes rather than generating corrupt timeline positions', () => {
    const invalid = [{ ...markers[0], tc: 'invalid' }];
    expect(() => buildFcpxml(invalid, FPS_OPTIONS[2])).toThrow();
    expect(() => buildResolveMarkers(invalid, FPS_OPTIONS[2])).toThrow();
  });
});

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
    const ale = buildAle([{ ...markers[0], sceneName: 'a\tb\nc', comment: 'x\ry', sync: { method: 'network', driftMs: 1.2, driftFrames: 0.03, msSinceSync: 1500, confidence: 'high' } }, markers[1]], '25\n');
    const columns = ale.split('Column\n')[1].split('\n')[0].split('\t');
    expect(columns.slice(7)).toEqual(['Sync_Method', 'Sync_Drift_ms', 'Sync_Drift_Frames', 'Sync_Age_s', 'Sync_Confidence']);
    const rows = ale.split('Data\n')[1].split('\n').filter(Boolean).map(row => row.split('\t'));
    expect(rows.map(row => row.length)).toEqual([12, 12]);
    expect(rows[0].slice(7)).toEqual(['network', '1.2', '0.03', '1.5', 'high']);
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

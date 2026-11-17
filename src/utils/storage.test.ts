import { describe, it, expect, beforeEach } from 'vitest';
import { STORAGE_KEYS, readStored, readStoredJson, readStoredString, writeStoredJson, writeStoredString } from './storage';

beforeEach(() => localStorage.clear());

describe('storage', () => {
  it('round-trips strings and json', () => {
    writeStoredString(STORAGE_KEYS.fps, '3');
    expect(readStoredString(STORAGE_KEYS.fps)).toBe('3');
    writeStoredJson(STORAGE_KEYS.markers, [{ id: 1 }]);
    expect(readStoredJson(STORAGE_KEYS.markers, [], (v): v is unknown[] => Array.isArray(v))).toEqual([{ id: 1 }]);
  });

  it('readStored falls back on missing key, bad parse, and throwing parser', () => {
    expect(readStored('nope', 7, (r) => parseInt(r, 10))).toBe(7);
    localStorage.setItem('bad', '{');
    expect(readStored('bad', 7, () => { throw new Error('x'); })).toBe(7);
    localStorage.setItem('nan', 'abc');
    expect(readStored('nan', 7, (r) => { const n = parseInt(r, 10); return Number.isFinite(n) ? n : undefined; })).toBe(7);
  });

  it('readStoredJson validates shape', () => {
    localStorage.setItem('j', '[1,2]');
    const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
    expect(readStoredJson('j', { d: 1 }, isObj)).toEqual({ d: 1 });
  });
});

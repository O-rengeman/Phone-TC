import { describe, it, expect, beforeEach } from 'vitest';
import { FPS_OPTIONS } from '../constants';
import { STORAGE_KEYS } from './storage';
import {
  PRESET_LIMIT,
  PRESET_NAME_MAX,
  deletePreset,
  getPreset,
  isPresetArray,
  listPresets,
  sanitizePresetSettings,
  savePreset,
} from './presets';
import type { Preset, PresetSettings } from './presets';

const baseSettings = (overrides: Partial<PresetSettings> = {}): PresetSettings => ({
  fpsIndex: 2,
  volume: 0.5,
  outputLevel: 'line',
  outputMode: 'stereo',
  outputOffset: 0,
  autoUserBits: true,
  userBits: '01012401',
  defaultReelName: 'A001',
  sceneName: '001',
  syncMode: 'network',
  ...overrides,
});

beforeEach(() => localStorage.clear());

describe('savePreset / listPresets', () => {
  it('returns an empty list when nothing is stored', () => {
    expect(listPresets()).toEqual([]);
  });

  it('round-trips a saved preset', () => {
    const saved = savePreset('  Cam A  ', baseSettings({ fpsIndex: 4, outputOffset: -3 }));
    expect(saved).not.toBeNull();
    expect(saved!.name).toBe('Cam A');
    expect(saved!.settings.fpsIndex).toBe(4);
    expect(saved!.settings.outputOffset).toBe(-3);
    expect(typeof saved!.id).toBe('string');
    expect(saved!.id.length).toBeGreaterThan(0);
    expect(typeof saved!.createdAt).toBe('number');

    const list = listPresets();
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual(saved);
  });

  it('rejects empty and whitespace-only names', () => {
    expect(savePreset('', baseSettings())).toBeNull();
    expect(savePreset('   ', baseSettings())).toBeNull();
    expect(listPresets()).toEqual([]);
  });

  it('rejects names longer than PRESET_NAME_MAX', () => {
    expect(savePreset('x'.repeat(PRESET_NAME_MAX + 1), baseSettings())).toBeNull();
    expect(savePreset('x'.repeat(PRESET_NAME_MAX), baseSettings())).not.toBeNull();
  });

  it('updates an existing same-name preset in place (case-insensitive)', () => {
    const first = savePreset('Cam A', baseSettings({ volume: 0.2 }))!;
    savePreset('Cam B', baseSettings());
    const second = savePreset('cam a', baseSettings({ volume: 0.9, syncMode: 'freerun' }))!;

    expect(second.id).toBe(first.id);
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.name).toBe('cam a');

    const list = listPresets();
    expect(list).toHaveLength(2);
    // Position is preserved: the updated preset stays where it was created.
    expect(list.map(p => p.name)).toEqual(['cam a', 'Cam B']);
    expect(list[0].settings.volume).toBe(0.9);
    expect(list[0].settings.syncMode).toBe('freerun');
  });

  it('caps the list at PRESET_LIMIT, dropping the oldest entries', () => {
    for (let i = 0; i < PRESET_LIMIT + 5; i++) {
      savePreset(`preset-${i}`, baseSettings());
    }
    const list = listPresets();
    expect(list).toHaveLength(PRESET_LIMIT);
    expect(list[0].name).toBe('preset-5');
    expect(list[list.length - 1].name).toBe(`preset-${PRESET_LIMIT + 4}`);
    expect(getPreset(list[0].id)).toBeDefined();
  });
});

describe('deletePreset / getPreset', () => {
  it('deletes by id and reports whether anything was removed', () => {
    const a = savePreset('A', baseSettings())!;
    savePreset('B', baseSettings())!;
    expect(deletePreset(a.id)).toBe(true);
    expect(listPresets().map(p => p.name)).toEqual(['B']);
    expect(deletePreset(a.id)).toBe(false);
    expect(deletePreset('nope')).toBe(false);
  });

  it('getPreset returns the preset or undefined', () => {
    const saved = savePreset('A', baseSettings())!;
    expect(getPreset(saved.id)).toEqual(saved);
    expect(getPreset('missing')).toBeUndefined();
  });
});

describe('malformed storage', () => {
  it('falls back to [] on invalid JSON', () => {
    localStorage.setItem(STORAGE_KEYS.presets, '{not json');
    expect(listPresets()).toEqual([]);
  });

  it('falls back to [] when the payload is not an array', () => {
    localStorage.setItem(STORAGE_KEYS.presets, '{"a":1}');
    expect(listPresets()).toEqual([]);
  });

  it('falls back to [] when any entry is malformed (all-or-nothing)', () => {
    savePreset('good', baseSettings());
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.presets)!) as unknown[];
    stored.push({ id: 'bad', name: 'bad', createdAt: 1, settings: { fpsIndex: 'x' } });
    localStorage.setItem(STORAGE_KEYS.presets, JSON.stringify(stored));
    expect(listPresets()).toEqual([]);
  });
});

describe('isPresetArray field validation', () => {
  const validPreset = (): Preset => ({
    id: 'p1',
    name: 'Cam',
    createdAt: 1700000000000,
    settings: baseSettings(),
  });

  it('accepts a fully valid preset array', () => {
    expect(isPresetArray([validPreset()])).toBe(true);
    expect(isPresetArray([])).toBe(true);
  });

  it('rejects non-arrays and non-objects', () => {
    expect(isPresetArray(null)).toBe(false);
    expect(isPresetArray('x')).toBe(false);
    expect(isPresetArray([null])).toBe(false);
    expect(isPresetArray([{ ...validPreset(), id: '' }])).toBe(false);
    expect(isPresetArray([{ ...validPreset(), createdAt: 'now' }])).toBe(false);
    expect(isPresetArray([{ ...validPreset(), name: '   ' }])).toBe(false);
  });

  it.each([
    ['fpsIndex out of range', { fpsIndex: FPS_OPTIONS.length }],
    ['fpsIndex negative', { fpsIndex: -1 }],
    ['fpsIndex fractional', { fpsIndex: 1.5 }],
    ['volume too high', { volume: 1.5 }],
    ['volume negative', { volume: -0.1 }],
    ['bad outputLevel', { outputLevel: 'X' }],
    ['bad outputMode', { outputMode: 'X' }],
    ['outputOffset too high', { outputOffset: 11 }],
    ['outputOffset too low', { outputOffset: -11 }],
    ['outputOffset fractional', { outputOffset: 0.5 }],
    ['autoUserBits not boolean', { autoUserBits: 'yes' }],
    ['userBits non-hex', { userBits: 'ZZZZZZZZ' }],
    ['userBits too long', { userBits: '123456789' }],
    ['userBits empty', { userBits: '' }],
    ['reel name too long', { defaultReelName: 'x'.repeat(33) }],
    ['scene name too long', { sceneName: 'x'.repeat(33) }],
    ['bad syncMode', { syncMode: 'bogus' }],
  ])('rejects settings with %s', (_label, patch) => {
    const preset = validPreset();
    preset.settings = { ...preset.settings, ...patch } as PresetSettings;
    expect(isPresetArray([preset])).toBe(false);
  });

  it('rejects a preset with missing settings', () => {
    const preset = validPreset() as unknown as Record<string, unknown>;
    delete preset.settings;
    expect(isPresetArray([preset])).toBe(false);
  });
});

describe('sanitizePresetSettings', () => {
  it('clamps numeric fields into the app ranges', () => {
    const clean = sanitizePresetSettings(baseSettings({
      fpsIndex: 99,
      volume: 1.7,
      outputOffset: 42,
    }));
    expect(clean.fpsIndex).toBe(0);
    expect(clean.volume).toBe(1);
    expect(clean.outputOffset).toBe(10);
  });

  it('normalizes enums and userBits to storable shapes', () => {
    const clean = sanitizePresetSettings(baseSettings({
      outputLevel: 'bogus' as PresetSettings['outputLevel'],
      outputMode: 'bogus' as PresetSettings['outputMode'],
      syncMode: 'bogus' as PresetSettings['syncMode'],
      autoUserBits: 'yes' as unknown as boolean,
      userBits: 'ab-cd 12',
    }));
    expect(clean.outputLevel).toBe('line');
    expect(clean.outputMode).toBe('stereo');
    expect(clean.syncMode).toBe('network');
    expect(clean.autoUserBits).toBe(false);
    expect(clean.userBits).toBe('ABCD12'.padEnd(8, '0'));
  });

  it('keeps valid settings untouched', () => {
    const settings = baseSettings({ fpsIndex: 5, volume: 0.25, outputOffset: -4 });
    expect(sanitizePresetSettings(settings)).toEqual(settings);
  });
});

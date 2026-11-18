/**
 * presets.ts — named snapshots of the generator/settings state.
 *
 * A preset captures the setup an operator configures before a shoot — frame
 * rate, output form/level, TC offset, user bits, reel/scene defaults and the
 * sync method — so a rig can be reconfigured in one tap instead of walking
 * every control again. Presets persist as a JSON array under
 * STORAGE_KEYS.presets through the shared readStoredJson/writeStoredJson
 * helpers, following the same defensive pattern as markers: a malformed
 * payload degrades to an empty list rather than throwing.
 *
 * Duplicate policy: preset names are compared case-insensitively after
 * trimming. Re-saving an existing name UPDATES that preset in place — same
 * id, same createdAt, same position in the list — instead of creating a
 * twin or rejecting the save. Names longer than PRESET_NAME_MAX are rejected
 * (savePreset returns null), as are empty ones.
 *
 * The list is kept in creation order (oldest first) and capped at
 * PRESET_LIMIT entries; overflow drops the oldest entries from the front.
 * Because updates stay in place, re-saving an old preset does not refresh
 * its age — it can still be evicted as the oldest.
 */

import { FPS_OPTIONS } from '../constants';
import type { SyncMode } from '../LTCSyncContext';
import { STORAGE_KEYS, readStoredJson, writeStoredJson } from './storage';

export interface PresetSettings {
  fpsIndex: number;
  volume: number;
  outputLevel: 'mic' | 'line';
  outputMode: 'stereo' | 'mono-l';
  outputOffset: number;
  autoUserBits: boolean;
  userBits: string;
  defaultReelName: string;
  sceneName: string;
  syncMode: SyncMode;
}

export interface Preset {
  id: string;
  name: string;
  createdAt: number;
  settings: PresetSettings;
}

export const PRESET_LIMIT = 20;
export const PRESET_NAME_MAX = 40;

const SYNC_MODES: readonly SyncMode[] = ['system', 'network', 'p2p', 'freerun'];

const isSyncMode = (value: unknown): value is SyncMode =>
  typeof value === 'string' && (SYNC_MODES as readonly string[]).includes(value);

let presetIdCounter = 0;

function newPresetId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch { /* fall through to the counter-based id */ }
  presetIdCounter += 1;
  return `preset-${Date.now().toString(36)}-${presetIdCounter.toString(36)}`;
}

/**
 * Write-path normalization: coerces every field into the range the rest of
 * the app accepts, so a caller passing slightly-off live state can't persist
 * a preset that the read-path validator would later reject wholesale.
 */
export function sanitizePresetSettings(settings: PresetSettings): PresetSettings {
  const fpsIndex = Number.isInteger(settings.fpsIndex)
    && settings.fpsIndex >= 0
    && settings.fpsIndex < FPS_OPTIONS.length
    ? settings.fpsIndex
    : 0;
  return {
    fpsIndex,
    volume: Number.isFinite(settings.volume)
      ? Math.min(1, Math.max(0, settings.volume))
      : 0.5,
    outputLevel: settings.outputLevel === 'mic' ? 'mic' : 'line',
    outputMode: settings.outputMode === 'mono-l' ? 'mono-l' : 'stereo',
    outputOffset: Number.isInteger(settings.outputOffset)
      ? Math.min(10, Math.max(-10, settings.outputOffset))
      : 0,
    autoUserBits: settings.autoUserBits === true,
    // Same shape LtcEngine.setUserBits produces: 8 uppercase hex chars.
    userBits: typeof settings.userBits === 'string'
      ? settings.userBits.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 8).padEnd(8, '0')
      : '00000000',
    defaultReelName: typeof settings.defaultReelName === 'string'
      ? settings.defaultReelName.slice(0, 32)
      : '',
    sceneName: typeof settings.sceneName === 'string'
      ? settings.sceneName.slice(0, 32)
      : '',
    syncMode: isSyncMode(settings.syncMode) ? settings.syncMode : 'network',
  };
}

function isPresetSettings(value: unknown): value is PresetSettings {
  if (typeof value !== 'object' || value === null) return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.fpsIndex === 'number'
    && Number.isInteger(s.fpsIndex)
    && s.fpsIndex >= 0
    && s.fpsIndex < FPS_OPTIONS.length
    && typeof s.volume === 'number'
    && Number.isFinite(s.volume)
    && s.volume >= 0
    && s.volume <= 1
    && (s.outputLevel === 'mic' || s.outputLevel === 'line')
    && (s.outputMode === 'stereo' || s.outputMode === 'mono-l')
    && typeof s.outputOffset === 'number'
    && Number.isInteger(s.outputOffset)
    && s.outputOffset >= -10
    && s.outputOffset <= 10
    && typeof s.autoUserBits === 'boolean'
    && typeof s.userBits === 'string'
    && /^[0-9A-Fa-f]{1,8}$/.test(s.userBits)
    && typeof s.defaultReelName === 'string'
    && s.defaultReelName.length <= 32
    && typeof s.sceneName === 'string'
    && s.sceneName.length <= 32
    && isSyncMode(s.syncMode)
  );
}

function isPreset(value: unknown): value is Preset {
  if (typeof value !== 'object' || value === null) return false;
  const p = value as Record<string, unknown>;
  return (
    typeof p.id === 'string'
    && p.id.length > 0
    && p.id.length <= 64
    && typeof p.name === 'string'
    && p.name.trim().length > 0
    && p.name.length <= 80
    && typeof p.createdAt === 'number'
    && Number.isFinite(p.createdAt)
    && isPresetSettings(p.settings)
  );
}

/**
 * Read-path validator for STORAGE_KEYS.presets: every entry must be a fully
 * valid preset or the whole payload is rejected and listPresets() falls
 * back to [] — same all-or-nothing contract as isMarkerArray.
 */
export const isPresetArray = (value: unknown): value is Preset[] =>
  Array.isArray(value) && value.every(isPreset);

/** All stored presets, oldest first. Malformed storage yields []. */
export function listPresets(): Preset[] {
  return readStoredJson(STORAGE_KEYS.presets, [] as Preset[], isPresetArray);
}

/**
 * Upserts a preset named `name` (trimmed; compared case-insensitively)
 * with a snapshot of `settings`. Returns the stored preset, or null when
 * the name is empty or exceeds PRESET_NAME_MAX.
 */
export function savePreset(name: string, settings: PresetSettings): Preset | null {
  const trimmed = name.trim();
  if (trimmed.length === 0 || trimmed.length > PRESET_NAME_MAX) return null;

  const presets = listPresets();
  const clean = sanitizePresetSettings(settings);
  const key = trimmed.toLowerCase();
  const existing = presets.find(p => p.name.trim().toLowerCase() === key);

  const next = existing
    ? presets.map(p => (p.id === existing.id ? { ...p, name: trimmed, settings: clean } : p))
    : [
        ...presets,
        {
          id: newPresetId(),
          name: trimmed,
          createdAt: Date.now(),
          settings: clean,
        },
      ];

  const capped = next.length > PRESET_LIMIT ? next.slice(next.length - PRESET_LIMIT) : next;
  writeStoredJson(STORAGE_KEYS.presets, capped);
  return capped.find(p => p.name.trim().toLowerCase() === key) ?? null;
}

/** Removes the preset with `id`; returns true when one was removed. */
export function deletePreset(id: string): boolean {
  const presets = listPresets();
  const next = presets.filter(p => p.id !== id);
  if (next.length === presets.length) return false;
  writeStoredJson(STORAGE_KEYS.presets, next);
  return true;
}

export function getPreset(id: string): Preset | undefined {
  return listPresets().find(p => p.id === id);
}

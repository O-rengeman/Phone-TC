/**
 * storage.ts — single place for localStorage keys and safe read/write helpers.
 *
 * Every persisted setting used to hand-roll the same
 * try/getItem/parse/fallback pattern with string-literal keys duplicated
 * between the read and write sites, and validation strictness varied per key
 * (ltc-fps accepted NaN). Keys live here once; each read supplies a parser
 * that returns `undefined` for invalid values so callers fall back to their
 * defaults.
 */

export const STORAGE_KEYS = {
  fps: 'ltc-fps',
  volume: 'ltc-vol',
  outputMode: 'ltc-outmode',
  autoUserBits: 'ltc-autoub',
  scene: 'ltc-scene',
  outputLevel: 'ltc-outlevel',
  outputOffset: 'ltc-out-offset',
  markers: 'ltc-markers',
  lang: 'ltc-lang',
  desktopTab: 'ltc-desktop-tab',
  ntpCache: 'ltc-ntp-cache',
  turnConfig: 'ltc-turn-config',
  presets: 'ltc-presets',
  peerServer: 'ltc-peer-server',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Raw string read; null when storage is unavailable or the key is absent. */
export function readStoredString(key: StorageKey | (string & {})): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/**
 * Safe write; never throws. Returns false when storage is unavailable or
 * full so callers holding irreplaceable data (markers) can warn the user
 * instead of letting the loss stay silent until the next restart.
 */
export function writeStoredString(key: StorageKey | (string & {}), value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads `key` and runs `parse` on the raw string. Returns `fallback` when the
 * key is missing, storage throws, JSON is malformed, or `parse` returns
 * undefined — i.e. "invalid stored value" always degrades to the default.
 */
export function readStored<T>(
  key: StorageKey | (string & {}),
  fallback: T,
  parse: (raw: string) => T | undefined,
): T {
  const raw = readStoredString(key);
  if (raw === null) return fallback;
  try {
    return parse(raw) ?? fallback;
  } catch {
    return fallback;
  }
}

/** JSON variant of readStored for object/array payloads. */
export function readStoredJson<T>(
  key: StorageKey | (string & {}),
  fallback: T,
  validate: (value: unknown) => value is T,
): T {
  const raw = readStoredString(key);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return validate(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

export function writeStoredJson(key: StorageKey | (string & {}), value: unknown): void {
  writeStoredString(key, JSON.stringify(value));
}

import type { PeerJSOption } from 'peerjs';

import { STORAGE_KEYS, readStoredString, writeStoredString } from './storage';

/**
 * signalingConfig.ts — per-device self-hosted PeerServer (signaling) settings.
 *
 * PeerSync.ts passes these through to the PeerJS `Peer` constructor. `null`
 * means "use the default PeerJS cloud" (0.peerjs.com:443), which is also what
 * an absent, malformed, or invalid stored value resolves to — a bad hand-edit
 * degrades to today's behaviour instead of breaking every P2P attempt.
 *
 * The payload lives under STORAGE_KEYS.peerServer as JSON, written/read via
 * the shared storage helpers so private-mode storage failures stay silent.
 */

export type PeerServerConfig = {
  /**
   * PeerServer hostname. The special value '/' makes PeerJS dial the same
   * host that served the app (see PeerJS host handling).
   */
  host: string;
  /** PeerServer port; integer in [1, 65535]. */
  port: number;
  /**
   * HTTP path the signaling socket is mounted on. PeerJS normalizes the
   * leading/trailing slashes itself; '/' is the PeerServer default.
   */
  path: string;
  /** true → wss://, false → ws://. */
  secure: boolean;
  /** Optional API key for the PeerServer. */
  key?: string;
} | null;

/**
 * Coerces an untrusted port (JSON may hold a string) to an integer in
 * [1, 65535], or null when it isn't a usable port number.
 */
function normalizePort(port: unknown): number | null {
  const n = typeof port === 'string' && port.trim() !== '' ? Number(port.trim()) : port;
  return typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 65535 ? n : null;
}

/**
 * Validates/normalizes an untrusted value (parsed JSON or caller input) into
 * a PeerServerConfig. Returns null for anything that can't safely be handed
 * to PeerJS — wrong shape, blank host, or an out-of-range port.
 */
function sanitizePeerServerConfig(value: unknown): PeerServerConfig {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  const host = typeof raw.host === 'string' ? raw.host.trim() : '';
  const port = normalizePort(raw.port);
  if (host === '' || port === null) return null;

  const config: NonNullable<PeerServerConfig> = {
    host,
    port,
    path: typeof raw.path === 'string' && raw.path.trim() !== '' ? raw.path.trim() : '/',
    secure: raw.secure === true,
  };
  if (typeof raw.key === 'string' && raw.key.trim() !== '') {
    config.key = raw.key.trim();
  }
  return config;
}

/**
 * Reads the stored PeerServer override. Returns null (PeerJS cloud default)
 * when nothing is stored or the stored JSON is malformed/invalid.
 */
export function loadPeerServerConfig(): PeerServerConfig {
  const raw = readStoredString(STORAGE_KEYS.peerServer);
  if (raw === null) return null;
  try {
    return sanitizePeerServerConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Persists a PeerServer override. Invalid non-null input is coerced to null
 * (cloud default) rather than stored, so a bad form value can never wedge
 * the app into an unreachable signaling server.
 */
export function savePeerServerConfig(cfg: PeerServerConfig): void {
  writeStoredString(STORAGE_KEYS.peerServer, JSON.stringify(sanitizePeerServerConfig(cfg)));
}

/** Removes the override; the next Peer is built against the PeerJS cloud. */
export function clearPeerServerConfig(): void {
  savePeerServerConfig(null);
}

/**
 * Maps a PeerServerConfig onto the subset of PeerJS options it controls.
 * Returns {} for null/invalid input so spreading it into the Peer constructor
 * options is always safe — PeerJS then applies its own defaults. `key` is
 * included only when configured (PeerJS defaults it otherwise).
 */
export function peerJsOptionsFromConfig(cfg: PeerServerConfig): PeerJSOption {
  const valid = sanitizePeerServerConfig(cfg);
  if (valid === null) return {};
  const options: PeerJSOption = {
    host: valid.host,
    port: valid.port,
    path: valid.path,
    secure: valid.secure,
  };
  if (valid.key !== undefined) options.key = valid.key;
  return options;
}
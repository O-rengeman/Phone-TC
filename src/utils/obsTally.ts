/**
 * obsTally.ts — pure mapping between OBS scenes and this session's cameras.
 *
 * OBS thinks in scene names; the tally system thinks in peer ids. Everything
 * that translates between the two lives here, DOM-free and socket-free, so the
 * rules ("which camera goes live when OBS switches to scene X") can be tested
 * without an OBS instance. The socket lives in ObsWebSocket.ts and the React
 * wiring in hooks/useObsTally.ts.
 */

/** scene name -> camera peer id. A scene with no camera is simply absent. */
export type ObsSceneMapping = Record<string, string>;

export interface ObsBusAssignment {
  programId: string | null;
  previewId: string | null;
}

export const OBS_DEFAULT_URL = 'ws://localhost:4455';

/**
 * Which cameras OBS's current program/preview scenes address.
 *
 * Deliberately does *not* require the mapped camera to be currently connected:
 * a phone that drops off Wi-Fi for a few seconds would otherwise lose its
 * tally and get it back as a "change", and the tally payload is addressed by
 * peer id anyway, so an assignment for an absent camera is inert until it
 * reconnects.
 *
 * Preview is cleared when it resolves to the same camera as program — a lamp
 * cannot be both, and program wins.
 */
export function resolveObsBuses(
  programScene: string | null,
  previewScene: string | null,
  mapping: ObsSceneMapping,
): ObsBusAssignment {
  const programId = (programScene && mapping[programScene]) || null;
  const rawPreviewId = (previewScene && mapping[previewScene]) || null;
  const previewId = rawPreviewId && rawPreviewId !== programId ? rawPreviewId : null;

  return { programId, previewId };
}

/**
 * Drops mapping entries whose scene no longer exists in OBS, so a renamed or
 * deleted scene doesn't linger and silently shadow a later scene of the same
 * name. Cameras are *not* validated here — see resolveObsBuses for why.
 *
 * Returns the original object when nothing changed, so callers can use it as a
 * cheap equality check and skip a state update.
 */
export function pruneObsMapping(mapping: ObsSceneMapping, sceneNames: string[]): ObsSceneMapping {
  const known = new Set(sceneNames);
  const entries = Object.entries(mapping).filter(([scene]) => known.has(scene));
  if (entries.length === Object.keys(mapping).length) return mapping;
  return Object.fromEntries(entries);
}

/**
 * First-run convenience: pairs each still-unmapped scene with the next camera
 * that isn't spoken for yet, in list order (scene 1 -> CAM1, scene 2 -> CAM2…).
 *
 * Existing assignments are kept as-is — this is a "fill in the blanks" action,
 * not a reset — and scenes run out or cameras run out, whichever comes first.
 */
export function autoMapObsScenes(
  sceneNames: string[],
  clientIds: string[],
  existing: ObsSceneMapping = {},
): ObsSceneMapping {
  const next: ObsSceneMapping = { ...existing };
  const taken = new Set(Object.values(next));
  const available = clientIds.filter(id => !taken.has(id));

  let cursor = 0;
  for (const scene of sceneNames) {
    if (next[scene]) continue;
    if (cursor >= available.length) break;
    next[scene] = available[cursor];
    cursor += 1;
  }

  return next;
}

/**
 * Assigns (or, with `null`, clears) one scene, keeping the mapping one-to-one:
 * a camera can only be on one scene, so pointing a second scene at it releases
 * the first. Without that, two scenes could both claim CAM1 and which one won
 * would depend on OBS's scene order.
 */
export function setObsSceneCamera(
  mapping: ObsSceneMapping,
  sceneName: string,
  clientId: string | null,
): ObsSceneMapping {
  const next: ObsSceneMapping = {};
  for (const [scene, id] of Object.entries(mapping)) {
    if (scene === sceneName) continue;
    if (clientId && id === clientId) continue;
    next[scene] = id;
  }
  if (clientId) next[sceneName] = clientId;
  return next;
}

/**
 * ws:// to a non-local host is mixed content on an https:// page and the
 * browser kills the socket with an opaque error. localhost and the loopback
 * addresses are exempt (they count as potentially trustworthy), which is
 * exactly the supported setup — OBS on the same machine as this console — so
 * this exists to turn the confusing case into a message that says what to do.
 */
export function obsMixedContentWarning(url: string, pageProtocol: string): 'mixedContent' | null {
  if (pageProtocol !== 'https:') return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'ws:') return null;

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '::1';
  return isLoopback ? null : 'mixedContent';
}

/** Normalizes what a user typed into a ws:// URL, filling in the default port. */
export function normalizeObsUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return OBS_DEFAULT_URL;

  const withScheme = /^wss?:\/\//i.test(trimmed) ? trimmed : `ws://${trimmed}`;
  try {
    const parsed = new URL(withScheme);
    if (!parsed.port) parsed.port = '4455';
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return OBS_DEFAULT_URL;
  }
}

// Shared ICE server list for PeerJS (src/utils/PeerSync.ts) and the WebRTC
// video-monitoring peer connections (src/utils/WebRTCMediaService.ts).
//
// STUN alone lets two peers discover their public IP/port, but cannot
// traverse symmetric NAT (common on mobile carrier networks and CGNAT) or
// many restrictive corporate/hotel networks — in those cases the ICE
// handshake fails outright with no relay fallback, which is why P2P
// connections that work on a local network can fail entirely over the
// public internet. The TURN entries below (Open Relay Project's free,
// publicly documented demo credentials — see
// https://www.metered.ca/tools/openrelay/) relay traffic when a direct
// connection can't be established, at the cost of some added latency and a
// shared bandwidth quota. No account or deployment is required to use them.
export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:global.relay.metered.ca:80?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

/** localStorage key holding a per-device TURN override, as JSON. */
export const TURN_STORAGE_KEY = 'ltc-turn-config';

export interface TurnConfigInput {
  /** One or more TURN/STUN URLs; multiple entries are comma-separated. */
  urls?: string | null;
  username?: string | null;
  credential?: string | null;
}

/**
 * Puts a privately operated TURN server ahead of the shared public relays.
 *
 * The Open Relay demo credentials are a shared, quota-limited resource — fine
 * for getting started, not something to stake a paid shoot on. A production
 * crew with its own TURN server can point the app at it without touching the
 * source, and the public entries stay in the list underneath so a typo in
 * that configuration degrades to today's behaviour instead of killing
 * connectivity outright.
 */
export function buildIceServers(
  custom?: TurnConfigInput | null,
  defaults: RTCIceServer[] = DEFAULT_ICE_SERVERS,
): RTCIceServer[] {
  const urls = (custom?.urls ?? '')
    .split(',')
    .map(u => u.trim())
    .filter(Boolean);

  if (urls.length === 0) return [...defaults];

  const entry: RTCIceServer = { urls };
  const username = custom?.username?.trim();
  const credential = custom?.credential?.trim();
  // STUN entries carry no credentials, so only attach them when supplied —
  // an empty username/credential pair makes some browsers reject the server.
  if (username) entry.username = username;
  if (credential) entry.credential = credential;

  return [entry, ...defaults];
}

/**
 * Parses the JSON stored under TURN_STORAGE_KEY. Returns null for anything
 * that isn't a usable object, so malformed hand-edited configuration falls
 * back to the defaults rather than breaking every connection attempt.
 */
export function parseTurnConfig(raw: string | null | undefined): TurnConfigInput | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const { urls, username, credential } = parsed as Record<string, unknown>;
    if (typeof urls !== 'string' || urls.trim() === '') return null;
    return {
      urls,
      username: typeof username === 'string' ? username : undefined,
      credential: typeof credential === 'string' ? credential : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Resolution order: a per-device override in localStorage (set by hand for a
 * single problem phone) wins over the build-time VITE_TURN_* environment
 * variables (the deployment-wide default).
 */
function resolveTurnConfig(): TurnConfigInput | null {
  try {
    const stored = parseTurnConfig(localStorage.getItem(TURN_STORAGE_KEY));
    if (stored) return stored;
  } catch {
    // Private-mode / disabled storage: fall through to the env vars.
  }

  return {
    urls: import.meta.env.VITE_TURN_URLS,
    username: import.meta.env.VITE_TURN_USERNAME,
    credential: import.meta.env.VITE_TURN_CREDENTIAL,
  };
}

export const ICE_SERVERS: RTCIceServer[] = buildIceServers(resolveTurnConfig());

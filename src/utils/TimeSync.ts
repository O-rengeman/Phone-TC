import { debug } from './log';
import { STORAGE_KEYS } from './storage';

export interface TimeSyncResult {
  offset: number;
  latency: number;
  fromCache?: boolean;
}

const TIME_SERVERS = [
  'https://worldtimeapi.org/api/ip',
  'https://worldtimeapi.org/api/timezone/Etc/UTC',
  'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
];

const NTP_CACHE_KEY = STORAGE_KEYS.ntpCache;
const NTP_CACHE_TTL_MS = 3600000; // 1 hour
const FETCH_TIMEOUT_MS = 6000; // Abort a stuck time-server request after 6s
const TOTAL_SYNC_TIMEOUT_MS = 12000; // Total budget for all servers combined

// worldtimeapi.org uses `datetime`, timeapi.io uses `dateTime`
interface TimeServerResponse {
  dateTime?: string;
  datetime?: string;
  currentDateTime?: string;
}

interface CachedTimeSync {
  offset?: unknown;
  latency?: unknown;
  savedAt?: unknown;
}

/**
 * Parses an ISO-ish timestamp from a time server. Appends 'Z' only when the
 * string carries no zone designator of its own — an explicit offset like
 * '+09:00' is already unambiguous (the old code blindly appended 'Z' to
 * `dateTime` values that already had an offset, producing Invalid Date → NaN).
 * Returns null for anything unparseable so callers can skip the sample.
 */
function parseServerTimeMs(value: string | undefined): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  const hasZone = /(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(trimmed);
  const ms = new Date(hasZone ? trimmed : `${trimmed}Z`).getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** Same sanity bound the cache applies — rejects absurd offsets. */
const MAX_ABS_OFFSET_MS = 86400000; // 24h

export class TimeSync {
  public static async sync(samplesPerServer: number = 2): Promise<TimeSyncResult> {
    let bestSample: TimeSyncResult | null = null;
    const deadline = Date.now() + TOTAL_SYNC_TIMEOUT_MS;

    for (const server of TIME_SERVERS) {
      if (Date.now() >= deadline) break;
      debug(`Attempting sync with ${server}...`);
      for (let i = 0; i < samplesPerServer; i++) {
        if (Date.now() >= deadline) break;
        const remainingTime = Math.max(100, deadline - Date.now());
        const timeoutMs = Math.min(FETCH_TIMEOUT_MS, remainingTime);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const start = performance.now();
          const response = await fetch(`${server}${server.includes('?') ? '&' : '?'}nocache=${Date.now()}`, {
            cache: 'no-store',
            mode: 'cors',
            signal: controller.signal
          });
          const end = performance.now();

          if (!response.ok) continue;

          const data = (await response.json()) as TimeServerResponse;
          const serverTime = parseServerTimeMs(data.dateTime)
            ?? parseServerTimeMs(data.datetime)
            ?? parseServerTimeMs(data.currentDateTime);
          if (serverTime === null) continue;

          const rtt = end - start;
          const latency = rtt / 2;

          const estimatedServerTimeAtArrival = serverTime + latency;
          const localTimeAtArrival = Date.now();
          const offset = estimatedServerTimeAtArrival - localTimeAtArrival;

          // Never accept a non-finite or absurd offset — a malformed server
          // response must fall through to the next server/cache, not poison
          // the sync (NaN here used to reach Timecode and throw on start).
          if (!Number.isFinite(offset) || Math.abs(offset) > MAX_ABS_OFFSET_MS) continue;

          if (!bestSample || latency < bestSample.latency) {
            bestSample = { offset, latency };
          }

          if (latency < 50) break;
        } catch (err) {
          console.warn(`Sample from ${server} failed:`, err);
        } finally {
          clearTimeout(timeoutId);
        }
      }

      if (bestSample) break;
    }

    if (!bestSample) {
      const cached = TimeSync.loadCache();
      if (cached) return { ...cached, fromCache: true };
      throw new Error('All time servers failed to respond.');
    }

    TimeSync.saveCache(bestSample);
    return bestSample;
  }

  private static saveCache(result: TimeSyncResult): void {
    try {
      localStorage.setItem(NTP_CACHE_KEY, JSON.stringify({ ...result, savedAt: Date.now() }));
    } catch { /* ignore */ }
  }

  private static loadCache(): TimeSyncResult | null {
    try {
      const raw = localStorage.getItem(NTP_CACHE_KEY);
      if (!raw) return null;
      const { offset, latency, savedAt } = JSON.parse(raw) as CachedTimeSync;
      if (typeof offset !== 'number' || !isFinite(offset) || Math.abs(offset) > 86400000) return null;
      if (typeof latency !== 'number' || !isFinite(latency) || latency < 0) return null;
      if (typeof savedAt !== 'number' || Date.now() - savedAt > NTP_CACHE_TTL_MS) return null;
      return { offset, latency };
    } catch {
      return null;
    }
  }
}

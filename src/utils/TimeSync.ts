export interface TimeSyncResult {
  offset: number;
  latency: number;
  fromCache?: boolean;
}

const TIME_SERVERS = [
  'https://worldtimeapi.org/api/ip',
  'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
];

const NTP_CACHE_KEY = 'ltc-ntp-cache';
const NTP_CACHE_TTL_MS = 3600000; // 1 hour

export class TimeSync {
  public static async sync(samplesPerServer: number = 2): Promise<TimeSyncResult> {
    let bestSample: TimeSyncResult | null = null;

    for (const server of TIME_SERVERS) {
      console.log(`Attempting sync with ${server}...`);
      for (let i = 0; i < samplesPerServer; i++) {
        try {
          const start = performance.now();
          const response = await fetch(`${server}${server.includes('?') ? '&' : '?'}nocache=${Date.now()}`, {
            cache: 'no-store',
            mode: 'cors'
          });
          const end = performance.now();

          if (!response.ok) continue;

          const data = await response.json();
          let serverTime: number;
          if (data.dateTime) {
            serverTime = new Date(data.dateTime + (data.dateTime.endsWith('Z') ? '' : 'Z')).getTime();
          } else if (data.datetime) {
            serverTime = new Date(data.datetime).getTime();
          } else {
            continue;
          }
          const rtt = end - start;
          const latency = rtt / 2;

          const estimatedServerTimeAtArrival = serverTime + latency;
          const localTimeAtArrival = Date.now();
          const offset = estimatedServerTimeAtArrival - localTimeAtArrival;

          if (!bestSample || latency < bestSample.latency) {
            bestSample = { offset, latency };
          }

          if (latency < 50) break;
        } catch (err) {
          console.warn(`Sample from ${server} failed:`, err);
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
      const { offset, latency, savedAt } = JSON.parse(raw);
      if (Date.now() - savedAt > NTP_CACHE_TTL_MS) return null;
      return { offset, latency };
    } catch {
      return null;
    }
  }
}

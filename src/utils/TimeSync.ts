export interface TimeSyncResult {
  offset: number; // Offset in milliseconds (Network Time - Local Time)
  latency: number; // Network latency (one-way)
}

const TIME_SERVERS = [
  'https://worldtimeapi.org/api/ip',
  'https://timeapi.io/api/Time/current/zone?timeZone=UTC',
];

export class TimeSync {
  /**
   * Fetches the network time and calculates the offset compared to the local clock.
   * Tries multiple servers if one fails.
   */
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
          // Extract time and ensure it's treated as UTC
          let serverTime: number;
          if (data.dateTime) {
            // timeapi.io format (dateTime is already UTC ISO string)
            serverTime = new Date(data.dateTime + (data.dateTime.endsWith('Z') ? '' : 'Z')).getTime();
          } else if (data.datetime) {
            // worldtimeapi format
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
          
          // If we got a good sample, we can potentially break early from this server
          if (latency < 50) break; 
        } catch (err) {
          console.warn(`Sample from ${server} failed:`, err);
        }
      }
      
      // If we found a successful sync from any server, we can stop
      if (bestSample) break;
    }

    if (!bestSample) {
      throw new Error('All time servers failed to respond.');
    }

    return bestSample;
  }
}

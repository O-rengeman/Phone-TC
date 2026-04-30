export class SmartClock {
  private rttHistory: number[] = [];
  private diffHistory: number[] = [];
  private lastSyncTime: number = 0;
  
  // Configuration
  private readonly historySize = 15;
  private readonly jamThreshold = 0.03; // 30ms (approx 1 frame)
  private readonly forceSyncInterval = 15000; // 15s
  private readonly hbJamThreshold = 0.05; // 50ms for less precise heartbeats

  constructor() {
    this.lastSyncTime = Date.now();
  }

  /**
   * Records a precise sync response (sync-response) with known RTT.
   */
  public addPrecisionSample(rtt: number, currentDiff: number): { 
    shouldSync: boolean, 
    effectiveLatency: number, 
    isStable: boolean, 
    bestRtt: number 
  } {
    // 1. Packet Loss & Jitter Protection: Ignore ridiculous RTTs
    if (rtt < 0 || rtt > 5000) {
      return { shouldSync: false, effectiveLatency: 0, isStable: false, bestRtt: 0 };
    }

    // Update histories
    this.rttHistory.push(rtt);
    if (this.rttHistory.length > this.historySize) this.rttHistory.shift();
    
    this.diffHistory.push(currentDiff);
    if (this.diffHistory.length > this.historySize) this.diffHistory.shift();

    // Calculate stability
    const avgRtt = this.rttHistory.reduce((a, b) => a + b, 0) / this.rttHistory.length;
    const isStable = rtt <= avgRtt * 1.5 || rtt < 80;
    
    // Sort to find median diff for smoothing out transient spikes
    const sortedDiffs = [...this.diffHistory].sort((a, b) => a - b);
    const medianDiff = sortedDiffs[Math.floor(sortedDiffs.length / 2)];

    const timeSinceLastSync = Date.now() - this.lastSyncTime;
    const bestRtt = Math.min(...this.rttHistory);
    
    // We decide to sync if the median drift > threshold (meaning it's a persistent drift)
    // or if enough time has passed.
    const shouldSync = (Math.abs(medianDiff) >= this.jamThreshold && isStable) || timeSinceLastSync >= this.forceSyncInterval;
    
    if (shouldSync) {
       this.lastSyncTime = Date.now();
       this.diffHistory = []; // Reset after sync to prevent ping-pong
    }

    return {
      shouldSync,
      effectiveLatency: rtt / 2, // One way latency
      isStable,
      bestRtt
    };
  }

  /**
   * Records a coarse heartbeat sample without precise RTT.
   */
  public addCoarseSample(currentDiff: number): {
    shouldSync: boolean,
    assumedLatency: number
  } {
    this.diffHistory.push(currentDiff);
    if (this.diffHistory.length > this.historySize) this.diffHistory.shift();

    const timeSinceLastSync = Date.now() - this.lastSyncTime;
    
    // For heartbeats, we require a larger drift (hbJamThreshold) or timeout
    // because we don't know the exact latency.
    const sortedDiffs = [...this.diffHistory].sort((a, b) => a - b);
    const medianDiff = sortedDiffs[Math.floor(sortedDiffs.length / 2)];

    const shouldSync = Math.abs(medianDiff) >= this.hbJamThreshold || timeSinceLastSync >= this.forceSyncInterval;

    if (shouldSync) {
      this.lastSyncTime = Date.now();
      this.diffHistory = [];
    }

    return {
      shouldSync,
      assumedLatency: 0.03 // Assume 30ms latency for generic network broadcast
    };
  }

  public getNeedsAggressiveSync(currentDiff: number): boolean {
    const timeSinceLastSync = Date.now() - this.lastSyncTime;
    // Client checks if it should trigger a burst request
    return Math.abs(currentDiff) >= this.jamThreshold || timeSinceLastSync >= this.forceSyncInterval;
  }
}

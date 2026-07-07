/**
 * DriftMonitor — phone-clock drift tracking & accuracy reporting.
 *
 * Why this exists (market context):
 * Smartphones lack the high-precision TCXO crystal found in dedicated timecode
 * hardware (Tentacle Sync E, Deity TC-1). As a result every phone-based LTC
 * generator slowly drifts away from true time, and the #1 trust complaint about
 * phone timecode apps is "it silently goes out of sync." Competing apps hide
 * this; we surface it honestly.
 *
 * The monitor records each successful time-sync (NTP / network / external jam)
 * and, from two or more samples, *measures* the device's actual clock drift
 * rate in parts-per-million (ppm). Between syncs it extrapolates the estimated
 * accumulated drift so the UI can show:
 *   - how long ago we last synced,
 *   - the estimated current error (ms and frames at the active FPS),
 *   - whether a re-sync ("re-jam") is recommended.
 *
 * Pure logic only — no DOM, no timers — so it is trivially unit-testable and
 * reusable from the worklet, the UI, or a background task.
 */

/** A single time-sync observation. */
export interface DriftSample {
  /** Measured local-vs-true clock offset in ms (true = local + offset). */
  offset: number;
  /** Local wall-clock timestamp (Date.now()) when the sample was taken. */
  at: number;
}

export type DriftConfidence = 'high' | 'medium' | 'low' | 'none';

export interface DriftStatus {
  /** Whether at least one sync has been recorded. */
  hasSync: boolean;
  /** ms elapsed since the most recent sync. */
  msSinceSync: number;
  /** Drift rate used for the estimate, in ppm (signed). */
  driftRatePpm: number;
  /** True once the rate is measured from >=2 samples (vs. assumed default). */
  measured: boolean;
  /** Estimated accumulated error since the last sync, in ms (absolute). */
  estimatedDriftMs: number;
  /** Estimated accumulated error expressed in frames at the given FPS. */
  estimatedDriftFrames: number;
  /** Confidence in the current timecode accuracy. */
  confidence: DriftConfidence;
  /** True when the estimated drift warrants re-syncing. */
  rejamRecommended: boolean;
}

export interface DriftMonitorOptions {
  /**
   * Drift rate (ppm) assumed before we can measure one. Consumer-grade phone
   * oscillators are commonly within +-20..50 ppm; we use a conservative
   * magnitude so early warnings are not over-optimistic.
   */
  assumedPpm?: number;
  /** Re-jam is recommended once estimated drift reaches this many frames. */
  rejamFrameThreshold?: number;
  /** Hard ceiling (ms) after which re-jam is always recommended. */
  maxSyncAgeMs?: number;
  /** Smoothing factor (0..1) for the measured-rate EMA. Higher = more reactive. */
  rateSmoothing?: number;
}

const DEFAULTS: Required<DriftMonitorOptions> = {
  assumedPpm: 30,
  rejamFrameThreshold: 0.5,
  maxSyncAgeMs: 60 * 60 * 1000, // 1 hour
  rateSmoothing: 0.5,
};

/**
 * Reject samples whose implied drift rate is physically implausible for a
 * crystal oscillator (e.g. a flaky NTP response). 1000 ppm = 0.1%, already far
 * beyond any real device — anything larger is almost certainly a bad reading.
 */
const MAX_PLAUSIBLE_PPM = 1000;

export class DriftMonitor {
  private readonly opts: Required<DriftMonitorOptions>;
  private last: DriftSample | null = null;
  private measuredPpm: number | null = null;

  constructor(options: DriftMonitorOptions = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  /** Discard all history (e.g. on engine stop or a fresh manual jam). */
  public reset(): void {
    this.last = null;
    this.measuredPpm = null;
  }

  /**
   * Record a successful time-sync.
   *
   * @param offset Measured clock offset in ms (true = local + offset).
   * @param at     Local timestamp of the sample; defaults to Date.now().
   */
  public addSync(offset: number, at: number = Date.now()): void {
    if (!Number.isFinite(offset) || !Number.isFinite(at)) return;

    const prev = this.last;
    if (prev) {
      const dt = at - prev.at;
      // Need a meaningful, forward-moving interval to derive a rate. Below ~2s
      // the offset jitter dominates and produces garbage ppm values.
      if (dt >= 2000) {
        const dOffset = offset - prev.offset;
        const ppm = (dOffset / dt) * 1e6;
        if (Math.abs(ppm) <= MAX_PLAUSIBLE_PPM) {
          const a = this.opts.rateSmoothing;
          this.measuredPpm =
            this.measuredPpm === null ? ppm : this.measuredPpm * (1 - a) + ppm * a;
        }
      }
    }

    this.last = { offset, at };
  }

  /** ms since the last sync, or Infinity if never synced. */
  public msSinceSync(now: number = Date.now()): number {
    return this.last ? Math.max(0, now - this.last.at) : Infinity;
  }

  /**
   * Compute the current drift status for a given frame rate.
   *
   * @param fps Active frames-per-second (used to convert ms drift to frames).
   * @param now Local timestamp; defaults to Date.now().
   */
  public getStatus(fps: number, now: number = Date.now()): DriftStatus {
    const safeFps = fps > 0 ? fps : 25;

    if (!this.last) {
      return {
        hasSync: false,
        msSinceSync: Infinity,
        driftRatePpm: 0,
        measured: false,
        estimatedDriftMs: 0,
        estimatedDriftFrames: 0,
        confidence: 'none',
        rejamRecommended: true,
      };
    }

    const measured = this.measuredPpm !== null;
    // Use the measured magnitude when available, otherwise the assumed rate.
    const ratePpm = measured ? (this.measuredPpm as number) : this.opts.assumedPpm;
    const msSinceSync = Math.max(0, now - this.last.at);

    const estimatedDriftMs = (msSinceSync * Math.abs(ratePpm)) / 1e6;
    const estimatedDriftFrames = (estimatedDriftMs / 1000) * safeFps;

    const rejamRecommended =
      estimatedDriftFrames >= this.opts.rejamFrameThreshold ||
      msSinceSync >= this.opts.maxSyncAgeMs;

    return {
      hasSync: true,
      msSinceSync,
      driftRatePpm: ratePpm,
      measured,
      estimatedDriftMs,
      estimatedDriftFrames,
      confidence: this.classifyConfidence(estimatedDriftFrames, measured, rejamRecommended),
      rejamRecommended,
    };
  }

  private classifyConfidence(
    driftFrames: number,
    measured: boolean,
    rejamRecommended: boolean,
  ): DriftConfidence {
    if (rejamRecommended) return 'low';
    const half = this.opts.rejamFrameThreshold;
    // Comfortably inside a quarter-frame and we have a real measurement: high.
    if (measured && driftFrames < half * 0.5) return 'high';
    return 'medium';
  }
}

/**
 * Format ms-since-sync as a compact human string, e.g. "12s", "3m", "1h04m".
 */
export function formatSyncAge(ms: number): string {
  if (!Number.isFinite(ms)) return '—';
  const totalSec = Math.floor(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const min = Math.floor(totalSec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h${remMin.toString().padStart(2, '0')}m`;
}

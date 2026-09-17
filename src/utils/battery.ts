/**
 * battery.ts — runtime estimation helpers for the on-screen battery readout.
 *
 * On long shoots the #1 anxiety is "will the phone die mid-take?". The Battery
 * Status API exposes the charge level but rarely a trustworthy time-to-empty,
 * so we estimate it ourselves from observed drain: sample (level, time) while
 * discharging and extrapolate linearly to 0%.
 *
 * Pure logic only — no DOM — so it is unit-testable.
 */

export interface BatterySample {
  /** Battery level as a fraction 0..1. */
  level: number;
  /** Timestamp (Date.now()) when the sample was taken, in ms. */
  at: number;
}

/** Minimum observation window before an estimate is trustworthy. */
const MIN_WINDOW_MS = 60_000;

/**
 * Estimate minutes until the battery reaches 0% from drain samples.
 * Returns null when there isn't enough data, the device is charging, or the
 * level is flat/rising (no measurable drain).
 */
export function estimateMinutesRemaining(samples: readonly BatterySample[]): number | null {
  if (!samples || samples.length < 2) return null;

  const first = samples[0];
  const last = samples[samples.length - 1];

  const dt = last.at - first.at;
  if (!Number.isFinite(dt) || dt < MIN_WINDOW_MS) return null;

  const drained = first.level - last.level; // positive while discharging
  if (drained <= 0) return null;

  const ratePerMs = drained / dt; // fraction per ms
  if (ratePerMs <= 0) return null;

  const minutes = last.level / ratePerMs / 60_000;
  if (!Number.isFinite(minutes) || minutes <= 0) return null;

  return minutes;
}

/**
 * Trim a sample buffer to a trailing time window (keeping >=2 samples so an
 * estimate is still possible). Returns a new array; does not mutate the input.
 */
export function trimSamples(
  samples: readonly BatterySample[],
  now: number,
  windowMs: number,
): BatterySample[] {
  const cutoff = now - windowMs;
  const out = samples.slice();
  while (out.length > 2 && out[0].at < cutoff) out.shift();
  return out;
}

/** Format minutes as a compact duration: "45m", "3h07m". */
export function formatDuration(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return '—';
  const total = Math.round(minutes);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m}m`;
  return `${h}h${m.toString().padStart(2, '0')}m`;
}

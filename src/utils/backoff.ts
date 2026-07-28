// Shared retry pacing for reconnect loops (PeerSync signaling socket,
// useP2P client re-link). A fixed retry interval is the wrong shape for
// on-set failures: a Wi-Fi/cellular handoff recovers in well under a second,
// so the first retry should be near-immediate, while a phone that left
// coverage entirely (tunnel, basement, radio off) can stay down for minutes —
// retrying at the same short interval there just burns battery and floods the
// signaling server. Exponential growth covers both, and the jitter keeps a
// roomful of devices that all dropped at once from retrying in lockstep.

export interface BackoffOptions {
  /** Delay for the first retry, in ms. */
  baseDelayMs?: number;
  /** Upper bound the exponential growth is clamped to, in ms. */
  maxDelayMs?: number;
  /** Fraction of the delay randomly added/subtracted, in [0, 1]. */
  jitterRatio?: number;
}

export const DEFAULT_BACKOFF: Required<BackoffOptions> = {
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterRatio: 0.2,
};

/**
 * Delay before retry number `attempt` (0-based: attempt 0 is the first retry
 * after a failure). Grows as base * 2^attempt, clamped to maxDelayMs, then
 * spread by ±jitterRatio. Never returns a negative delay.
 *
 * `random` is injectable so callers — and tests — can make the result
 * deterministic; it defaults to Math.random.
 */
export function computeBackoffDelay(
  attempt: number,
  options: BackoffOptions = {},
  random: () => number = Math.random,
): number {
  const { baseDelayMs, maxDelayMs, jitterRatio } = { ...DEFAULT_BACKOFF, ...options };

  const safeAttempt = Math.max(0, Math.floor(attempt));
  // 2^safeAttempt overflows to Infinity for large attempt counts; clamping the
  // exponent first keeps the multiplication finite before maxDelayMs applies.
  const growth = 2 ** Math.min(safeAttempt, 31);
  const delay = Math.min(baseDelayMs * growth, maxDelayMs);

  const spread = Math.min(Math.max(jitterRatio, 0), 1);
  const jitter = delay * spread * (random() * 2 - 1);

  return Math.max(0, Math.round(delay + jitter));
}

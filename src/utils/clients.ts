import { CLIENT_DRIFT_WARN_SEC, CLIENT_OFFLINE_AFTER_MS } from '../constants';

/**
 * clients.ts — shared "is this connected camera offline/drifting" predicates.
 *
 * The same rules were re-implemented per component with drifting values
 * (offline 30000ms in three places; drift warn at 0.03s on desktop vs 0.5s
 * positive-only on mobile). One definition keeps every screen consistent.
 */

export interface ClientStatLike {
  lastSeen: number;
  rtt: number;
  drift: number;
}

export function isClientOffline(stats: { lastSeen: number }, now: number): boolean {
  return now - stats.lastSeen > CLIENT_OFFLINE_AFTER_MS;
}

/** Absolute drift at or beyond the warn threshold — sign-insensitive. */
export function isClientDrifting(drift: number): boolean {
  return Math.abs(drift) >= CLIENT_DRIFT_WARN_SEC;
}

import { useSyncExternalStore } from 'react';

/**
 * activityLog.ts — the desktop console's session event log.
 *
 * A tiny external store (module-level, newest-first, capped) so entries
 * survive tab switches without living in React state. Entries carry an i18n
 * KEY + vars rather than rendered text, so the log re-localizes when the
 * operator flips EN/JA mid-session.
 */

export type ActivityKind =
  | 'transportStart'
  | 'transportStop'
  | 'transportPause'
  | 'marker'
  | 'p2p'
  | 'syncMode'
  | 'rejam';

export interface ActivityEntry {
  id: number;
  /** epoch ms */
  at: number;
  kind: ActivityKind;
  vars?: Record<string, string | number>;
}

const MAX_ENTRIES = 200;

let entries: ActivityEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit(): void {
  for (const fn of listeners) fn();
}

export function logActivity(kind: ActivityKind, vars?: Record<string, string | number>): void {
  entries = [{ id: nextId++, at: Date.now(), kind, vars }, ...entries].slice(0, MAX_ENTRIES);
  emit();
}

export function clearActivityLog(): void {
  entries = [];
  emit();
}

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Non-hook snapshot for tests and one-off reads. */
export function getActivityEntries(): ActivityEntry[] {
  return entries;
}

export function useActivityLog(): ActivityEntry[] {
  return useSyncExternalStore(subscribe, getActivityEntries);
}

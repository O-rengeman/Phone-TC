/**
 * tally.ts — tally-lamp state logic (pure, DOM-free, unit-testable).
 *
 * A tally lamp shows whether a camera is on PROGRAM (live), on PREVIEW, on
 * standby, or off. In this app the state can come from a P2P master (the
 * director's device) addressing each client camera, or — when not connected —
 * fall back to the device's local manual tally state.
 *
 * The React layer keeps the latest payload (by rev) and calls `resolveTally`
 * each render; all the branching lives here so it can be tested in isolation.
 */

export type TallyState = 'live' | 'preview' | 'standby' | 'off';

export const TALLY_STATES: readonly TallyState[] = ['live', 'preview', 'standby', 'off'];

/** Tally assignment broadcast by the master over the P2P channel. */
export interface TallyPayload {
  /** Monotonically increasing revision; receivers ignore older payloads. */
  rev: number;
  /** Default state for clients without an explicit per-camera assignment. */
  all: TallyState;
  /** Per-client (camera) overrides, keyed by the client's peer id. */
  assignments: Record<string, TallyState>;
}

export interface TallyContext {
  /** True when this device is a P2P client receiving from a master. */
  connected: boolean;
  /** Standalone local tally state when not receiving a master assignment. */
  manualState?: TallyState;
}

/**
 * Resolve the effective tally state for this device.
 * - Networked client with a payload -> per-camera assignment, else the `all` default.
 * - Otherwise (standalone) -> explicit local manual state (default off).
 */
export function resolveTally(
  payload: TallyPayload | null,
  myId: string,
  ctx: TallyContext,
): TallyState {
  if (ctx.connected && payload) {
    return payload.assignments[myId] ?? payload.all;
  }
  return ctx.manualState ?? 'off';
}

/**
 * Keep whichever payload is newer by `rev` (handles out-of-order / duplicate
 * delivery on the data channel). Never returns an older payload.
 */
export function adoptTally(
  current: TallyPayload | null,
  incoming: TallyPayload | null,
): TallyPayload | null {
  if (!incoming) return current;
  if (!current) return incoming;
  return incoming.rev >= current.rev ? incoming : current;
}

/** Solid background color for each state (color is reinforced by a label in UI). */
export const TALLY_COLORS: Record<TallyState, string> = {
  live: '#ff1a1a',
  preview: '#16a34a',
  standby: '#b45309',
  off: '#0a0a0a',
};

/** i18n key for the state's short label (LIVE / PVW / STBY / dash). */
export function tallyLabelKey(state: TallyState): string {
  return `tally.${state}`;
}

/** The torch LED should illuminate only on PROGRAM (live). */
export function tallyTorchOn(state: TallyState): boolean {
  return state === 'live';
}

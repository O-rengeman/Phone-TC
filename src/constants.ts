// Shared app-wide constants. Kept in a plain module (no component/hook
// exports) so files that co-export components and hooks — like
// LTCSyncContext.tsx — don't also need to export constants and trip
// react-refresh/only-export-components.

export const FPS_OPTIONS = [
  { label: '23.976', value: 23.976, drop: false, fpsNum: 24000, fpsDen: 1001 },
  { label: '24', value: 24, drop: false, fpsNum: 24000, fpsDen: 1000 },
  { label: '25', value: 25, drop: false, fpsNum: 25000, fpsDen: 1000 },
  { label: '29.97', value: 29.97, drop: false, fpsNum: 30000, fpsDen: 1001 },
  { label: '29.97 DF', value: 29.97, drop: true, fpsNum: 30000, fpsDen: 1001 },
  { label: '30', value: 30, drop: false, fpsNum: 30000, fpsDen: 1000 },
];

export const MARKER_HEX: Record<string, string> = {
  Red: '#ff3b40', Blue: '#3b82f6', Green: '#22c55e', Yellow: '#f59e0b',
};

// ---------------------------------------------------------------------------
// P2P sync tuning. These values were previously scattered as literals through
// LTCSyncContext.tsx; the send-side (client sync-request) and receive-side
// (sync-response/heartbeat apply) thresholds describe the same rule and must
// move together, so they live here.
// ---------------------------------------------------------------------------

/** Max interval between client-initiated sync corrections while drifted. */
export const MAX_SYNC_INTERVAL_MS = 15000;

/** Drift (seconds) that triggers an immediate sync-request burst / jam. */
export const DRIFT_RESYNC_THRESHOLD_SEC = 0.03;
/** Heartbeat-path drift threshold — intentionally looser than sync-response. */
export const HEARTBEAT_RESYNC_THRESHOLD_SEC = 0.05;

/** |diff| beyond this switches the client from nudge to full jam. */
export const JAM_THRESHOLD_SEC = 0.5;

/** RTT samples above this are discarded as implausible. */
export const MAX_VALID_RTT_MS = 5000;
/** Rolling RTT history length used for stability/spike detection. */
export const RTT_HISTORY_LEN = 15;
/** RTT counts as stable when <= avg * this factor, or below the floor. */
export const RTT_SPIKE_FACTOR = 1.5;
export const RTT_STABLE_FLOOR_MS = 80;

/**
 * Assumed one-way latency (ms) applied to heartbeat syncs, which carry no
 * RTT sample. Was `0.03` — a unit bug that rounded to 0 frames of correction.
 */
export const HEARTBEAT_ASSUMED_LATENCY_MS = 30;

/**
 * Client telemetry reports are gated to this window: a report is sent when
 * `Date.now() % CLIENT_REPORT_WINDOW_MS < CLIENT_REPORT_WINDOW_SLACK_MS`,
 * which with the 100ms heartbeat cadence yields ~1 report/sec on average.
 */
export const CLIENT_REPORT_WINDOW_MS = 5000;
export const CLIENT_REPORT_WINDOW_SLACK_MS = 500;

// ---------------------------------------------------------------------------
// Connected-client display thresholds — shared by mobile ClientList and the
// desktop SyncPane/DesktopShell so the same client never shows different
// states on different screens.
// ---------------------------------------------------------------------------

export const CLIENT_OFFLINE_AFTER_MS = 30000;
export const CLIENT_DRIFT_WARN_SEC = 0.03;

/** Frame-offset nudge range — shared by the TimecodePane slider and the
    [ / ] keyboard shortcuts so both enforce the same bounds. */
export const OUTPUT_OFFSET_MIN = -10;
export const OUTPUT_OFFSET_MAX = 10;

// ---------------------------------------------------------------------------
// App version — keep in sync with package.json `version`.
// ---------------------------------------------------------------------------

export const APP_VERSION = '1.3.0';

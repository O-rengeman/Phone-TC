import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { LtcEngine } from '../utils/LtcEngine';
import { buildEdl, buildAle, buildFcpxml, buildResolveMarkers, buildCsv } from '../utils/export';
import { buildOtio } from '../utils/otio';
import { parseTcFrame } from '../utils/markerTimeline';
import type { Marker, MarkerColor } from '../utils/export';
import { t as translate } from '../utils/i18n';
import type { Lang } from '../utils/i18n';
import { FPS_OPTIONS } from '../constants';
import { STORAGE_KEYS, readStoredString, writeStoredString } from '../utils/storage';

/** Where the raw markers payload is preserved when it fails to load cleanly. */
const CORRUPT_MARKERS_BACKUP_KEY = 'ltc-markers-corrupt-backup';
const MARKER_BACKUP_FILE = 'ltc_sync_pro_backup.json';
import type { SyncMode } from '../LTCSyncContext';
import type { DriftMonitor } from '../utils/DriftMonitor';
import type { MarkerSync } from '../utils/export';

type ToastLevel = 'info' | 'warn' | 'error';
type MarkerFlash = { tc: string; color: string; count: number } | null;

const MARKER_FLASH_MS = 1300;
// Every keystroke in a comment rewrites markers state — persist to
// localStorage immediately (cheap) but debounce the native filesystem
// backup so we don't do a full-file write per character.
const MARKER_BACKUP_DEBOUNCE_MS = 2000;

const MARKER_COLORS: ReadonlySet<string> = new Set<MarkerColor>(['Red', 'Blue', 'Green', 'Yellow']);
const SYNC_METHODS: ReadonlySet<string> = new Set(['network', 'p2p', 'system', 'freerun']);
const SYNC_CONFIDENCE: ReadonlySet<string> = new Set(['high', 'medium', 'low', 'none']);

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');
const asFiniteNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * A stored TC string is usable only if it parses under at least one frame rate
 * the app supports — markers logged while a different fps setting was active
 * still round-trip. Format alone is not enough: ';' DF labels and frame fields
 * are validated against the rate (smpte-timecode throws on mismatches).
 */
function parseStoredTc(tc: unknown): string | null {
  if (typeof tc !== 'string') return null;
  return FPS_OPTIONS.some(o => parseTcFrame(tc, o.value, o.drop) !== null) ? tc : null;
}

/** Malformed sync metadata is dropped; it must never poison the marker itself. */
function sanitizeSync(value: unknown): MarkerSync | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const s = value as Record<string, unknown>;
  if (typeof s.method !== 'string' || !SYNC_METHODS.has(s.method)) return undefined;
  const confidence = typeof s.confidence === 'string' && SYNC_CONFIDENCE.has(s.confidence)
    ? s.confidence as MarkerSync['confidence']
    : 'none';
  return {
    method: s.method as MarkerSync['method'],
    driftMs: asFiniteNumber(s.driftMs),
    driftFrames: asFiniteNumber(s.driftFrames),
    msSinceSync: asFiniteNumber(s.msSinceSync),
    confidence,
  };
}

/**
 * Per-marker validation for the persisted marker list: keeps entries that are
 * well-formed and drops corrupt ones (with a warning), instead of the old
 * all-or-nothing guard that discarded every stored marker when a single entry
 * was bad. Required fields (id/tc/color/take) must check out; string fields are
 * coerced to '' when missing or wrong-typed.
 */
function sanitizeMarker(raw: unknown): Marker | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const m = raw as Record<string, unknown>;
  const tc = parseStoredTc(m.tc);
  if (tc === null) return null;
  if (typeof m.id !== 'number' || !Number.isFinite(m.id)) return null;
  if (typeof m.color !== 'string' || !MARKER_COLORS.has(m.color)) return null;
  if (typeof m.take !== 'number' || !Number.isFinite(m.take)) return null;
  return {
    id: m.id,
    tc,
    time: asString(m.time),
    color: m.color as MarkerColor,
    reelName: asString(m.reelName),
    take: m.take,
    sceneName: asString(m.sceneName),
    comment: asString(m.comment),
    sync: sanitizeSync(m.sync),
  };
}

/** Returns the sanitized marker array, or undefined when the payload isn't one. */
function sanitizeMarkers(raw: unknown): Marker[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const list: readonly unknown[] = raw;
  const clean = list.map(sanitizeMarker).filter((m): m is Marker => m !== null);
  const dropped = list.length - clean.length;
  if (dropped > 0) {
    console.warn(`useMarkers: dropped ${dropped} invalid stored marker(s)`);
  }
  // Legacy Date.now() ids could collide on same-ms double-adds — reassign
  // duplicates so React keys and remove/update lookups stay unambiguous.
  const seen = new Set<number>();
  let highestId = 0;
  return clean.map(m => {
    highestId = Math.max(highestId, m.id);
    if (!seen.has(m.id)) {
      seen.add(m.id);
      return m;
    }
    const id = ++highestId;
    seen.add(id);
    return { ...m, id };
  });
}

interface UseMarkersParams {
  syncMode?: SyncMode;
  driftMonitorRef?: React.RefObject<DriftMonitor>;
  p2pDriftSeconds?: number | null;
  p2pLastSyncRef?: React.RefObject<number>;
  engineRef: React.RefObject<LtcEngine | null>;
  fpsIndex: number;
  defaultReelName: string;
  sceneName: string;
  langRef: React.RefObject<Lang>;
  addToast: (msg: string, level?: ToastLevel) => void;
}

interface UseMarkersResult {
  markers: Marker[];
  setMarkers: React.Dispatch<React.SetStateAction<Marker[]>>;
  markerFlash: MarkerFlash;
  addMarker: (color: MarkerColor) => void;
  removeMarker: (id: number) => void;
  updateMarkerComment: (id: number, comment: string) => void;
  exportToEDL: () => void;
  exportToALE: () => void;
  exportToFCPXML: () => void;
  exportToResolve: () => void;
  exportToCSV: () => void;
  exportToOTIO: () => void;
  /** Pending backup-restore offer (Issue #60): set when local storage was empty but the native backup file holds markers. */
  backupRestore: { count: number; markers: Marker[]; manual: boolean } | null;
  restoreFromBackup: () => void;
  dismissBackupRestore: () => void;
  requestBackupRestore: () => void;
}

/**
 * Owns marker CRUD, localStorage + native-filesystem backup persistence,
 * the transient "marker added" flash, and EDL/ALE export (delegating the
 * actual text building to the pure src/utils/export.ts helpers).
 */
export function useMarkers({
  engineRef,
  fpsIndex,
  defaultReelName,
  sceneName,
  langRef,
  addToast,
  syncMode = 'network',
  driftMonitorRef,
  p2pDriftSeconds = null,
  p2pLastSyncRef,
}: UseMarkersParams): UseMarkersResult {
  const syncRef = useRef({ syncMode, driftMonitorRef, p2pDriftSeconds, p2pLastSyncRef, fpsIndex });
  useEffect(() => { syncRef.current = { syncMode, driftMonitorRef, p2pDriftSeconds, p2pLastSyncRef, fpsIndex }; }, [syncMode, driftMonitorRef, p2pDriftSeconds, p2pLastSyncRef, fpsIndex]);
  const [markers, setMarkers] = useState<Marker[]>(() => {
    const raw = readStoredString(STORAGE_KEYS.markers);
    if (raw === null) return [];
    // Preserve the raw payload BEFORE the persist effect can overwrite it:
    // a partially corrupted save used to be replaced by the sanitized (or
    // empty) list on this very launch, making the loss permanent and
    // unrecoverable even though the original string was still readable.
    const preserveRaw = () => {
      writeStoredString(CORRUPT_MARKERS_BACKUP_KEY, raw);
      console.warn('useMarkers: preserved unreadable markers payload to', CORRUPT_MARKERS_BACKUP_KEY);
    };
    try {
      const parsed: unknown = JSON.parse(raw);
      const clean = sanitizeMarkers(parsed);
      if (clean === undefined) {
        preserveRaw();
        return [];
      }
      if (Array.isArray(parsed) && clean.length !== parsed.length) preserveRaw();
      return clean;
    } catch {
      preserveRaw();
      return [];
    }
  });
  const storageWarnedRef = useRef(false);
  // Issue #60: the native backup file (Documents/ltc_sync_pro_backup.json)
  // used to be write-only. When local storage comes up EMPTY on a native
  // build (WebView storage eviction is the known cause), offer the backup's
  // markers back — as a prompt, never a silent restore, so an operator who
  // deliberately cleared markers isn't haunted by their return.
  const [backupRestore, setBackupRestore] = useState<{ count: number; markers: Marker[]; manual: boolean } | null>(null);
  const backupCheckedRef = useRef(false);

  const restoreFromBackup = useCallback(() => {
    if (!backupRestore) return;
    setMarkers(backupRestore.markers);
    addToast(translate('toast.backupRestored', langRef.current, { count: backupRestore.count }));
    setBackupRestore(null);
  }, [backupRestore, addToast, langRef]);

  const dismissBackupRestore = useCallback(() => setBackupRestore(null), []);
  const [markerFlash, setMarkerFlash] = useState<MarkerFlash>(null);
  const markerFlashTimerRef = useRef<number | null>(null);
  const backupTimerRef = useRef<number | null>(null);
  const markersRef = useRef(markers);
  useEffect(() => { markersRef.current = markers; }, [markers]);

  // Reads the native backup file and, when it holds markers, raises the
  // restore offer. `requireEmpty` is the launch path (only offer when local
  // storage came up empty); the manual path offers regardless and lets the
  // banner's confirm step guard the overwrite.
  const loadBackupOffer = useCallback(async (requireEmpty: boolean, manual: boolean): Promise<boolean> => {
    if (!Capacitor.isNativePlatform()) return false;
    if (requireEmpty && markersRef.current.length > 0) return false;
    try {
      const res = await Filesystem.readFile({
        path: MARKER_BACKUP_FILE,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      const text = typeof res.data === 'string' ? res.data : await res.data.text();
      const clean = sanitizeMarkers(JSON.parse(text) as unknown);
      if (!clean || clean.length === 0) return false;
      if (requireEmpty && markersRef.current.length > 0) return false;
      setBackupRestore({ count: clean.length, markers: clean, manual });
      return true;
    } catch {
      return false; // No backup file yet (or unreadable) — nothing to offer.
    }
  }, []);

  const requestBackupRestore = useCallback(() => {
    void loadBackupOffer(false, true).then(found => {
      if (!found) addToast(translate('toast.backupNotFound', langRef.current), 'info');
    });
  }, [loadBackupOffer, addToast, langRef]);


  useEffect(() => {
    if (backupCheckedRef.current) return;
    backupCheckedRef.current = true;
    // Emptiness is re-checked when the read resolves (inside the loader):
    // a marker added while the read was in flight must not be offered an
    // overwrite.
    void loadBackupOffer(true, false);
  }, [loadBackupOffer]);

  useEffect(() => () => {
    if (markerFlashTimerRef.current !== null) clearTimeout(markerFlashTimerRef.current);
  }, []);

  const backupMarkers = useCallback(async (m: Marker[]) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: MARKER_BACKUP_FILE,
          data: JSON.stringify(m, null, 2),
          directory: Directory.Documents,
          encoding: Encoding.UTF8
        });
      }
    } catch (e) {
      console.warn('Backup to filesystem failed:', e);
    }
  }, []);

  useEffect(() => {
    const saved = writeStoredString(STORAGE_KEYS.markers, JSON.stringify(markers));
    if (saved) {
      // Re-arm the warning: a failure after storage recovers must warn again.
      storageWarnedRef.current = false;
    } else if (markers.length > 0 && !storageWarnedRef.current) {
      // Quota exceeded / storage unavailable: markers now exist only in
      // memory and will vanish on restart. Warn once (not per keystroke),
      // and only when there is actually something to lose — the mount-time
      // write of an empty list must not cry wolf on storage-less setups.
      storageWarnedRef.current = true;
      addToast(translate('toast.storageFull', langRef.current), 'error');
    }
    if (backupTimerRef.current !== null) clearTimeout(backupTimerRef.current);
    backupTimerRef.current = window.setTimeout(() => {
      void backupMarkers(markers);
    }, MARKER_BACKUP_DEBOUNCE_MS);
    return () => {
      if (backupTimerRef.current !== null) clearTimeout(backupTimerRef.current);
    };
  }, [markers, backupMarkers, addToast, langRef]);

  // Flush the latest markers to the native backup on unmount so a pending
  // debounced write isn't lost when the app is backgrounded/killed.
  useEffect(() => () => {
    void backupMarkers(markersRef.current);
  }, [backupMarkers]);

  const addMarker = (color: MarkerColor) => {
    const current = syncRef.current;
    const sync: MarkerSync = { method: current.syncMode, driftMs: null, driftFrames: null, msSinceSync: null, confidence: 'none' };
    const round = (value: number) => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
    const driftStatus = current.syncMode === 'network'
      ? current.driftMonitorRef?.current.getStatus(FPS_OPTIONS[current.fpsIndex].value, Date.now())
      : null;
    const lastP2pSync = current.p2pLastSyncRef?.current;
    if (driftStatus?.hasSync) {
      sync.driftMs = round(driftStatus.estimatedDriftMs);
      sync.driftFrames = round(driftStatus.estimatedDriftFrames);
      sync.msSinceSync = round(driftStatus.msSinceSync);
      sync.confidence = driftStatus.confidence;
    } else if (current.syncMode === 'p2p' && lastP2pSync && Number.isFinite(lastP2pSync) && current.p2pDriftSeconds !== null && Number.isFinite(current.p2pDriftSeconds)) {
      sync.driftMs = round(current.p2pDriftSeconds * 1000);
      sync.driftFrames = round(current.p2pDriftSeconds * FPS_OPTIONS[current.fpsIndex].value);
      sync.msSinceSync = round(Math.max(0, Date.now() - lastP2pSync));
    }
    const currentTC = engineRef.current ? engineRef.current.getTimecodeString() : '00:00:00:00';
    const baseMarker = {
      tc: currentTC,
      time: new Date().toLocaleTimeString(),
      color,
      reelName: defaultReelName,
      sceneName: sceneName,
      comment: '',
      sync,
    };
    setMarkers(prev => {
      // Sequential id/take computed inside the updater from the freshest list:
      // Date.now() ids collide on same-millisecond double-adds, and a stale
      // closure could hand two rapid adds the same take.
      const take = prev.reduce((max, m) => Math.max(max, Number.isFinite(m.take) ? m.take : 0), 0) + 1;
      const id = prev.reduce((max, m) => Math.max(max, Number.isFinite(m.id) ? m.id : 0), 0) + 1;
      return [{ ...baseMarker, id, take }, ...prev];
    });

    setMarkerFlash({ tc: currentTC, color, count: markers.length + 1 });
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(40);
    }
    if (markerFlashTimerRef.current !== null) clearTimeout(markerFlashTimerRef.current);
    markerFlashTimerRef.current = window.setTimeout(() => setMarkerFlash(null), MARKER_FLASH_MS);
  };

  const removeMarker = (id: number) => {
    setMarkers(prev => prev.filter(m => m.id !== id));
  };

  const updateMarkerComment = useCallback((id: number, comment: string) => {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, comment } : m));
  }, []);

  const exportFile = async (content: string, filename: string) => {
    const isNative = Capacitor.isNativePlatform();
    if (isNative) {
      try {
        await Filesystem.writeFile({
          path: filename,
          data: content,
          directory: Directory.Documents,
          encoding: Encoding.UTF8
        });
        addToast(translate('toast.exportSaved', langRef.current, { path: `Documents/${filename}` }));
      } catch (e) {
        console.error('File export failed', e);
        addToast(translate('toast.exportFailed', langRef.current), 'error');
      }
    } else {
      let url: string | null = null;
      try {
        const blob = new Blob([content], { type: 'text/plain' });
        url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
      } catch (e) {
        console.error('File export failed', e);
        addToast(translate('toast.exportFailed', langRef.current), 'error');
      } finally {
        if (url) URL.revokeObjectURL(url);
      }
    }
  };

  /** Local-time filename stamp (YYYY-MM-DD_HH-MM-SS-mmm) so exports never collide. */
  const exportStamp = (): string => {
    const d = new Date();
    const p = (n: number, w = 2) => String(n).padStart(w, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
  };

  /**
   * Runs a pure export builder and writes the result. A throwing builder
   * (e.g. a stored TC that no longer parses under the active frame rate)
   * becomes an error toast instead of an uncaught click-handler exception.
   */
  const exportToFile = (build: () => string, suffix: string) => {
    if (markers.length === 0) return;
    let content: string;
    try {
      content = build();
    } catch (e) {
      console.error('Marker export failed', e);
      addToast(translate('toast.exportFailed', langRef.current), 'error');
      return;
    }
    void exportFile(content, `PHONE_TC_${exportStamp()}${suffix}`);
  };

  /** Warns when the frame-based exporters had to skip markers (see #56). */
  const warnIfExportSkipped = () => {
    const fps = FPS_OPTIONS[fpsIndex];
    const skipped = markers.filter(m => parseTcFrame(m.tc, fps.value, fps.drop) === null).length;
    if (skipped > 0) {
      addToast(translate('toast.exportSkipped', langRef.current, { count: skipped }), 'warn');
    }
  };

  const exportToEDL = () => exportToFile(() => buildEdl(markers, FPS_OPTIONS[fpsIndex].drop), '.edl');
  const exportToALE = () => exportToFile(() => buildAle(markers, FPS_OPTIONS[fpsIndex].label), '.ale');
  const exportToFCPXML = () => { exportToFile(() => buildFcpxml(markers, FPS_OPTIONS[fpsIndex]), '.fcpxml'); warnIfExportSkipped(); };
  const exportToResolve = () => { exportToFile(() => buildResolveMarkers(markers, FPS_OPTIONS[fpsIndex]), '_resolve_markers.edl'); warnIfExportSkipped(); };
  const exportToCSV = () => exportToFile(() => String.fromCharCode(0xFEFF) + buildCsv(markers), '.csv');
  const exportToOTIO = () => exportToFile(() => buildOtio(markers, FPS_OPTIONS[fpsIndex]), '.otio');

  return { markers, setMarkers, markerFlash, addMarker, removeMarker, updateMarkerComment, exportToEDL, exportToALE, exportToFCPXML, exportToResolve, exportToCSV, exportToOTIO, backupRestore, restoreFromBackup, dismissBackupRestore, requestBackupRestore };
}

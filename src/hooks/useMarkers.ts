import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { LtcEngine } from '../utils/LtcEngine';
import { buildEdl, buildAle } from '../utils/export';
import type { Marker, MarkerColor } from '../utils/export';
import { t as translate } from '../utils/i18n';
import type { Lang } from '../utils/i18n';
import { FPS_OPTIONS } from '../constants';
import { STORAGE_KEYS, readStoredJson, writeStoredString } from '../utils/storage';
import type { SyncMode } from '../LTCSyncContext';
import type { DriftStatus } from '../utils/DriftMonitor';
import type { MarkerSync } from '../utils/export';

type ToastLevel = 'info' | 'warn' | 'error';
type MarkerFlash = { tc: string; color: string; count: number } | null;

const MARKER_FLASH_MS = 1300;
// Every keystroke in a comment rewrites markers state — persist to
// localStorage immediately (cheap) but debounce the native filesystem
// backup so we don't do a full-file write per character.
const MARKER_BACKUP_DEBOUNCE_MS = 2000;

const isMarkerArray = (v: unknown): v is Marker[] =>
  Array.isArray(v) && v.every(m =>
    typeof m === 'object' && m !== null
    && typeof (m as Marker).id === 'number'
    && typeof (m as Marker).tc === 'string');

interface UseMarkersParams {
  syncMode?: SyncMode;
  driftStatus?: DriftStatus | null;
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
  driftStatus = null,
  p2pDriftSeconds = null,
  p2pLastSyncRef,
}: UseMarkersParams): UseMarkersResult {
  const syncRef = useRef({ syncMode, driftStatus, p2pDriftSeconds, p2pLastSyncRef, fpsIndex });
  useEffect(() => { syncRef.current = { syncMode, driftStatus, p2pDriftSeconds, p2pLastSyncRef, fpsIndex }; }, [syncMode, driftStatus, p2pDriftSeconds, p2pLastSyncRef, fpsIndex]);
  const [markers, setMarkers] = useState<Marker[]>(() =>
    readStoredJson(STORAGE_KEYS.markers, [] as Marker[], isMarkerArray));
  const [markerFlash, setMarkerFlash] = useState<MarkerFlash>(null);
  const markerFlashTimerRef = useRef<number | null>(null);
  const backupTimerRef = useRef<number | null>(null);
  const markersRef = useRef(markers);
  useEffect(() => { markersRef.current = markers; }, [markers]);

  useEffect(() => () => {
    if (markerFlashTimerRef.current !== null) clearTimeout(markerFlashTimerRef.current);
  }, []);

  const backupMarkers = useCallback(async (m: Marker[]) => {
    try {
      if (Capacitor.isNativePlatform()) {
        await Filesystem.writeFile({
          path: 'ltc_sync_pro_backup.json',
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
    writeStoredString(STORAGE_KEYS.markers, JSON.stringify(markers));
    if (backupTimerRef.current !== null) clearTimeout(backupTimerRef.current);
    backupTimerRef.current = window.setTimeout(() => {
      void backupMarkers(markers);
    }, MARKER_BACKUP_DEBOUNCE_MS);
    return () => {
      if (backupTimerRef.current !== null) clearTimeout(backupTimerRef.current);
    };
  }, [markers, backupMarkers]);

  // Flush the latest markers to the native backup on unmount so a pending
  // debounced write isn't lost when the app is backgrounded/killed.
  useEffect(() => () => {
    void backupMarkers(markersRef.current);
  }, [backupMarkers]);

  const addMarker = (color: MarkerColor) => {
    const current = syncRef.current;
    const sync: MarkerSync = { method: current.syncMode === 'network' ? 'ntp' : current.syncMode, driftMs: null, driftFrames: null, msSinceSync: null, confidence: 'none' };
    const round = (value: number) => Number.isFinite(value) ? Math.round(value * 1000) / 1000 : null;
    if (current.syncMode === 'network' && current.driftStatus?.hasSync) {
      sync.driftMs = round(current.driftStatus.estimatedDriftMs);
      sync.driftFrames = round(current.driftStatus.estimatedDriftFrames);
      sync.msSinceSync = round(current.driftStatus.msSinceSync);
      sync.confidence = current.driftStatus.confidence;
    } else if (current.syncMode === 'p2p' && current.p2pDriftSeconds !== null && Number.isFinite(current.p2pDriftSeconds)) {
      sync.driftMs = round(current.p2pDriftSeconds * 1000);
      sync.driftFrames = round(current.p2pDriftSeconds * FPS_OPTIONS[current.fpsIndex].value);
      const lastSync = current.p2pLastSyncRef?.current;
      sync.msSinceSync = lastSync ? Math.max(0, Date.now() - lastSync) : null;
    }
    const currentTC = engineRef.current ? engineRef.current.getTimecodeString() : '00:00:00:00';
    const nextTake = markers.length > 0 ? Math.max(...markers.map(m => m.take || 0)) + 1 : 1;
    const newMarker: Marker = {
      id: Date.now(),
      tc: currentTC,
      time: new Date().toLocaleTimeString(),
      color,
      reelName: defaultReelName,
      take: nextTake,
      sceneName: sceneName,
      comment: '',
      sync,
    };
    setMarkers(prev => [newMarker, ...prev]);

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
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const exportToEDL = () => {
    if (markers.length === 0) return;
    const edl = buildEdl(markers, FPS_OPTIONS[fpsIndex].drop);
    void exportFile(edl, `PHONE_TC_${new Date().toISOString().slice(0, 10)}.edl`);
  };

  const exportToALE = () => {
    if (markers.length === 0) return;
    const ale = buildAle(markers, FPS_OPTIONS[fpsIndex].label);
    void exportFile(ale, `PHONE_TC_${new Date().toISOString().slice(0, 10)}.ale`);
  };

  return { markers, setMarkers, markerFlash, addMarker, removeMarker, updateMarkerComment, exportToEDL, exportToALE };
}

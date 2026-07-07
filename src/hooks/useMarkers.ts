import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import type { LtcEngine } from '../utils/LtcEngine';
import { buildEdl, buildAle } from '../utils/export';
import type { Marker, MarkerColor } from '../utils/export';
import { t as translate } from '../utils/i18n';
import type { Lang } from '../utils/i18n';
import { FPS_OPTIONS } from '../constants';

type ToastLevel = 'info' | 'warn' | 'error';
type MarkerFlash = { tc: string; color: string; count: number } | null;

const MARKER_FLASH_MS = 1300;

interface UseMarkersParams {
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
}: UseMarkersParams): UseMarkersResult {
  const [markers, setMarkers] = useState<Marker[]>(() => {
    try {
      const saved = localStorage.getItem('ltc-markers');
      if (!saved) return [];
      const parsed = JSON.parse(saved) as unknown;
      return Array.isArray(parsed) ? (parsed as Marker[]) : [];
    } catch { return []; }
  });
  const [markerFlash, setMarkerFlash] = useState<MarkerFlash>(null);
  const markerFlashTimerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (markerFlashTimerRef.current !== null) clearTimeout(markerFlashTimerRef.current);
  }, []);

  const backupMarkers = async (m: Marker[]) => {
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
  };

  useEffect(() => {
    try {
      localStorage.setItem('ltc-markers', JSON.stringify(markers));
      void backupMarkers(markers);
    } catch { /* ignore */ }
  }, [markers]);

  const addMarker = (color: MarkerColor) => {
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
      comment: ''
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
    setMarkers(markers.filter(m => m.id !== id));
  };

  const updateMarkerComment = (id: number, comment: string) => {
    setMarkers(prev => prev.map(m => m.id === id ? { ...m, comment } : m));
  };

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
        addToast('File export failed', 'error');
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

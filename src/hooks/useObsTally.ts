import { useCallback, useEffect, useMemo, useState } from 'react';

import { ObsWebSocketClient, EMPTY_OBS_SCENE_STATE } from '../utils/ObsWebSocket';
import type { ObsErrorCode, ObsSceneState, ObsStatus } from '../utils/ObsWebSocket';
import {
  OBS_DEFAULT_URL,
  autoMapObsScenes,
  normalizeObsUrl,
  obsMixedContentWarning,
  pruneObsMapping,
  resolveObsBuses,
  setObsSceneCamera,
} from '../utils/obsTally';
import type { ObsBusAssignment, ObsSceneMapping } from '../utils/obsTally';

const STORAGE_ENABLED = 'ltc-obs-enabled';
const STORAGE_URL = 'ltc-obs-url';
const STORAGE_PASSWORD = 'ltc-obs-password';
const STORAGE_MAPPING = 'ltc-obs-mapping';

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch { /* private mode — the setting still applies for this session */ }
}

function readStoredMapping(): ObsSceneMapping {
  const raw = readStored(STORAGE_MAPPING);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, string] => typeof entry[1] === 'string');
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export interface ObsControls {
  obsEnabled: boolean;
  setObsEnabled: (enabled: boolean) => void;
  obsUrl: string;
  setObsUrl: (url: string) => void;
  obsPassword: string;
  setObsPassword: (password: string) => void;
  obsStatus: ObsStatus;
  obsError: ObsErrorCode | null;
  obsScene: ObsSceneState;
  obsMapping: ObsSceneMapping;
  assignScene: (sceneName: string, clientId: string | null) => void;
  autoAssignScenes: () => void;
  clearSceneMapping: () => void;
  /** Program/preview cameras OBS is currently calling for, or nulls when idle. */
  obsAssignment: ObsBusAssignment;
  /** True while OBS — not the built-in switcher — owns the tally buses. */
  obsControlActive: boolean;
}

interface UseObsTallyParams {
  /** Only the session master broadcasts tally, so only it talks to OBS. */
  isHost: boolean;
  clientIds: string[];
}

/**
 * Follows OBS's program/preview scenes and turns them into camera ids the
 * tally system already understands.
 *
 * The hook deliberately stops at "which camera should be live" — it does not
 * touch the tally payload itself. App.tsx feeds the result into the same
 * program/preview state the manual switcher writes, so OBS control reuses the
 * existing broadcast, action log, and PGM return path rather than adding a
 * second way for a camera to go live.
 */
export function useObsTally({ isHost, clientIds }: UseObsTallyParams): ObsControls {
  const [obsEnabled, setEnabledState] = useState(() => readStored(STORAGE_ENABLED) === 'true');
  const [obsUrl, setUrlState] = useState(() => readStored(STORAGE_URL) || OBS_DEFAULT_URL);
  const [obsPassword, setPasswordState] = useState(() => readStored(STORAGE_PASSWORD) ?? '');
  const [storedMapping, setStoredMapping] = useState<ObsSceneMapping>(readStoredMapping);
  const [socketStatus, setSocketStatus] = useState<ObsStatus>('idle');
  const [socketError, setSocketError] = useState<ObsErrorCode | null>(null);
  const [socketScene, setSocketScene] = useState<ObsSceneState>(EMPTY_OBS_SCENE_STATE);

  const setObsEnabled = useCallback((enabled: boolean) => {
    setEnabledState(enabled);
    writeStored(STORAGE_ENABLED, String(enabled));
  }, []);

  const setObsUrl = useCallback((url: string) => {
    const normalized = normalizeObsUrl(url);
    setUrlState(normalized);
    writeStored(STORAGE_URL, normalized);
  }, []);

  const setObsPassword = useCallback((password: string) => {
    setPasswordState(password);
    writeStored(STORAGE_PASSWORD, password);
  }, []);

  const persistMapping = useCallback((next: ObsSceneMapping) => {
    setStoredMapping(next);
    writeStored(STORAGE_MAPPING, JSON.stringify(next));
  }, []);

  const assignScene = useCallback((sceneName: string, clientId: string | null) => {
    setStoredMapping(prev => {
      const next = setObsSceneCamera(prev, sceneName, clientId);
      writeStored(STORAGE_MAPPING, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearSceneMapping = useCallback(() => persistMapping({}), [persistMapping]);

  // Mixed content is checked before opening anything: the browser's own
  // failure for this is an indistinguishable "connection closed", so catching
  // it here is the only way the operator gets told what is actually wrong.
  const mixedContent = obsEnabled && isHost
    ? obsMixedContentWarning(obsUrl, window.location.protocol)
    : null;
  const linkActive = obsEnabled && isHost && !mixedContent;

  // Connection lifecycle. Re-runs on url/password changes so editing either
  // one reconnects instead of leaving a stale socket attached.
  useEffect(() => {
    if (!linkActive) return;

    let live = true;
    const client = new ObsWebSocketClient({
      url: obsUrl,
      password: obsPassword,
      onStatus: (status, error) => {
        if (!live) return;
        setSocketStatus(status);
        setSocketError(error ?? null);
      },
      onSceneState: state => { if (live) setSocketScene(state); },
    });
    client.connect();

    return () => {
      live = false;
      client.disconnect();
      setSocketStatus('idle');
      setSocketError(null);
      setSocketScene(EMPTY_OBS_SCENE_STATE);
    };
  }, [linkActive, obsUrl, obsPassword]);

  const obsStatus: ObsStatus = mixedContent ? 'error' : linkActive ? socketStatus : 'idle';
  const obsError: ObsErrorCode | null = mixedContent ?? (linkActive ? socketError : null);
  const obsScene = linkActive ? socketScene : EMPTY_OBS_SCENE_STATE;

  // A scene deleted or renamed in OBS leaves a dangling entry. It is hidden
  // rather than deleted from storage, so renaming a scene back — or relaunching
  // OBS with a different collection loaded — restores the mapping instead of
  // making the operator redo it.
  const obsMapping = useMemo(
    () => (obsScene.scenes.length > 0 ? pruneObsMapping(storedMapping, obsScene.scenes) : storedMapping),
    [storedMapping, obsScene.scenes],
  );

  const autoAssignScenes = useCallback(() => {
    persistMapping(autoMapObsScenes(obsScene.scenes, clientIds, storedMapping));
  }, [obsScene.scenes, clientIds, storedMapping, persistMapping]);

  const obsControlActive = linkActive && socketStatus === 'connected';

  const obsAssignment = useMemo(
    () => (obsControlActive
      ? resolveObsBuses(obsScene.programScene, obsScene.previewScene, obsMapping)
      : { programId: null, previewId: null }),
    [obsControlActive, obsScene.programScene, obsScene.previewScene, obsMapping],
  );

  return {
    obsEnabled, setObsEnabled,
    obsUrl, setObsUrl,
    obsPassword, setObsPassword,
    obsStatus, obsError, obsScene, obsMapping,
    assignScene, autoAssignScenes, clearSceneMapping,
    obsAssignment, obsControlActive,
  };
}

import { useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { TimecodeNativeBridge } from '../utils/TimecodeNativeBridge';
import { resolveTally } from '../utils/tally';
import type { TallyState, TallyPayload } from '../utils/tally';
import type { PeerSync, SyncMessage } from '../utils/PeerSync';

type TallyMode = 'auto' | 'manual';
type TallyTcSize = 'sm' | 'md' | 'lg';
type ActionLogEntry = { time: string; cam: string; state: string };

interface UseTallyControlParams {
  isHost: boolean;
  isRunning: boolean;
  p2pRole: 'master' | 'client' | null;
  peerId: string;
  peerSyncRef: React.RefObject<PeerSync | null>;
  lastHeartbeatTimeRef: React.RefObject<number>;
  nowTick: number;
  cameraLabels: Record<string, string>;
  currentTcRef: React.RefObject<string>;
}

interface UseTallyControlResult {
  tallyOpen: boolean;
  setTallyOpen: React.Dispatch<React.SetStateAction<boolean>>;
  tallyMode: TallyMode;
  setTallyMode: React.Dispatch<React.SetStateAction<TallyMode>>;
  tallyTorchEnabled: boolean;
  setTallyTorchEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  manualTally: TallyState;
  tallyPayload: TallyPayload | null;
  setTallyPayload: React.Dispatch<React.SetStateAction<TallyPayload | null>>;
  tallyTime: string;
  setTallyTime: React.Dispatch<React.SetStateAction<string>>;
  tallyDimmerOpacity: number;
  setTallyDimmerOpacity: React.Dispatch<React.SetStateAction<number>>;
  tallyTcSize: TallyTcSize;
  setTallyTcSize: React.Dispatch<React.SetStateAction<TallyTcSize>>;
  tallyActionLog: ActionLogEntry[];
  tallyRevRef: React.RefObject<number>;
  tallyTimeRef: React.RefObject<string>;
  tallyOpenRef: React.RefObject<boolean>;
  isTallyConnected: boolean;
  tallyState: TallyState;
  playHapticFeedback: () => void;
  handleManualTallyChange: (s: TallyState) => void;
  handleClientTallyChange: (clientId: string, s: TallyState) => void;
  handleAllTallyChange: (s: TallyState) => void;
  handleDimmerCycle: (e: React.MouseEvent) => void;
  handleTorchToggle: (e: React.MouseEvent) => void;
  handleTallyExit: (e: React.MouseEvent) => void;
}

const TALLY_HEARTBEAT_TIMEOUT_MS = 3000;
const ACTION_LOG_MAX_ENTRIES = 10;

function broadcastTally(peerSyncRef: React.RefObject<PeerSync | null>, isRunning: boolean, payload: TallyPayload) {
  const msg: SyncMessage = {
    type: 'tally',
    masterTimecode: '',
    masterTimestamp: 0,
    fps: 0,
    isDropFrame: false,
    isRunning,
    tally: payload
  };
  peerSyncRef.current?.broadcast(msg);
}

/**
 * Owns the tally-lamp control plane: manual/auto mode, per-camera and
 * all-camera state changes (broadcast to P2P clients), torch control,
 * dimmer, fullscreen tally open/exit, and the tally-state derivation.
 *
 * The incoming-message side (adopting a payload received over P2P) stays in
 * the main provider's message dispatcher, which also handles unrelated P2P
 * sync-timing messages — this hook only exposes setTallyPayload so that
 * dispatcher can keep updating it exactly as before.
 */
export function useTallyControl({
  isHost,
  isRunning,
  p2pRole,
  peerId,
  peerSyncRef,
  lastHeartbeatTimeRef,
  nowTick,
  cameraLabels,
  currentTcRef,
}: UseTallyControlParams): UseTallyControlResult {
  const [tallyOpen, setTallyOpen] = useState(false);
  const [tallyMode, setTallyMode] = useState<TallyMode>('auto');
  const [tallyTorchEnabled, setTallyTorchEnabled] = useState(false);
  const videoTrackRef = useRef<MediaStreamTrack | null>(null);
  const [manualTally, setManualTally] = useState<TallyState>('off');
  const [tallyPayload, setTallyPayload] = useState<TallyPayload | null>(null);
  const tallyRevRef = useRef<number>(0);
  const [tallyTime, setTallyTime] = useState<string>('00:00:00:00');
  const tallyTimeRef = useRef<string>(tallyTime);
  const tallyOpenRef = useRef<boolean>(tallyOpen);
  const tallyControlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [tallyDimmerOpacity, setTallyDimmerOpacity] = useState(0);
  const [tallyTcSize, setTallyTcSize] = useState<TallyTcSize>(() => {
    try {
      const saved = localStorage.getItem('ltc-tally-tc-size');
      return (saved === 'sm' || saved === 'md' || saved === 'lg') ? saved : 'md';
    } catch { return 'md'; }
  });
  const [tallyActionLog, setTallyActionLog] = useState<ActionLogEntry[]>([]);

  const playHapticFeedback = () => {
    try {
      if (navigator.vibrate) {
        navigator.vibrate(30);
      }
      const AudioCtx = window.AudioContext
        || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.frequency.value = 850;
      gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.05);
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.05);
    } catch {
      // Ignore haptic audio errors on auto-play policy
    }
  };

  useEffect(() => {
    try {
      localStorage.setItem('ltc-tally-tc-size', tallyTcSize);
    } catch { /* ignore */ }
  }, [tallyTcSize]);

  useEffect(() => {
    tallyOpenRef.current = tallyOpen;
    if (!tallyOpen) {
      if (tallyControlsTimerRef.current) {
        clearTimeout(tallyControlsTimerRef.current);
        tallyControlsTimerRef.current = null;
      }
    }
  }, [tallyOpen]);

  // Reads a ref during render: lastHeartbeatTimeRef itself doesn't trigger a
  // re-render when it changes, so this value's freshness currently relies on
  // the frequent (~10Hz) heartbeat/report state updates elsewhere causing the
  // provider to re-render anyway. A proper state-based fix (e.g. ticking
  // nowTick on clients too, not just isHost) is still open after this move.
  // eslint-disable-next-line react-hooks/refs
  const isTallyConnected = p2pRole === 'client' && (nowTick - lastHeartbeatTimeRef.current < TALLY_HEARTBEAT_TIMEOUT_MS);
  const tallyState = resolveTally(tallyPayload, peerId, {
    connected: isTallyConnected,
    autoMode: tallyMode === 'auto',
    selfIsRunning: isRunning,
    manualState: manualTally,
  });

  useEffect(() => {
    if (isHost && tallyMode === 'auto') {
      const stateToBroadcast = isRunning ? 'live' : 'standby';
      if (tallyPayload?.all !== stateToBroadcast) {
        tallyRevRef.current += 1;
        const newPayload: TallyPayload = {
          rev: tallyRevRef.current,
          all: stateToBroadcast,
          assignments: {}
        };
        setTallyPayload(newPayload);
        broadcastTally(peerSyncRef, isRunning, newPayload);
      }
    }
  }, [isHost, tallyMode, isRunning, tallyPayload?.all, peerSyncRef]);

  useEffect(() => {
    const turnOn = tallyTorchEnabled && tallyState === 'live';
    const applyTorch = async (on: boolean) => {
      await TimecodeNativeBridge.setTorch(on);
      const isNative = Capacitor.isNativePlatform();
      if (!isNative) {
        try {
          if (on) {
            if (!videoTrackRef.current) {
              const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'environment' }
              });
              videoTrackRef.current = stream.getVideoTracks()[0];
            }
            if (videoTrackRef.current) {
              await videoTrackRef.current.applyConstraints({ advanced: [{ torch: true }] } as unknown as MediaTrackConstraints);
            }
          } else {
            if (videoTrackRef.current) {
              await videoTrackRef.current.applyConstraints({ advanced: [{ torch: false }] } as unknown as MediaTrackConstraints);
              videoTrackRef.current.stop();
              videoTrackRef.current = null;
            }
          }
        } catch (e) {
          console.warn('Web fallback torch failed:', e);
        }
      }
    };
    applyTorch(turnOn);
    return () => {
      if (turnOn) applyTorch(false);
    };
  }, [tallyState, tallyTorchEnabled]);

  const handleDimmerCycle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTallyDimmerOpacity(prev => {
      if (prev === 0) return 0.5;
      if (prev === 0.5) return 0.85;
      return 0;
    });
  };

  const handleTorchToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTallyTorchEnabled(prev => !prev);
  };

  const handleTallyExit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTallyOpen(false);
  };

  const handleManualTallyChange = (s: TallyState) => {
    setManualTally(s);
    if (isHost) {
      tallyRevRef.current += 1;
      const newPayload: TallyPayload = {
        rev: tallyRevRef.current,
        all: s,
        assignments: {}
      };
      setTallyPayload(newPayload);
      broadcastTally(peerSyncRef, false, newPayload);
    }
  };

  const handleClientTallyChange = (clientId: string, s: TallyState) => {
    if (isHost) {
      tallyRevRef.current += 1;
      const newPayload: TallyPayload = {
        rev: tallyRevRef.current,
        all: tallyPayload?.all ?? manualTally,
        assignments: {
          ...tallyPayload?.assignments,
          [clientId]: s
        }
      };
      setTallyPayload(newPayload);
      broadcastTally(peerSyncRef, false, newPayload);
      const camLabel = cameraLabels[clientId] || clientId.slice(0, 6);
      const stateKey = s === 'standby' ? 'preview' : s;
      const tc = currentTcRef.current;
      setTallyActionLog(prev => [{ time: tc, cam: camLabel, state: stateKey }, ...prev].slice(0, ACTION_LOG_MAX_ENTRIES));
    }
  };

  const handleAllTallyChange = (s: TallyState) => {
    if (!isHost) return;
    tallyRevRef.current += 1;
    const newPayload: TallyPayload = {
      rev: tallyRevRef.current,
      all: s,
      assignments: {}
    };
    setTallyPayload(newPayload);
    setManualTally(s);
    broadcastTally(peerSyncRef, false, newPayload);
  };

  return {
    tallyOpen, setTallyOpen, tallyMode, setTallyMode, tallyTorchEnabled, setTallyTorchEnabled,
    manualTally, tallyPayload, setTallyPayload, tallyTime, setTallyTime,
    tallyDimmerOpacity, setTallyDimmerOpacity, tallyTcSize, setTallyTcSize, tallyActionLog,
    tallyRevRef, tallyTimeRef, tallyOpenRef,
    isTallyConnected, tallyState,
    playHapticFeedback, handleManualTallyChange, handleClientTallyChange, handleAllTallyChange,
    handleDimmerCycle, handleTorchToggle, handleTallyExit,
  };
}

import { useState, useRef, useCallback } from 'react';
import { AudioManager } from '../core/AudioManager';
import { SmartClock } from '../core/SmartClock';
import type { LtcSettings } from '../utils/LtcEngine';
import { LtcEngine } from '../utils/LtcEngine';

export function useTimecode() {
  const [isRunning, setIsRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [manualTimecode, setManualTimecode] = useState('00:00:00:00');
  const [masterDrift, setMasterDrift] = useState<number | null>(null);
  
  const audioManagerRef = useRef<AudioManager | null>(null);
  const engineRef = useRef<LtcEngine | null>(null);
  const smartClockRef = useRef<SmartClock>(new SmartClock());

  // Initialize Audio Manager on first start
  const startEngine = useCallback(async (
    settings: LtcSettings, 
    onWorkletMessage: (tc: string) => void
  ) => {
    if (!audioManagerRef.current) {
      audioManagerRef.current = new AudioManager();
    }
    const engine = await audioManagerRef.current.initialize(settings, (tc) => {
      onWorkletMessage(tc);
    });
    engineRef.current = engine;
    setIsRunning(true);
    setIsPaused(false);
  }, []);

  const stopEngine = useCallback(() => {
    if (audioManagerRef.current) {
      audioManagerRef.current.stop();
      audioManagerRef.current = null;
    }
    engineRef.current = null;
    setIsRunning(false);
    setIsPaused(false);
  }, []);

  const togglePause = useCallback(() => {
    if (!isRunning) return;
    if (isPaused) {
      audioManagerRef.current?.resume();
      setIsPaused(false);
    } else {
      audioManagerRef.current?.pause();
      setIsPaused(true);
    }
  }, [isRunning, isPaused]);

  const applyPrecisionSync = useCallback((rtt: number, masterTc: string, isMasterRunning: boolean) => {
    if (!engineRef.current) return { shouldSync: false, effectiveLatency: 0, isStable: false, bestRtt: rtt };

    const currentDiff = engineRef.current.getDiffSeconds(masterTc);
    setMasterDrift(currentDiff);

    const decision = smartClockRef.current.addPrecisionSample(rtt, currentDiff);
    
    if (decision.shouldSync) {
      audioManagerRef.current?.syncWorklet(masterTc, decision.effectiveLatency, isMasterRunning);
    }

    return decision;
  }, []);

  const applyCoarseSync = useCallback((masterTc: string, isMasterRunning: boolean) => {
    if (!engineRef.current) return { shouldSync: false };

    const currentDiff = engineRef.current.getDiffSeconds(masterTc);
    setMasterDrift(currentDiff);

    const decision = smartClockRef.current.addCoarseSample(currentDiff);
    
    if (decision.shouldSync) {
      audioManagerRef.current?.syncWorklet(masterTc, decision.assumedLatency, isMasterRunning);
    }

    return decision;
  }, []);

  const updateSettings = useCallback((settings: Partial<LtcSettings>) => {
    if (!engineRef.current) return;
    if (settings.fps !== undefined) engineRef.current.setFps(settings.fps, settings.isDropFrame || false);
    if (settings.volume !== undefined) engineRef.current.setVolume(settings.volume);
    if (settings.userBits !== undefined) engineRef.current.setUserBits(settings.userBits);
  }, []);

  const setManualTime = useCallback((tc: string) => {
    setManualTimecode(tc);
    if (engineRef.current) {
      engineRef.current.setManualTimecode(tc);
    }
  }, []);

  return {
    isRunning,
    isPaused,
    manualTimecode,
    masterDrift,
    engineRef,
    smartClockRef,
    startEngine,
    stopEngine,
    togglePause,
    applyPrecisionSync,
    applyCoarseSync,
    updateSettings,
    setManualTime
  };
}

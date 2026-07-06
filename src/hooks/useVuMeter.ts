import { useEffect, useRef, useState } from 'react';

const CLIP_THRESHOLD = 0.95;
const CLIP_HOLD_MS = 3000;

interface UseVuMeterResult {
  vuLevel: number;
  isClipping: boolean;
}

/**
 * Drives a peak-level VU meter from a Web Audio AnalyserNode via a
 * requestAnimationFrame loop, only while running in mono-L output mode.
 *
 * Kept in its own hook (rather than the shared LTCSyncContext) so its
 * ~60Hz state updates only re-render whichever component calls this hook,
 * not every consumer of the app-wide context.
 */
export function useVuMeter(
  analyserRef: React.RefObject<AnalyserNode | null>,
  isRunning: boolean,
  outputMode: string,
): UseVuMeterResult {
  const [vuLevel, setVuLevel] = useState(0);
  const [isClipping, setIsClipping] = useState(false);
  const clipTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isRunning || outputMode !== 'mono-l') {
      return;
    }
    let rafId: number;
    const update = () => {
      if (analyserRef.current) {
        const data = new Float32Array(analyserRef.current.fftSize);
        analyserRef.current.getFloatTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i++) {
          const abs = Math.abs(data[i]);
          if (abs > peak) peak = abs;
        }
        setVuLevel(peak);
        if (peak >= CLIP_THRESHOLD) {
          setIsClipping(true);
          if (clipTimeoutRef.current) clearTimeout(clipTimeoutRef.current);
          clipTimeoutRef.current = setTimeout(() => {
            setIsClipping(false);
          }, CLIP_HOLD_MS);
        }
      }
      rafId = requestAnimationFrame(update);
    };
    rafId = requestAnimationFrame(update);
    return () => {
      cancelAnimationFrame(rafId);
      setVuLevel(0);
      setIsClipping(false);
      if (clipTimeoutRef.current) {
        clearTimeout(clipTimeoutRef.current);
        clipTimeoutRef.current = null;
      }
    };
  }, [analyserRef, isRunning, outputMode]);

  return { vuLevel, isClipping };
}

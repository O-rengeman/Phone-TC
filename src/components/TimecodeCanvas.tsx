import React, { useEffect, useRef } from 'react';
import { LtcEngine } from '../utils/LtcEngine';

interface TimecodeCanvasProps {
  engineRef: React.MutableRefObject<LtcEngine | null>;
  isRunning: boolean;
  isMobile: boolean;
  isVisualSlate?: boolean;
  onTimeUpdate?: (tc: string) => void;
}

export const TimecodeCanvas: React.FC<TimecodeCanvasProps> = ({ 
  engineRef, 
  isRunning, 
  isMobile,
  isVisualSlate = false,
  onTimeUpdate 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let rafId: number;
    
    const render = () => {
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (!canvas || !engine) {
        rafId = requestAnimationFrame(render);
        return;
      }

      const tc = engine.getTimecodeString();
      if (onTimeUpdate) {
        onTimeUpdate(tc);
      }

      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      // Ensure canvas size matches its display size * DPR
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }

      const w = rect.width;
      const h = rect.height;

      // Clear
      ctx.clearRect(0, 0, w, h);

      // Draw Timecode
      const vw = window.innerWidth;
      const baseSize = isMobile ? Math.min(vw * 0.12, 100) : vw * 0.065;
      
      ctx.font = `900 ${isVisualSlate ? baseSize * 1.5 : baseSize}px 'JetBrains Mono', monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // Neon Glow (GPU accelerated shadow)
      ctx.shadowColor = 'rgba(255, 255, 255, 0.3)';
      ctx.shadowBlur = isMobile ? 20 : 60;
      ctx.fillStyle = '#fafafa';
      
      ctx.fillText(tc, w / 2, h / 2);
      
      // Secondary sharper glow
      ctx.shadowBlur = 5;
      ctx.fillText(tc, w / 2, h / 2);

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [engineRef, isRunning, isMobile, isVisualSlate, onTimeUpdate]);

  return (
    <>
      <canvas 
        ref={canvasRef} 
        className="time-canvas" 
        style={{ width: '100%', height: '100%', display: 'block', willChange: 'transform' }}
      />
      <div 
        ref={displayRef} 
        className="time-display fallback-display" 
        style={{ display: 'none' }} // Keep for screen readers or fallback
      >
        00:00:00:00
      </div>
    </>
  );
};

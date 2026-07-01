import { useEffect } from "react";
import { useLTC, FPS_OPTIONS } from "./LTCSyncContext";
import { TimecodeNativeBridge } from "./utils/TimecodeNativeBridge";

export function VideoPlayer() {
  const {
    isRunning,
    fpsIndex,
    isMobile,
    outputLevel,
    userBits,
    p2pRole,
    masterDrift,
    setIsVisualSlate,
    canvasRef,
    engineRef,
    currentTcRef,
    isVisualSlateRef,
    slateTimeRef,
    tallyTimeRef,
    tallyOpenRef,
    directorTimeRef,
    directorPanelOpenRef,
    setSlateTime,
    setTallyTime,
    setDirectorTime
  } = useLTC();

  useEffect(() => {
    let rafId: number;
    
    const render = () => {
      const canvas = canvasRef.current;
      const engine = engineRef.current;
      if (!canvas || !engine) {
        rafId = requestAnimationFrame(render);
        return;
      }

      // 動作中は Worklet がタイムコード（LTC）の発信源となり、停止中はエンジンを使用する
      const tc = isRunning ? currentTcRef.current : engine.getTimecodeString();
      TimecodeNativeBridge.updatePlaybackStatus(isRunning, tc);
      
      // 必要に応じて Slate Time を更新する
      if (isVisualSlateRef.current && slateTimeRef.current !== tc) {
        setSlateTime(tc);
      }

      if (tallyOpenRef.current && tallyTimeRef.current !== tc) {
        tallyTimeRef.current = tc;
        setTallyTime(tc);
      }

      if (directorPanelOpenRef.current && directorTimeRef.current !== tc) {
        directorTimeRef.current = tc;
        setDirectorTime(tc);
      }

      // 描画ロジック
      const ctx = canvas.getContext('2d', { alpha: true });
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      
      // Canvas の実際のピクセルサイズを調整
      if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
      }

      const w = rect.width;
      const h = rect.height;

      // クリア
      ctx.clearRect(0, 0, w, h);

      // タイムコードの描画 - 画面幅の90%に自動フィット
      const targetWidth = w * 0.9;
      const maxSize = isMobile ? 140 : 360;
      let fontSize = Math.min(maxSize, h * 0.72);
      ctx.font = `900 ${fontSize}px 'JetBrains Mono', monospace`;
      const measured = ctx.measureText(tc).width;
      if (measured > targetWidth && measured > 0) {
        fontSize = Math.floor(fontSize * (targetWidth / measured));
        ctx.font = `900 ${fontSize}px 'JetBrains Mono', monospace`;
      }
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // タイムコード発信中は赤いグロー効果、停止中は白いぼかし
      ctx.shadowColor = isRunning ? 'rgba(255, 90, 120, 0.45)' : 'rgba(255, 255, 255, 0.3)';
      ctx.shadowBlur = isMobile ? 18 : 50;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(tc, w / 2, h / 2);

      // エッジのくっきりさを出すためのセカンドパス
      ctx.shadowBlur = 4;
      ctx.fillText(tc, w / 2, h / 2);

      // LTC 発信中の REC インジケータ点滅
      if (isRunning) {
        ctx.shadowBlur = 0;
        const r = Math.max(5, w * 0.013);
        const pad = Math.max(12, w * 0.045);
        const pulse = 0.5 + 0.5 * Math.abs(Math.sin(Date.now() / 450));
        ctx.beginPath();
        ctx.arc(pad, pad, r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 59, 113, ${pulse})`;
        ctx.fill();
        ctx.font = `800 ${Math.round(r * 2.1)}px 'JetBrains Mono', monospace`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ff3b71';
        ctx.fillText('REC', pad + r * 1.9, pad + 1);
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, [isRunning, isMobile, setSlateTime, setTallyTime, setDirectorTime, canvasRef, engineRef, currentTcRef, isVisualSlateRef, tallyOpenRef, directorTimeRef, directorPanelOpenRef]);

  return (
    <div className="timecode-card-pro" onClick={() => setIsVisualSlate(true)}>
      <canvas ref={canvasRef} className="time-canvas" />
      <div className="info-strip-pro">
        <span className="info-label">FPS: {FPS_OPTIONS[fpsIndex].label}</span>
        <span className="info-label">LVL: {outputLevel.toUpperCase()}</span>
        <span className="info-label">UBIT: {userBits}</span>
        {p2pRole === 'client' && masterDrift !== null && (
          <span className={`info-label ${masterDrift >= 0.5 ? 'warn' : 'ok'}`}>
            {masterDrift >= 0.5 ? '✖ ' : '✔ '}δ: {masterDrift < 0.01 ? '<0.01' : masterDrift.toFixed(2)}s
          </span>
        )}
      </div>
    </div>
  );
}

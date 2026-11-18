import { QRCodeCanvas } from 'qrcode.react';
import { FPS_OPTIONS } from '../constants';
import type { Marker } from '../utils/export';
import { useSlateTime } from '../slateTimeContext';
import { shouldUseMobileLayout } from '../utils/layout';
import './timecodeSurface.css';

interface VisualSlateProps {
  isSlateFlashing: boolean;
  handleSlateClick: () => void;
  defaultReelName: string;
  sceneName: string;
  markers: Marker[];
  fpsIndex: number;
  userBits: string;
  tr: (key: string, vars?: Record<string, string | number>) => string;
  setIsVisualSlate: (v: boolean) => void;
}

export function VisualSlate({
  isSlateFlashing,
  handleSlateClick,
  defaultReelName,
  sceneName,
  markers,
  fpsIndex,
  userBits,
  tr,
  setIsVisualSlate,
}: VisualSlateProps) {
  // Consumed from its own context so ~30fps TC updates re-render only this
  // overlay — not every useLTC() consumer in the tree.
  const slateTime = useSlateTime();
  // Same detection LTCSyncContext uses — read at render time so the v2
  // chrome stays mobile-only without subscribing this overlay to useLTC().
  const isMobile = shouldUseMobileLayout({
    width: window.innerWidth,
    height: window.innerHeight,
    hasTouchInput: navigator.maxTouchPoints > 0
      || (typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches),
  });
  return (
    <div className={`visual-slate-overlay ${isMobile ? 'slate-v2 ' : ''}${isSlateFlashing ? 'flashing' : ''}`}>
      <div className="slate-tap-area" onClick={handleSlateClick} />
      <div className="slate-content">
        <div className="slate-tc">{slateTime}</div>
        <div className="slate-metadata-row">
          <div>{tr('slate.reel')}: {defaultReelName}</div>
          <div>{tr('slate.scene')}: {sceneName}</div>
          <div>{tr('slate.take')}: {markers.length > 0 ? Math.max(...markers.map(m => m.take || 0)) + 1 : 1}</div>
        </div>
        <div className="slate-info">
          {tr('slate.info', { fps: FPS_OPTIONS[fpsIndex].label, ubit: userBits })}
        </div>
        <div className="slate-qr">
          <QRCodeCanvas value={slateTime} size={256} level="L" includeMargin={true} />
        </div>
        <div className="slate-close">{tr('slate.close')}</div>
      </div>
      <button
        className="slate-close-btn"
        onClick={(e) => { e.stopPropagation(); setIsVisualSlate(false); }}
        aria-label={tr('slate.ariaClose')}
      >
        ×
      </button>
    </div>
  );
}

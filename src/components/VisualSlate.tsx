import { QRCodeCanvas } from 'qrcode.react';
import { FPS_OPTIONS } from '../constants';
import type { Marker } from '../utils/export';

interface VisualSlateProps {
  slateTime: string;
  isSlateFlashing: boolean;
  handleSlateClick: () => void;
  defaultReelName: string;
  sceneName: string;
  markers: Marker[];
  fpsIndex: number;
  userBits: string;
  tr: (key: string) => string;
  setIsVisualSlate: (v: boolean) => void;
}

export function VisualSlate({
  slateTime,
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
  return (
    <div className={`visual-slate-overlay ${isSlateFlashing ? 'flashing' : ''}`}>
      <div className="slate-tap-area" onClick={handleSlateClick} />
      <div className="slate-content">
        <div className="slate-tc">{slateTime}</div>
        <div className="slate-metadata-row">
          <div>REEL: {defaultReelName}</div>
          <div>SCENE: {sceneName}</div>
          <div>TAKE: {markers.length > 0 ? Math.max(...markers.map(m => m.take || 0)) + 1 : 1}</div>
        </div>
        <div className="slate-info">
          {FPS_OPTIONS[fpsIndex].label} FPS | UBIT: {userBits}
        </div>
        <div className="slate-qr">
          <QRCodeCanvas value={slateTime} size={256} level="L" includeMargin={true} />
        </div>
        <div className="slate-close">{tr('slate.close')}</div>
      </div>
      <button
        className="slate-close-btn"
        onClick={(e) => { e.stopPropagation(); setIsVisualSlate(false); }}
        aria-label="Close Slate"
      >
        ×
      </button>
    </div>
  );
}

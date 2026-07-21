import { tallyLabelKey } from '../utils/tally';
import type { TallyState } from '../utils/tally';
import { VideoRenderer } from './VideoRenderer';

interface TallyOverlayProps {
  tallyState: TallyState;
  tallyTime: string;
  tallyDimmerOpacity: number;
  tallyTcSize: 'sm' | 'md' | 'lg';
  tallyStyle: 'full' | 'border';
  tallyBorderSize: 'thin' | 'medium' | 'thick';
  isTallyConnected: boolean;
  p2pRole: 'master' | 'client' | null;
  returnStream: MediaStream | null;
  peerId: string | null;
  cameraLabels: Record<string, string>;
  batteryLevel: number | null;
  isCharging: boolean;
  tr: (key: string) => string;
  playHapticFeedback: () => void;
  handleDimmerCycle: (e: React.MouseEvent<HTMLButtonElement>) => void;
  handleTorchToggle: (e: React.MouseEvent<HTMLButtonElement>) => void;
  handleTallyExit: (e: React.MouseEvent<HTMLButtonElement>) => void;
  setTallyStyle: (style: 'full' | 'border' | ((prev: 'full' | 'border') => 'full' | 'border')) => void;
  setTallyBorderSize: (size: 'thin' | 'medium' | 'thick' | ((prev: 'thin' | 'medium' | 'thick') => 'thin' | 'medium' | 'thick')) => void;
  setTallyTcSize: (size: 'sm' | 'md' | 'lg' | ((prev: 'sm' | 'md' | 'lg') => 'sm' | 'md' | 'lg')) => void;
  tallyTorchEnabled: boolean;
}

export function TallyOverlay({
  tallyState,
  tallyTime,
  tallyDimmerOpacity,
  tallyTcSize,
  tallyStyle,
  tallyBorderSize,
  isTallyConnected,
  p2pRole,
  returnStream,
  peerId,
  cameraLabels,
  batteryLevel,
  isCharging,
  tr,
  playHapticFeedback,
  handleDimmerCycle,
  handleTorchToggle,
  handleTallyExit,
  setTallyStyle,
  setTallyBorderSize,
  setTallyTcSize,
  tallyTorchEnabled,
}: TallyOverlayProps) {
  const isConnected = isTallyConnected;
  const uiState = tallyState === 'standby' ? 'preview' : tallyState;
  const stateLabel = tr(tallyLabelKey(uiState));
  const stateSubLabel = tr(`tally.sub.${uiState}`);

  return (
    <div
      className={`tally-overlay tally-${uiState} style-${tallyStyle} border-${tallyBorderSize} monochrome-tally`}
    >
      <div className="tally-dimmer" style={{ opacity: tallyDimmerOpacity }} />
      {p2pRole === 'client' && (
        <div className={`tally-conn-banner ${isConnected ? 'connected' : 'disconnected'}`}>
          {isConnected ? tr('tally.conn.ok') : tr('tally.conn.lost')}
        </div>
      )}
      {p2pRole === 'client' && (
        <>
          {returnStream && tallyStyle === 'full' && (
            <div className="tally-pgm-video-container">
              <VideoRenderer
                stream={returnStream}
                className="tally-pgm-video"
                style={{ objectFit: 'contain' }}
              />
            </div>
          )}
          <div className={`tally-return-status ${returnStream ? 'live' : 'waiting'}`}>
            <span />
            RETURN {returnStream ? 'LIVE' : 'NO SIGNAL'}
          </div>
        </>
      )}
      <div className="tally-header-slim">
        <span className="tally-header-id">
          {peerId ? (cameraLabels[peerId] || peerId.slice(0, 8)) : 'LOCAL'}
        </span>
        <span className="tally-header-battery">
          {batteryLevel !== null ? `${isCharging ? 'CHG' : 'BAT'} ${Math.round(batteryLevel * 100)}%` : ''}
        </span>
      </div>
      <div className="tally-body">
        <div className={`tally-timecode size-${tallyTcSize}`}>{tallyTime}</div>
        <div className="tally-state-label">{stateLabel}</div>
        <div className="tally-state-sublabel">{stateSubLabel}</div>
      </div>
      <div className="tally-control-bar">
        <button className="tally-ctrl-bar-btn" onClick={(e) => { playHapticFeedback(); handleDimmerCycle(e); }}>
          <span className="tally-ctrl-icon">DIM</span>
          <span>{tallyDimmerOpacity === 0 ? tr('tally.dim.bright') : tallyDimmerOpacity === 0.5 ? tr('tally.dim.mid') : tr('tally.dim.dark')}</span>
        </button>
        <button className={`tally-ctrl-bar-btn ${tallyTorchEnabled ? 'active' : ''}`} onClick={(e) => { playHapticFeedback(); handleTorchToggle(e); }}>
          <span className="tally-ctrl-icon">LED</span>
          <span>TORCH {tallyTorchEnabled ? 'ON' : 'OFF'}</span>
        </button>
        <button className="tally-ctrl-bar-btn" onClick={(e) => {
          e.stopPropagation();
          playHapticFeedback();
          setTallyStyle((prev: 'full' | 'border') => prev === 'full' ? 'border' : 'full');
        }}>
          <span className="tally-ctrl-icon">VIEW</span>
          <span>STYLE: {tallyStyle.toUpperCase()}</span>
        </button>
        <button className="tally-ctrl-bar-btn" onClick={(e) => {
          e.stopPropagation();
          playHapticFeedback();
          setTallyBorderSize((prev: 'thin' | 'medium' | 'thick') => prev === 'thin' ? 'medium' : prev === 'medium' ? 'thick' : 'thin');
        }}>
          <span className="tally-ctrl-icon">EDGE</span>
          <span>BORDER: {tallyBorderSize.toUpperCase()}</span>
        </button>
        <button className="tally-ctrl-bar-btn" onClick={(e) => {
          e.stopPropagation();
          playHapticFeedback();
          setTallyTcSize((prev: 'sm' | 'md' | 'lg') => prev === 'sm' ? 'md' : prev === 'md' ? 'lg' : 'sm');
        }}>
          <span className="tally-ctrl-icon">TC</span>
          <span>TC: {tallyTcSize.toUpperCase()}</span>
        </button>
        <button className="tally-ctrl-bar-btn exit" onClick={(e) => { playHapticFeedback(); handleTallyExit(e); }}>
          <span className="tally-ctrl-icon">EXIT</span>
          <span>CLOSE</span>
        </button>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLTC } from '../LTCSyncContext';
import { useMediaStreams } from '../hooks/useMediaStreams';
import { VideoRenderer } from './VideoRenderer';
import { FPS_OPTIONS } from '../constants';
import { tallyLabelKey } from '../utils/tally';
import type { TallyState } from '../utils/tally';
import Timecode from 'smpte-timecode';
import '../App.css';

interface DirectorPanelProps {
  effectivePgmSourceId: string | null;
  effectivePreviewSourceId: string | null;
  isTransitioning: boolean;
  transitionProgress: number;
  isAutoTransitioning: boolean;
  handleSelectPreview: (id: string) => void;
  handleSelectProgram: (id: string) => void;
  handleCut: () => void;
  handleAuto: () => void;
  handleTBarChange: (value: number) => void;
}

export function DirectorPanel({
  effectivePgmSourceId,
  effectivePreviewSourceId,
  isTransitioning,
  transitionProgress,
  isAutoTransitioning,
  handleSelectPreview,
  handleSelectProgram,
  handleCut,
  handleAuto,
  handleTBarChange,
}: DirectorPanelProps) {
  const {
    directorTime,
    clients,
    cameraLabels,
    setCameraLabels,
    tallyPayload,
    isVideoEnabled,
    toggleVideoMonitoring,
    playHapticFeedback,
    setDirectorPanelOpen,
    tallyActionLog,
    tr,
    fpsIndex,
  } = useLTC();

  const mediaStreams = useMediaStreams();

  // Use a state-based timestamp to avoid calling Date.now() during render
  const [now, setNow] = useState<number>(0);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const clientEntries = useMemo(() => Object.entries(clients), [clients]);
  const camCount = clientEntries.length;

  const liveCount = useMemo(
    () =>
      Object.entries(clients).filter(([id]) => {
        const assignedState = tallyPayload?.assignments?.[id] ?? tallyPayload?.all ?? 'off';
        return (assignedState === 'standby' ? 'preview' : assignedState) === 'live';
      }).length,
    [clients, tallyPayload]
  );

  const previewCount = useMemo(
    () =>
      Object.entries(clients).filter(([id]) => {
        const assignedState = tallyPayload?.assignments?.[id] ?? tallyPayload?.all ?? 'off';
        return (assignedState === 'standby' ? 'preview' : assignedState) === 'preview';
      }).length,
    [clients, tallyPayload]
  );

  const offlineCount = useMemo(
    () => Object.values(clients).filter((stats) => now - stats.lastSeen > 30000).length,
    [clients, now]
  );

  const signalCount = useMemo(
    () => clientEntries.filter(([id]) => mediaStreams.has(id)).length,
    [clientEntries, mediaStreams]
  );

  const getSourceLabel = useCallback(
    (id: string | null) => {
      if (!id) return 'NONE';
      const sourceIndex = clientEntries.findIndex(([clientId]) => clientId === id);
      return cameraLabels[id] || (sourceIndex >= 0 ? `CAM${sourceIndex + 1}` : id.slice(0, 6));
    },
    [clientEntries, cameraLabels]
  );

  const programLabel = getSourceLabel(effectivePgmSourceId);
  const previewLabel = getSourceLabel(effectivePreviewSourceId);
  const programStream = effectivePgmSourceId ? (mediaStreams.get(effectivePgmSourceId) ?? null) : null;
  const previewStream = effectivePreviewSourceId ? (mediaStreams.get(effectivePreviewSourceId) ?? null) : null;

  // Keyboard shortcuts
  useEffect(() => {
    const handleCreatorShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT'
      ) {
        return;
      }

      const sourceIndex = Number(event.key) - 1;
      if (sourceIndex >= 0 && sourceIndex <= 8) {
        const sourceId = Object.keys(clients)[sourceIndex];
        if (!sourceId) return;
        event.preventDefault();
        handleSelectPreview(sourceId);
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        handleCut();
      } else if (event.key === 'Enter') {
        event.preventDefault();
        handleAuto();
      }
    };

    window.addEventListener('keydown', handleCreatorShortcut);
    return () => window.removeEventListener('keydown', handleCreatorShortcut);
  }, [clients, handleAuto, handleCut, handleSelectPreview]);

  return (
    <div className="director-tally-overlay atem-chassis creator-switcher apple-director-switcher">
      <div className="director-tally-header apple-director-header">
        <div className="director-title-group">
          <div className="director-title">
            <span className="creator-live-mark" />
            DIRECTOR SWITCHER
            <span className="creator-mode-badge">Creator View</span>
          </div>
          <div className="director-subtitle">カメラを選ぶ <b>→</b> TAKEで切り替え</div>
        </div>
        <div className="director-header-right">
          <div className={`creator-signal-summary ${signalCount > 0 ? 'ready' : ''}`}>
            <span className="creator-signal-dot" />
            <div>
              <small>CAMERAS</small>
              <strong>{signalCount} / {camCount} READY</strong>
            </div>
          </div>
          <button
            className={`dir-video-toggle ${isVideoEnabled ? 'active' : ''}`}
            onClick={() => { playHapticFeedback(); toggleVideoMonitoring(); }}
          >
            {isVideoEnabled ? '映像 ON' : '映像 OFF'}
          </button>
          <div className="director-tc-large">{directorTime}</div>
          <button
            className="director-close-btn"
            onClick={() => { playHapticFeedback(); setDirectorPanelOpen(false); }}
            aria-label="Close switcher"
          >
            ×
          </button>
        </div>
      </div>

      <div className="atem-workspace-layout">
        {/* 左側：マルチビュー（PGM/PVWモニター ＋ 入力カメラプレビューグリッド） */}
        <div className="atem-multiview-board">
          <div className="atem-mv-monitors">
            {/* PROGRAMモニター */}
            <div className={`atem-monitor program-monitor ${effectivePgmSourceId ? 'has-source' : ''}`}>
              <div className="atem-monitor-head">
                <span><i className="creator-monitor-dot" />ON AIR <small>現在の映像</small></span>
                <strong className="source-label">{programLabel}</strong>
              </div>
              <div className="atem-monitor-screen">
                {isVideoEnabled && programStream ? (
                  <div className="video-wrapper">
                    <VideoRenderer stream={programStream} muted={true} className="atem-monitor-video" />
                    {isTransitioning && previewStream && (
                      <div className="video-transition-overlay" style={{ opacity: transitionProgress / 100 }}>
                        <VideoRenderer stream={previewStream} muted={true} className="atem-monitor-video" />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="atem-monitor-placeholder">
                    <span>{isVideoEnabled ? 'ON AIR未選択' : '映像モニターOFF'}</span>
                    <small>{effectivePgmSourceId ? 'カメラ映像を待っています' : '下のカメラからNEXTを選択してください'}</small>
                  </div>
                )}
              </div>
            </div>

            {/* PREVIEWモニター */}
            <div className={`atem-monitor preview-monitor ${effectivePreviewSourceId ? 'has-source' : ''}`}>
              <div className="atem-monitor-head">
                <span><i className="creator-monitor-dot" />NEXT <small>次に出す映像</small></span>
                <strong className="source-label">{previewLabel}</strong>
              </div>
              <div className="atem-monitor-screen">
                {isVideoEnabled && previewStream ? (
                  <VideoRenderer stream={previewStream} muted={true} className="atem-monitor-video" />
                ) : (
                  <div className="atem-monitor-placeholder">
                    <span>{isVideoEnabled ? 'NEXT未選択' : '映像モニターOFF'}</span>
                    <small>{effectivePreviewSourceId ? 'カメラ映像を待っています' : '下のカメラをクリックして選択'}</small>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 入力カメラプレビューグリッド */}
          <div className="creator-camera-section">
            <div className="creator-section-heading">
              <div>
                <small>CAMERA SOURCES</small>
                <strong>カメラを選ぶ</strong>
              </div>
              <span>クリックするとNEXTにセットされます</span>
            </div>
            <div className="atem-mv-inputs-grid">
              {camCount === 0 ? (
                <div className="director-no-clients">
                  <div className="director-no-clients-icon">＋</div>
                  <div>カメラを接続してください</div>
                  <div className="director-no-clients-sub">クライアントが接続されると、ここに映像が並びます</div>
                </div>
              ) : (
                clientEntries.map(([id, stats], idx) => {
                  const isOffline = now - stats.lastSeen > 30000;
                  const defaultLabel = `CAM${idx + 1}`;
                  const label = cameraLabels[id] || defaultLabel;

                  const isPgmActive = effectivePgmSourceId === id;
                  const isPvwActive = effectivePreviewSourceId === id;
                  const cardTallyState = isPgmActive ? 'live' : isPvwActive ? 'preview' : 'off';

                  let clientTc: string;
                  const driftSec = stats.drift ?? 0;
                  const driftAbs = Math.abs(driftSec);
                  const isDriftWarning = driftAbs >= 0.03;
                  try {
                    const fps = FPS_OPTIONS[fpsIndex].value;
                    const drop = FPS_OPTIONS[fpsIndex].drop;
                    const tc = Timecode(directorTime, fps, drop);
                    const driftFrames = Math.round(driftSec * fps);
                    tc.add(driftFrames);
                    clientTc = tc.toString();
                  } catch {
                    clientTc = directorTime;
                  }

                  return (
                    <div
                      key={id}
                      className={`atem-mv-card status-${cardTallyState} ${isOffline ? 'offline' : ''}`}
                      onClick={() => !isOffline && handleSelectPreview(id)}
                      title="NEXTに設定"
                    >
                      {isOffline && <div className="director-offline-overlay">OFFLINE</div>}
                      <div className="input-card-state-rail">
                        {isPgmActive && <span className="input-state-badge program">ON AIR</span>}
                        {isPvwActive && <span className="input-state-badge preview">NEXT</span>}
                      </div>
                      <div className="input-card-header">
                        <span className="input-num">{idx + 1}</span>
                        <input
                          className="input-card-label"
                          value={label}
                          onChange={e => setCameraLabels(prev => ({ ...prev, [id]: e.target.value }))}
                          onClick={e => e.stopPropagation()}
                          onDoubleClick={e => e.stopPropagation()}
                          placeholder={defaultLabel}
                          maxLength={8}
                        />
                        <div className="input-card-meta">
                          <span className={`input-link-dot ${isOffline ? 'offline' : isDriftWarning ? 'warning' : 'ok'}`} />
                          <span className="stat-rtt">{stats.rtt.toFixed(0)}ms</span>
                        </div>
                      </div>

                      <div className="input-card-video">
                        {isVideoEnabled && mediaStreams.get(id) ? (
                          <VideoRenderer stream={mediaStreams.get(id)!} muted={true} className="dir-cam-video-el" />
                        ) : (
                          <div className="video-placeholder-mini">
                            <span>{isVideoEnabled ? 'NO SIGNAL' : 'OFF'}</span>
                          </div>
                        )}
                        <div className="input-card-video-overlay">
                          <span className="input-card-tc-val">{clientTc}</span>
                          <span className={`input-card-sync-pill ${isOffline ? 'offline' : isDriftWarning ? 'warning' : 'ok'}`}>
                            {isOffline ? 'OFFLINE' : isDriftWarning ? `${driftSec >= 0 ? '+' : ''}${driftSec.toFixed(3)}s` : 'SYNC'}
                          </span>
                        </div>
                      </div>

                      <div className="input-card-footer">
                        <div className="input-card-footer-meta">
                          <span className="input-card-footer-label">STATUS</span>
                          <strong>{isPgmActive ? '配信中' : isPvwActive ? '次に出す' : '待機'}</strong>
                        </div>
                        <div className="input-card-actions" onClick={e => e.stopPropagation()}>
                          <button
                            type="button"
                            className={`input-card-action pvw ${isPvwActive ? 'active' : ''}`}
                            onClick={() => handleSelectPreview(id)}
                            disabled={isOffline}
                          >
                            {isPvwActive ? 'NEXT選択中' : 'NEXTにする'}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* 右側：ATEM 筐体型 M/E コントロールパネル */}
        <div className="atem-control-chassis">
          <div className="atem-chassis-panel">
            <div className="creator-control-header">
              <div>
                <small>TAKE CONTROL</small>
                <strong>映像を切り替える</strong>
              </div>
              <span className={effectivePreviewSourceId ? 'ready' : ''}>
                {effectivePreviewSourceId ? 'READY' : 'NEXTを選択'}
              </span>
            </div>

            <div className="creator-take-flow">
              <div className="creator-flow-source on-air">
                <small>ON AIR</small>
                <strong>{programLabel}</strong>
              </div>
              <div className="creator-flow-arrow" aria-hidden="true">→</div>
              <div className="creator-flow-source next">
                <small>NEXT</small>
                <strong>{previewLabel}</strong>
              </div>
            </div>

            <div className="creator-take-actions">
              <button
                className="creator-take-button cut"
                onClick={handleCut}
                disabled={!effectivePreviewSourceId || isAutoTransitioning}
              >
                <span className="creator-action-icon">↯</span>
                <span>
                  <small>瞬時に切り替え</small>
                  <strong>TAKE</strong>
                </span>
                <kbd>SPACE</kbd>
              </button>
              <button
                className={`creator-take-button mix ${isAutoTransitioning ? 'transitioning' : ''}`}
                onClick={handleAuto}
                disabled={!effectivePreviewSourceId || isAutoTransitioning}
              >
                <span className="creator-action-icon">◐</span>
                <span>
                  <small>0.5秒でなめらかに</small>
                  <strong>MIX</strong>
                </span>
                <kbd>ENTER</kbd>
              </button>
            </div>

            <div className="creator-transition-progress" aria-label={`Transition ${transitionProgress}%`}>
              <div className="creator-progress-meta">
                <span>{isAutoTransitioning ? '切り替え中' : 'TRANSITION'}</span>
                <strong>{transitionProgress}%</strong>
              </div>
              <div className="creator-progress-track">
                <span style={{ width: `${transitionProgress}%` }} />
              </div>
            </div>

            <div className="creator-quick-select">
              <div className="creator-quick-select-head">
                <span>QUICK SELECT</span>
                <small>数字キーでも選択できます</small>
              </div>
              <div className="creator-quick-buttons">
                {clientEntries.length === 0 ? (
                  <span className="creator-no-inputs">カメラ待機中</span>
                ) : (
                  clientEntries.slice(0, 9).map(([id, stats], idx) => {
                    const isOffline = now - stats.lastSeen > 30000;
                    const isActive = effectivePreviewSourceId === id;
                    return (
                      <button
                        key={id}
                        className={isActive ? 'active' : ''}
                        onClick={() => handleSelectPreview(id)}
                        disabled={isOffline}
                        aria-label={`${cameraLabels[id] || `CAM${idx + 1}`}をNEXTに設定`}
                      >
                        <kbd>{idx + 1}</kbd>
                        <span>{cameraLabels[id] || `CAM${idx + 1}`}</span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* スイッチャーバスボタン列 */}
            <div className="atem-buses">
              {/* PROGRAM バス */}
              <div className="atem-bus-row program-bus">
                <span className="bus-label">PROGRAM</span>
                <div className="bus-buttons">
                  {clientEntries.length === 0 ? (
                    <span className="bus-empty">NO INPUTS</span>
                  ) : (
                    clientEntries.map(([id, stats], idx) => {
                      const isOffline = now - stats.lastSeen > 30000;
                      const isActive = effectivePgmSourceId === id;
                      return (
                        <button
                          key={id}
                          className={`atem-btn btn-pgm ${isActive ? 'lit' : ''}`}
                          onClick={() => handleSelectProgram(id)}
                          disabled={isOffline}
                        >
                          <span className="btn-num">{idx + 1}</span>
                          <span className="btn-label">{cameraLabels[id] || `CAM${idx + 1}`}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {/* PREVIEW バス */}
              <div className="atem-bus-row preview-bus">
                <span className="bus-label">PREVIEW</span>
                <div className="bus-buttons">
                  {clientEntries.length === 0 ? (
                    <span className="bus-empty">NO INPUTS</span>
                  ) : (
                    clientEntries.map(([id, stats], idx) => {
                      const isOffline = now - stats.lastSeen > 30000;
                      const isActive = effectivePreviewSourceId === id;
                      return (
                        <button
                          key={id}
                          className={`atem-btn btn-pvw ${isActive ? 'lit' : ''}`}
                          onClick={() => handleSelectPreview(id)}
                          disabled={isOffline}
                        >
                          <span className="btn-num">{idx + 1}</span>
                          <span className="btn-label">{cameraLabels[id] || `CAM${idx + 1}`}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </div>

            {/* トランジションブロック（CUT, AUTO, Tバー） */}
            <div className="atem-transition-block">
              <div className="tbar-chassis">
                <div className="tbar-track">
                  <div className="tbar-fill" style={{ height: `${transitionProgress}%` }} />
                  <input
                    type="range"
                    className="tbar-slider-input"
                    min="0"
                    max="100"
                    value={transitionProgress}
                    onChange={(e) => handleTBarChange(Number(e.target.value))}
                  />
                  <div className="tbar-handle" style={{ bottom: `calc(${transitionProgress}% - 8px)` }}>
                    <div className="handle-grip" />
                  </div>
                </div>
                <div className="tbar-status">
                  <span>MIX</span>
                  <strong className="tbar-pct">{transitionProgress}%</strong>
                </div>
              </div>

              <div className="transition-actions">
                <button
                  className="atem-btn-ctrl btn-cut"
                  onClick={handleCut}
                  disabled={!effectivePreviewSourceId || isAutoTransitioning}
                >
                  CUT
                </button>
                <button
                  className={`atem-btn-ctrl btn-auto ${isAutoTransitioning ? 'transitioning' : ''}`}
                  onClick={handleAuto}
                  disabled={!effectivePreviewSourceId || isAutoTransitioning}
                >
                  AUTO
                </button>
              </div>
            </div>
          </div>

          {/* ステータスストリップとログをパネル下部に綺麗に配置 */}
          <div className="atem-panel-footer">
            <div className="atem-status-strip">
              <span><small>ON AIR</small>{programLabel}</span>
              <span><small>NEXT</small>{previewLabel}</span>
              <span><small>CAMERAS</small>{liveCount} LIVE / {previewCount} NEXT</span>
              <span className={offlineCount > 0 ? 'warn' : ''}><small>OFFLINE</small>{offlineCount}</span>
              <span className={effectivePgmSourceId ? 'online' : 'warn'}><small>RETURN</small>{effectivePgmSourceId ? '送出中' : '待機'}</span>
            </div>

            {tallyActionLog.length > 0 && (
              <div className="director-log">
                <div className="director-log-title">{tr('director.actionLog')}</div>
                <div className="director-log-scroll">
                  {tallyActionLog.map((entry, i) => (
                    <div key={i} className="director-log-row">
                      <span className={`director-log-state state-text-${entry.state === 'live' ? 'live' : entry.state === 'preview' ? 'preview' : 'off'}`}>
                        {tr(tallyLabelKey(entry.state as TallyState))}
                      </span>
                      <span className="director-log-cam">{entry.cam}</span>
                      <span className="director-log-tc">{entry.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

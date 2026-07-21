import { memo } from 'react';
import { useExport, useRecording, useSync } from '../hooks/useAppDomains';
import { FooterControls } from './FooterControls';

interface RecordingFooterProps {
  showMarkers: boolean;
  tr: (key: string) => string;
}

export const RecordingFooter = memo(function RecordingFooter({ showMarkers, tr }: RecordingFooterProps) {
  const recording = useRecording();
  const sync = useSync();
  const exportState = useExport();

  return (
    <FooterControls
      isRunning={recording.isRunning}
      isPreparing={recording.isPreparing}
      isPaused={recording.isPaused}
      stopHoldPct={recording.stopHoldPct}
      holdStoppedRef={recording.holdStoppedRef}
      handleStartStop={recording.handleStartStop}
      beginStopHold={recording.beginStopHold}
      cancelStopHold={recording.cancelStopHold}
      handlePause={recording.handlePause}
      addMarker={exportState.addMarker}
      syncMode={sync.syncMode}
      p2pRole={recording.p2pRole}
      showMarkers={showMarkers}
      tr={tr}
    />
  );
});

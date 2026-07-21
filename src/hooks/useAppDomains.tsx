/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useLTC } from '../LTCSyncContext';

type LTC = ReturnType<typeof useLTC>;

type RecordingState = Pick<LTC,
  | 'isRunning'
  | 'isPreparing'
  | 'isPaused'
  | 'stopHoldPct'
  | 'fpsIndex'
  | 'setFpsIndex'
  | 'p2pRole'
  | 'handleStartStop'
  | 'handlePause'
  | 'beginStopHold'
  | 'cancelStopHold'
  | 'holdStoppedRef'
>;

type TallyState = Pick<LTC,
  | 'tallyOpen'
  | 'setTallyOpen'
  | 'tallyTorchEnabled'
  | 'setTallyTorchEnabled'
  | 'manualTally'
  | 'tallyPayload'
  | 'tallyTime'
  | 'tallyState'
  | 'isTallyConnected'
  | 'directorPanelOpen'
  | 'setDirectorPanelOpen'
  | 'clients'
  | 'nowTick'
  | 'clientBitrates'
  | 'handleManualTallyChange'
  | 'handleClientTallyChange'
  | 'handleSwitcherBusChange'
  | 'changeClientBitrate'
>;

type SyncState = Pick<LTC,
  | 'syncStatus'
  | 'syncMode'
  | 'setSyncMode'
  | 'manualTimecode'
  | 'setManualTimecode'
  | 'p2pRole'
  | 'driftStatus'
  | 'isResyncing'
  | 'handleManualResync'
  | 'clients'
  | 'nowTick'
  | 'packetLossRate'
  | 'setPacketLossRate'
  | 'masterDrift'
>;

type ExportState = Pick<LTC,
  | 'markers'
  | 'addMarker'
  | 'removeMarker'
  | 'updateMarkerComment'
  | 'exportToEDL'
  | 'exportToALE'
  | 'userBits'
  | 'setUserBits'
  | 'autoUserBits'
  | 'setAutoUserBits'
  | 'defaultReelName'
  | 'setDefaultReelName'
  | 'sceneName'
  | 'setSceneName'
>;

const RecordingContext = createContext<RecordingState | null>(null);
const TallyContext = createContext<TallyState | null>(null);
const SyncContext = createContext<SyncState | null>(null);
const ExportContext = createContext<ExportState | null>(null);

function useDomain<T>(context: React.Context<T | null>, name: string): T {
  const value = useContext(context);
  if (!value) throw new Error(`${name} must be used within AppDomainProvider`);
  return value;
}

export function AppDomainProvider({ children }: { children: ReactNode }) {
  const ltc = useLTC();

  const recording = useMemo<RecordingState>(() => ({
    isRunning: ltc.isRunning,
    isPreparing: ltc.isPreparing,
    isPaused: ltc.isPaused,
    stopHoldPct: ltc.stopHoldPct,
    fpsIndex: ltc.fpsIndex,
    setFpsIndex: ltc.setFpsIndex,
    p2pRole: ltc.p2pRole,
    handleStartStop: ltc.handleStartStop,
    handlePause: ltc.handlePause,
    beginStopHold: ltc.beginStopHold,
    cancelStopHold: ltc.cancelStopHold,
    holdStoppedRef: ltc.holdStoppedRef,
  }), [
    ltc.isRunning, ltc.isPreparing, ltc.isPaused, ltc.stopHoldPct, ltc.fpsIndex,
    ltc.setFpsIndex, ltc.p2pRole, ltc.handleStartStop, ltc.handlePause,
    ltc.beginStopHold, ltc.cancelStopHold, ltc.holdStoppedRef,
  ]);

  const tally = useMemo<TallyState>(() => ({
    tallyOpen: ltc.tallyOpen,
    setTallyOpen: ltc.setTallyOpen,
    tallyTorchEnabled: ltc.tallyTorchEnabled,
    setTallyTorchEnabled: ltc.setTallyTorchEnabled,
    manualTally: ltc.manualTally,
    tallyPayload: ltc.tallyPayload,
    tallyTime: ltc.tallyTime,
    tallyState: ltc.tallyState,
    isTallyConnected: ltc.isTallyConnected,
    directorPanelOpen: ltc.directorPanelOpen,
    setDirectorPanelOpen: ltc.setDirectorPanelOpen,
    clients: ltc.clients,
    nowTick: ltc.nowTick,
    clientBitrates: ltc.clientBitrates,
    handleManualTallyChange: ltc.handleManualTallyChange,
    handleClientTallyChange: ltc.handleClientTallyChange,
    handleSwitcherBusChange: ltc.handleSwitcherBusChange,
    changeClientBitrate: ltc.changeClientBitrate,
  }), [
    ltc.tallyOpen, ltc.setTallyOpen, ltc.tallyTorchEnabled, ltc.setTallyTorchEnabled,
    ltc.manualTally, ltc.tallyPayload, ltc.tallyTime, ltc.tallyState,
    ltc.isTallyConnected, ltc.directorPanelOpen, ltc.setDirectorPanelOpen,
    ltc.clients, ltc.nowTick, ltc.clientBitrates, ltc.handleManualTallyChange,
    ltc.handleClientTallyChange, ltc.handleSwitcherBusChange, ltc.changeClientBitrate,
  ]);

  const sync = useMemo<SyncState>(() => ({
    syncStatus: ltc.syncStatus,
    syncMode: ltc.syncMode,
    setSyncMode: ltc.setSyncMode,
    manualTimecode: ltc.manualTimecode,
    setManualTimecode: ltc.setManualTimecode,
    p2pRole: ltc.p2pRole,
    driftStatus: ltc.driftStatus,
    isResyncing: ltc.isResyncing,
    handleManualResync: ltc.handleManualResync,
    clients: ltc.clients,
    nowTick: ltc.nowTick,
    packetLossRate: ltc.packetLossRate,
    setPacketLossRate: ltc.setPacketLossRate,
    masterDrift: ltc.masterDrift,
  }), [
    ltc.syncStatus, ltc.syncMode, ltc.setSyncMode, ltc.manualTimecode,
    ltc.setManualTimecode, ltc.p2pRole, ltc.driftStatus, ltc.isResyncing,
    ltc.handleManualResync, ltc.clients, ltc.nowTick, ltc.packetLossRate,
    ltc.setPacketLossRate, ltc.masterDrift,
  ]);

  const exportState = useMemo<ExportState>(() => ({
    markers: ltc.markers,
    addMarker: ltc.addMarker,
    removeMarker: ltc.removeMarker,
    updateMarkerComment: ltc.updateMarkerComment,
    exportToEDL: ltc.exportToEDL,
    exportToALE: ltc.exportToALE,
    userBits: ltc.userBits,
    setUserBits: ltc.setUserBits,
    autoUserBits: ltc.autoUserBits,
    setAutoUserBits: ltc.setAutoUserBits,
    defaultReelName: ltc.defaultReelName,
    setDefaultReelName: ltc.setDefaultReelName,
    sceneName: ltc.sceneName,
    setSceneName: ltc.setSceneName,
  }), [
    ltc.markers, ltc.addMarker, ltc.removeMarker, ltc.updateMarkerComment,
    ltc.exportToEDL, ltc.exportToALE, ltc.userBits, ltc.setUserBits,
    ltc.autoUserBits, ltc.setAutoUserBits, ltc.defaultReelName,
    ltc.setDefaultReelName, ltc.sceneName, ltc.setSceneName,
  ]);

  return (
    <RecordingContext.Provider value={recording}>
      <TallyContext.Provider value={tally}>
        <SyncContext.Provider value={sync}>
          <ExportContext.Provider value={exportState}>
            {children}
          </ExportContext.Provider>
        </SyncContext.Provider>
      </TallyContext.Provider>
    </RecordingContext.Provider>
  );
}

export function useRecording(): RecordingState {
  return useDomain(RecordingContext, 'useRecording');
}

export function useTally(): TallyState {
  return useDomain(TallyContext, 'useTally');
}

export function useSync(): SyncState {
  return useDomain(SyncContext, 'useSync');
}

export function useExport(): ExportState {
  return useDomain(ExportContext, 'useExport');
}

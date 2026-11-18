import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { LTCSyncProvider } from './LTCSyncContext';
import type { SyncMessage } from './utils/PeerSync';

// ---------------------------------------------------------------------------
// The P2P message handler lives inside LTCSyncProvider and is exercised here
// through the messageHandlerRef that useP2P exposes. All sibling hooks are
// mocked at their boundary (same pattern as useP2P/useNetworkSync tests);
// the engine is a spy-fake so we can assert exactly which peer messages reach
// the sync math.
// ---------------------------------------------------------------------------

const { fakeEngine, p2pState, p2pRefs, toastFn } = vi.hoisted(() => {
  const fakeEngine = {
    getDiffSeconds: vi.fn(() => 0),
    getTimecodeString: vi.fn(() => '00:00:00:00'),
    getTimecodeForOffset: vi.fn(() => '00:00:00:00'),
    getCorrectedTc: vi.fn(() => '00:00:00:01'),
    signedFrameDiffTo: vi.fn(() => 0),
    setManualTimecode: vi.fn(),
    setUserBits: vi.fn(),
    setFps: vi.fn(),
    setVolume: vi.fn(),
    updateSampleRate: vi.fn(),
    syncWithOffset: vi.fn(),
    dateForOffset: vi.fn(() => new Date(0)),
  };

  const p2pState = {
    isHost: false,
    targetId: 'MASTERID',
    masterDriftSetter: vi.fn(),
    p2pStatusSetter: vi.fn(),
    setClients: vi.fn(),
    peerSync: null as null | {
      send: ReturnType<typeof vi.fn>;
      sendTo: ReturnType<typeof vi.fn>;
      broadcast: ReturnType<typeof vi.fn>;
    },
  };

  // Stable ref objects — the provider writes messageHandlerRef.current on
  // every render and reads peerSyncRef.current inside intervals/handlers.
  const p2pRefs = {
    peerSyncRef: { current: null as unknown },
    messageHandlerRef: { current: null as unknown },
    rttHistoryRef: { current: [] as number[] },
    lastSyncTimeRef: { current: 0 },
    lastP2pSyncTimeRef: { current: 0 },
    lastMasterContactTimeRef: { current: 0 },
    // The id the client actually DIALED — auth compares against this, not
    // the editable targetId field.
    connectAttemptedForRef: { current: 'MASTERID' as string | null },
  };

  const toastFn = Object.assign(vi.fn(), {
    error: vi.fn(),
    success: vi.fn(),
  });

  return { fakeEngine, p2pState, p2pRefs, toastFn };
});

vi.mock('react-hot-toast', () => ({ default: toastFn }));

vi.mock('./hooks/useP2P', () => ({
  useP2P: () => ({
    peerId: 'LOCALID',
    targetId: p2pState.targetId,
    setTargetId: vi.fn(),
    p2pStatus: 'READY: ID LOCALID',
    setP2pStatus: p2pState.p2pStatusSetter,
    isHost: p2pState.isHost,
    masterDrift: null,
    setMasterDrift: p2pState.masterDriftSetter,
    clients: {},
    setClients: p2pState.setClients,
    packetLossRate: 0,
    setPacketLossRate: vi.fn(),
    isP2PSetupPending: false,
    peerSyncRef: p2pRefs.peerSyncRef,
    messageHandlerRef: p2pRefs.messageHandlerRef,
    rttHistoryRef: p2pRefs.rttHistoryRef,
    lastSyncTimeRef: p2pRefs.lastSyncTimeRef,
    lastP2pSyncTimeRef: p2pRefs.lastP2pSyncTimeRef,
    lastMasterContactTimeRef: p2pRefs.lastMasterContactTimeRef,
    connectAttemptedForRef: p2pRefs.connectAttemptedForRef,
    resetP2P: vi.fn(),
    setupP2PMaster: vi.fn(),
    setupP2PClient: vi.fn(),
    joinSession: vi.fn(),
  }),
}));

vi.mock('./hooks/useLtcEngine', () => ({
  useLtcEngine: (params: { engineRef: { current: unknown } }) => {
    // The real hook creates the LtcEngine in a mount effect; the mock hands
    // the provider's ref a spy-fake instead so handlers can be observed.
    params.engineRef.current = fakeEngine;
    return {
      stopHoldPctRefs: {
        holdStoppedRef: { current: false },
        stopHoldStartRef: { current: 0 },
        stopHoldRafRef: { current: null },
      },
      beep: vi.fn(),
      handleStartStop: vi.fn(),
      handlePause: vi.fn(),
      beginStopHold: vi.fn(),
      cancelStopHold: vi.fn(),
    };
  },
}));

vi.mock('./hooks/useNetworkSync', () => ({
  useNetworkSync: () => ({
    syncStatus: null,
    setSyncStatus: vi.fn(),
    driftStatus: null,
    setDriftStatus: vi.fn(),
    isResyncing: false,
    handleManualResync: vi.fn(),
  }),
}));

vi.mock('./hooks/useMarkers', () => ({
  useMarkers: () => ({
    markers: [],
    setMarkers: vi.fn(),
    markerFlash: null,
    addMarker: vi.fn(),
    removeMarker: vi.fn(),
    updateMarkerComment: vi.fn(),
    exportToEDL: vi.fn(),
    exportToALE: vi.fn(),
    exportToFCPXML: vi.fn(),
    exportToResolve: vi.fn(),
    exportToCSV: vi.fn(),
    exportToOTIO: vi.fn(),
  }),
}));

vi.mock('./hooks/useBatteryMonitor', () => ({
  useBatteryMonitor: () => ({ batteryLevel: null, isCharging: false, batteryEta: null }),
}));

vi.mock('./hooks/useWakeLock', () => ({ useWakeLock: () => 'inactive' }));
vi.mock('./hooks/useAudioContextRecovery', () => ({ useAudioContextRecovery: () => {} }));

function renderProvider() {
  return render(
    <LTCSyncProvider>
      <div />
    </LTCSyncProvider>,
  );
}

function dispatch(msg: SyncMessage) {
  const handler = p2pRefs.messageHandlerRef.current as ((m: SyncMessage) => void) | null;
  if (!handler) throw new Error('messageHandlerRef was not assigned by the provider');
  act(() => handler(msg));
}

const heartbeatFrom = (clientId: string): SyncMessage => ({
  type: 'heartbeat',
  clientId,
  masterTimecode: '00:00:00:00',
  masterTimestamp: 1,
  fps: 30,
  isDropFrame: false,
  isRunning: false,
  isPaused: false,
});

const syncResponseFrom = (clientId: string): SyncMessage => ({
  type: 'sync-response',
  clientId,
  masterTimecode: '00:00:00:00',
  masterTimestamp: 1,
  fps: 30,
  isDropFrame: false,
  isRunning: false,
  isPaused: false,
  clientTimestamp: performance.now(),
});

beforeEach(() => {
  vi.clearAllMocks();
  p2pState.isHost = false;
  p2pState.targetId = 'MASTERID';
  p2pState.peerSync = null;
  p2pRefs.peerSyncRef.current = null;
  p2pRefs.messageHandlerRef.current = null;
  p2pRefs.rttHistoryRef.current = [];
  p2pRefs.lastSyncTimeRef.current = 0;
  p2pRefs.lastP2pSyncTimeRef.current = 0;
  p2pRefs.lastMasterContactTimeRef.current = 0;
  p2pRefs.connectAttemptedForRef.current = 'MASTERID';
});

describe('LTCSyncContext — P2P message authentication (client role)', () => {
  it('ignores heartbeat and sync-response messages from a peer other than the dialed master', () => {
    renderProvider();

    dispatch(heartbeatFrom('INTRUDER'));
    dispatch(syncResponseFrom('INTRUDER'));

    // Nothing peer-supplied may reach the drift math or status surfaces.
    expect(fakeEngine.getDiffSeconds).not.toHaveBeenCalled();
    expect(p2pState.masterDriftSetter).not.toHaveBeenCalled();
    expect(p2pState.p2pStatusSetter).not.toHaveBeenCalled();
  });

  it('ignores master messages entirely before a master id is targeted', () => {
    p2pState.targetId = '';
    p2pRefs.connectAttemptedForRef.current = null; // nothing dialed yet
    renderProvider();

    dispatch(heartbeatFrom('ANYONE'));
    expect(fakeEngine.getDiffSeconds).not.toHaveBeenCalled();
  });

  it('accepts heartbeat and sync-response from the expected master id', () => {
    renderProvider();

    dispatch(heartbeatFrom('MASTERID'));
    expect(fakeEngine.getDiffSeconds).toHaveBeenCalledWith('00:00:00:00');
    expect(p2pState.masterDriftSetter).toHaveBeenCalledWith(0);

    dispatch(syncResponseFrom('MASTERID'));
    expect(fakeEngine.getDiffSeconds).toHaveBeenCalledTimes(2);
  });

  it('keeps accepting the dialed master after the targetId field is edited', () => {
    // Regression: auth used to compare against the editable targetId —
    // retyping the field mid-session orphaned the live connection (every
    // heartbeat dropped → MASTER TIMEOUT → client stopped).
    p2pState.targetId = 'RETYPEINPROGRESS';
    renderProvider();

    dispatch(heartbeatFrom('MASTERID'));
    expect(fakeEngine.getDiffSeconds).toHaveBeenCalledWith('00:00:00:00');
  });
});

describe('LTCSyncContext — P2P message handling (master role)', () => {
  it('answers a sync-request only on the requester’s connection', () => {
    p2pState.isHost = true;
    const sendTo = vi.fn();
    const send = vi.fn();
    const broadcast = vi.fn();
    p2pState.peerSync = { send, sendTo, broadcast };
    p2pRefs.peerSyncRef.current = p2pState.peerSync;
    renderProvider();

    dispatch({ type: 'sync-request', clientId: 'CLIENTX', clientTimestamp: 42 });

    expect(sendTo).toHaveBeenCalledTimes(1);
    expect(sendTo.mock.calls[0][0]).toBe('CLIENTX');
    expect(sendTo.mock.calls[0][1]).toMatchObject({
      type: 'sync-response',
      clientTimestamp: 42,
    });
    // No broadcast leak: other connected clients must not receive a
    // response echoing CLIENTX's timestamp.
    expect(send).not.toHaveBeenCalled();
    expect(broadcast).not.toHaveBeenCalled();
    // The requester is still tallied as seen.
    expect(p2pState.setClients).toHaveBeenCalled();
  });
});

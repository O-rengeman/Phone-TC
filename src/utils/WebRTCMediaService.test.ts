import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebRTCMediaService, DISCONNECT_GRACE_MS } from './WebRTCMediaService';
import type { PeerSync, SyncMessage } from './PeerSync';

// jsdom implements none of RTCPeerConnection/RTCSessionDescription/
// RTCIceCandidate/getUserMedia, so this file fakes just enough of the WebRTC
// surface for WebRTCMediaService's own logic (transceiver direction, sender
// tracking, ICE candidate queueing, disconnect grace timer) to be exercised
// deterministically without a real browser.

interface FakeTrack {
  kind: string;
  enabled: boolean;
  stop: () => void;
}

function makeFakeTrack(kind = 'video'): FakeTrack {
  return { kind, enabled: true, stop: vi.fn() };
}

function makeFakeStream(track: FakeTrack = makeFakeTrack()) {
  const tracks = [track];
  return {
    id: 'fake-stream',
    getTracks: () => tracks,
    getVideoTracks: () => tracks.filter(t => t.kind === 'video'),
  } as unknown as MediaStream;
}

class FakeSender {
  track: FakeTrack | null;
  replaceTrack = vi.fn((track: FakeTrack | null) => { this.track = track; });
  getParameters = vi.fn(() => ({ encodings: [{}] as RTCRtpEncodingParameters[] }));
  setParameters = vi.fn(() => {});
  constructor(track: FakeTrack | null) { this.track = track; }
}

class FakeTransceiver {
  sender: FakeSender;
  direction: string;
  constructor(direction: string, track: FakeTrack | null) {
    this.direction = direction;
    this.sender = new FakeSender(track);
  }
}

let createdPeerConnections: FakeRTCPeerConnection[] = [];

class FakeRTCPeerConnection {
  transceivers: FakeTransceiver[] = [];
  localDescription: unknown = null;
  remoteDescription: unknown = null;
  iceConnectionState = 'new';
  iceCandidatesAdded: unknown[] = [];
  closed = false;
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  ontrack: ((event: { track: FakeTrack; streams: unknown[] }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;

  constructor() {
    createdPeerConnections.push(this);
  }

  addTransceiver(trackOrKind: FakeTrack | string, init: { direction: string }) {
    const track = typeof trackOrKind === 'string' ? null : trackOrKind;
    const t = new FakeTransceiver(init.direction, track);
    this.transceivers.push(t);
    return t;
  }

  getSenders() {
    return this.transceivers.map(t => t.sender);
  }

  createOffer() { return Promise.resolve({ type: 'offer', sdp: 'fake-offer' }); }
  createAnswer() { return Promise.resolve({ type: 'answer', sdp: 'fake-answer' }); }
  setLocalDescription(desc: unknown) { this.localDescription = desc; return Promise.resolve(); }
  setRemoteDescription(desc: unknown) { this.remoteDescription = desc; return Promise.resolve(); }

  addIceCandidate(candidate: { __reject?: boolean }) {
    this.iceCandidatesAdded.push(candidate);
    if (candidate?.__reject) return Promise.reject(new Error('bad candidate'));
    return Promise.resolve();
  }

  close() { this.closed = true; }

  /** Test helper: simulates the browser flipping ICE state and firing the handler. */
  _setIceState(state: string) {
    this.iceConnectionState = state;
    this.oniceconnectionstatechange?.();
  }
}

function makeFakePeerSync() {
  return { sendTo: vi.fn() } as unknown as PeerSync;
}

const dummySignalingFields = {
  masterTimecode: '00:00:00:00',
  masterTimestamp: 0,
  fps: 30,
  isDropFrame: false,
  isRunning: false,
};

function offerMsg(clientId: string): SyncMessage {
  return { type: 'webrtc-offer', clientId, sdp: { type: 'offer', sdp: 'x' }, ...dummySignalingFields };
}

function answerMsg(clientId: string): SyncMessage {
  return { type: 'webrtc-answer', clientId, sdp: { type: 'answer', sdp: 'x' }, ...dummySignalingFields };
}

function candidateMsg(clientId: string, opts: { reject?: boolean; candidate?: string } = {}): SyncMessage {
  const { reject = false, candidate = 'x' } = opts;
  return {
    type: 'webrtc-candidate',
    clientId,
    candidate: { candidate, __reject: reject } as unknown as RTCIceCandidateInit,
    ...dummySignalingFields,
  };
}

beforeEach(() => {
  createdPeerConnections = [];
  vi.stubGlobal('RTCPeerConnection', FakeRTCPeerConnection);
  vi.stubGlobal('RTCSessionDescription', class {
    init: unknown;
    constructor(init: unknown) { this.init = init; }
  });
  vi.stubGlobal('RTCIceCandidate', class {
    constructor(init: unknown) { Object.assign(this, init as object); }
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    value: { getUserMedia: vi.fn(() => Promise.resolve(makeFakeStream())) },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  delete (navigator as unknown as { mediaDevices?: unknown }).mediaDevices;
});

describe('WebRTCMediaService transceiver direction (bug 2 regression)', () => {
  it('master with no pgm stream yet creates a trackless sendrecv transceiver, not recvonly', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', true);
    await service.handleSignalingMessage(offerMsg('CLIENT1'));

    const pc = createdPeerConnections[0];
    expect(pc.transceivers).toHaveLength(1);
    expect(pc.transceivers[0].direction).toBe('sendrecv');
    expect(pc.transceivers[0].sender.track).toBeNull();
  });

  it('uses the current pgm stream track when one is already set at connection-creation time', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', true);
    const track = makeFakeTrack();
    await service.setPgmStream(makeFakeStream(track));

    await service.handleSignalingMessage(offerMsg('CLIENT1'));

    const pc = createdPeerConnections[0];
    expect(pc.transceivers[0].direction).toBe('sendrecv');
    expect(pc.transceivers[0].sender.track).toBe(track);
  });

  it('setPgmStream replaces the track on a sender that started trackless (the bug 2 fix)', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', true);
    await service.handleSignalingMessage(offerMsg('CLIENT1'));
    const sender = createdPeerConnections[0].transceivers[0].sender;
    expect(sender.track).toBeNull();

    const track = makeFakeTrack();
    await service.setPgmStream(makeFakeStream(track));

    expect(sender.replaceTrack).toHaveBeenCalledWith(track);
  });

  it('setPgmStream(null) clears the track on all tracked senders', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', true);
    await service.handleSignalingMessage(offerMsg('CLIENT1'));
    const sender = createdPeerConnections[0].transceivers[0].sender;
    await service.setPgmStream(makeFakeStream());

    await service.setPgmStream(null);

    expect(sender.replaceTrack).toHaveBeenLastCalledWith(null);
  });

  it('setPgmStream fans out to every connected client', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', true);
    await service.handleSignalingMessage(offerMsg('CLIENT1'));
    await service.handleSignalingMessage(offerMsg('CLIENT2'));

    const track = makeFakeTrack();
    await service.setPgmStream(makeFakeStream(track));

    expect(createdPeerConnections[0].transceivers[0].sender.replaceTrack).toHaveBeenCalledWith(track);
    expect(createdPeerConnections[1].transceivers[0].sender.replaceTrack).toHaveBeenCalledWith(track);
  });

  it('setPgmStream is a no-op on a client (non-master) instance', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', false);
    await service.handleSignalingMessage(offerMsg('MASTER'));
    const sender = createdPeerConnections[0]?.transceivers[0]?.sender;

    await service.setPgmStream(makeFakeStream());

    expect(sender?.replaceTrack).not.toHaveBeenCalled();
  });
});

describe('WebRTCMediaService ICE candidate queueing (bug 5 regression)', () => {
  it('queues a candidate that arrives before remoteDescription is set', async () => {
    const peerSync = makeFakePeerSync();
    const service = new WebRTCMediaService(peerSync, 'ME', false);
    await service.connectToPeer('MASTER'); // creates the pc, no remoteDescription yet
    const pc = createdPeerConnections[0];

    await service.handleSignalingMessage(candidateMsg('MASTER'));

    expect(pc.iceCandidatesAdded).toHaveLength(0);
  });

  it('flushes multiple queued candidates in the order they arrived, once remoteDescription is set', async () => {
    const peerSync = makeFakePeerSync();
    const service = new WebRTCMediaService(peerSync, 'ME', false);
    await service.connectToPeer('MASTER');
    const pc = createdPeerConnections[0];

    await service.handleSignalingMessage(candidateMsg('MASTER', { candidate: 'first' }));
    await service.handleSignalingMessage(candidateMsg('MASTER', { candidate: 'second' }));
    expect(pc.iceCandidatesAdded).toHaveLength(0); // still queued, remoteDescription not set yet

    await service.handleSignalingMessage(answerMsg('MASTER'));

    expect(pc.iceCandidatesAdded).toEqual([
      expect.objectContaining({ candidate: 'first' }),
      expect.objectContaining({ candidate: 'second' }),
    ]);
  });

  it('adds a candidate immediately when remoteDescription is already set', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', true);
    await service.handleSignalingMessage(offerMsg('CLIENT1')); // sets remoteDescription
    const pc = createdPeerConnections[0];

    await service.handleSignalingMessage(candidateMsg('CLIENT1'));

    expect(pc.iceCandidatesAdded).toHaveLength(1);
  });

  it('does not throw when a queued candidate is rejected during flush', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', false);
    await service.connectToPeer('MASTER');

    await service.handleSignalingMessage(candidateMsg('MASTER', { reject: true }));
    await expect(service.handleSignalingMessage(answerMsg('MASTER'))).resolves.not.toThrow();
  });
});

describe('WebRTCMediaService disconnect grace timer (bug 6 regression)', () => {
  beforeEach(() => vi.useFakeTimers());

  it('does not close immediately on a transient "disconnected" ICE state', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', false);
    await service.connectToPeer('MASTER');
    const pc = createdPeerConnections[0];

    pc._setIceState('disconnected');

    expect(pc.closed).toBe(false);
  });

  it('closes the peer once the grace period elapses while still disconnected', async () => {
    const onStreamClosed = vi.fn();
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', false);
    service.onStreamClosed = onStreamClosed;
    await service.connectToPeer('MASTER');
    const pc = createdPeerConnections[0];

    pc._setIceState('disconnected');
    vi.advanceTimersByTime(DISCONNECT_GRACE_MS);

    expect(pc.closed).toBe(true);
    expect(onStreamClosed).toHaveBeenCalledWith('MASTER');
  });

  it('cancels the grace timer if the connection recovers before it elapses', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', false);
    await service.connectToPeer('MASTER');
    const pc = createdPeerConnections[0];

    pc._setIceState('disconnected');
    vi.advanceTimersByTime(DISCONNECT_GRACE_MS / 2);
    pc._setIceState('connected');
    vi.advanceTimersByTime(DISCONNECT_GRACE_MS);

    expect(pc.closed).toBe(false);
  });

  it('closes immediately on "failed" with no grace period', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', false);
    await service.connectToPeer('MASTER');
    const pc = createdPeerConnections[0];

    pc._setIceState('failed');

    expect(pc.closed).toBe(true);
  });

  it('closes immediately on "closed" with no grace period', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', false);
    await service.connectToPeer('MASTER');
    const pc = createdPeerConnections[0];

    pc._setIceState('closed');

    expect(pc.closed).toBe(true);
  });
});

describe('WebRTCMediaService signaling flow', () => {
  it('connectToPeer creates a connection, sends an offer, and is a no-op if already connected', async () => {
    const peerSync = makeFakePeerSync();
    const service = new WebRTCMediaService(peerSync, 'ME', false);

    await service.connectToPeer('MASTER');
    expect(peerSync.sendTo).toHaveBeenCalledWith('MASTER', expect.objectContaining({ type: 'webrtc-offer' }));
    expect(createdPeerConnections).toHaveLength(1);

    await service.connectToPeer('MASTER');
    expect(createdPeerConnections).toHaveLength(1); // no second pc created
  });

  it('handleSignalingMessage(offer) creates a pc, answers, and sends webrtc-answer back', async () => {
    const peerSync = makeFakePeerSync();
    const service = new WebRTCMediaService(peerSync, 'ME', true);

    await service.handleSignalingMessage(offerMsg('CLIENT1'));

    expect(peerSync.sendTo).toHaveBeenCalledWith('CLIENT1', expect.objectContaining({ type: 'webrtc-answer' }));
  });

  it('handleSignalingMessage(answer) sets remoteDescription without sending anything back', async () => {
    const peerSync = makeFakePeerSync();
    const service = new WebRTCMediaService(peerSync, 'ME', false);
    await service.connectToPeer('MASTER');
    vi.mocked(peerSync.sendTo).mockClear();

    await service.handleSignalingMessage(answerMsg('MASTER'));

    expect(createdPeerConnections[0].remoteDescription).toBeTruthy();
    expect(peerSync.sendTo).not.toHaveBeenCalled();
  });

  it('handleSignalingMessage is a no-op when clientId is missing', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', true);
    await expect(
      service.handleSignalingMessage({ type: 'webrtc-offer', ...dummySignalingFields }),
    ).resolves.not.toThrow();
    expect(createdPeerConnections).toHaveLength(0);
  });

  it('onicecandidate sends a webrtc-candidate message when a candidate is present', async () => {
    const peerSync = makeFakePeerSync();
    const service = new WebRTCMediaService(peerSync, 'ME', false);
    await service.connectToPeer('MASTER');
    const pc = createdPeerConnections[0];

    pc.onicecandidate?.({ candidate: { candidate: 'abc' } });

    expect(peerSync.sendTo).toHaveBeenCalledWith('MASTER', expect.objectContaining({ type: 'webrtc-candidate' }));
  });

  it('onicecandidate serializes RTCIceCandidate instances to plain objects before sending', async () => {
    const peerSync = makeFakePeerSync();
    const service = new WebRTCMediaService(peerSync, 'ME', false);
    await service.connectToPeer('MASTER');
    const pc = createdPeerConnections[0];
    const candidate: RTCIceCandidateInit & { toJSON: () => RTCIceCandidateInit } = {
      candidate: 'abc',
      sdpMid: '0',
      sdpMLineIndex: 0,
      usernameFragment: 'ufrag',
      toJSON: () => ({
        candidate: 'abc',
        sdpMid: '0',
        sdpMLineIndex: 0,
        usernameFragment: 'ufrag',
      }),
    };

    pc.onicecandidate?.({ candidate });

    const sentMessage = vi.mocked(peerSync.sendTo).mock.calls.at(-1)?.[1];
    expect(sentMessage).toMatchObject({
      type: 'webrtc-candidate',
      candidate: {
        candidate: 'abc',
        sdpMid: '0',
        sdpMLineIndex: 0,
        usernameFragment: 'ufrag',
      },
    });
  });

  it('onicecandidate does nothing on the end-of-candidates null signal', async () => {
    const peerSync = makeFakePeerSync();
    const service = new WebRTCMediaService(peerSync, 'ME', false);
    await service.connectToPeer('MASTER');
    vi.mocked(peerSync.sendTo).mockClear();
    const pc = createdPeerConnections[0];

    pc.onicecandidate?.({ candidate: null });

    expect(peerSync.sendTo).not.toHaveBeenCalled();
  });

  it('ontrack invokes onRemoteStream with the peer id and stream', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', true);
    const onRemoteStream = vi.fn();
    service.onRemoteStream = onRemoteStream;
    await service.handleSignalingMessage(offerMsg('CLIENT1'));
    const pc = createdPeerConnections[0];
    const stream = makeFakeStream();

    pc.ontrack?.({ track: makeFakeTrack(), streams: [stream] });

    expect(onRemoteStream).toHaveBeenCalledWith({ peerId: 'CLIENT1', stream });
  });
});

describe('WebRTCMediaService camera lifecycle', () => {
  it('startLocalCamera requests getUserMedia and caches the result', async () => {
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', false);
    const stream1 = await service.startLocalCamera();
    const stream2 = await service.startLocalCamera();

    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(stream1).toBe(stream2);
  });

  it('startLocalCamera propagates errors from getUserMedia', async () => {
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(() => Promise.reject(new Error('denied'))) },
      configurable: true,
    });
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', false);

    await expect(service.startLocalCamera()).rejects.toThrow('denied');
  });

  it('stopLocalCamera stops all tracks and clears the cached stream', async () => {
    const track = makeFakeTrack();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(() => Promise.resolve(makeFakeStream(track))) },
      configurable: true,
    });
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', false);
    await service.startLocalCamera();

    service.stopLocalCamera();

    expect(track.stop).toHaveBeenCalled();
  });

  it('setEcoMode toggles the local video track enabled state', async () => {
    const track = makeFakeTrack();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(() => Promise.resolve(makeFakeStream(track))) },
      configurable: true,
    });
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', false);
    await service.startLocalCamera();

    service.setEcoMode(true);
    expect(track.enabled).toBe(false);

    service.setEcoMode(false);
    expect(track.enabled).toBe(true);
  });
});

describe('WebRTCMediaService closePeer / closeAll', () => {
  it('closePeer closes the specific pc and fires onStreamClosed', async () => {
    const onStreamClosed = vi.fn();
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', true);
    service.onStreamClosed = onStreamClosed;
    await service.handleSignalingMessage(offerMsg('CLIENT1'));

    service.closePeer('CLIENT1');

    expect(createdPeerConnections[0].closed).toBe(true);
    expect(onStreamClosed).toHaveBeenCalledWith('CLIENT1');
  });

  it('closeAll closes every connection and stops the local camera', async () => {
    const track = makeFakeTrack();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia: vi.fn(() => Promise.resolve(makeFakeStream(track))) },
      configurable: true,
    });
    const service = new WebRTCMediaService(makeFakePeerSync(), 'ME', true);
    await service.handleSignalingMessage(offerMsg('CLIENT1'));
    await service.handleSignalingMessage(offerMsg('CLIENT2'));
    await service.startLocalCamera();

    service.closeAll();

    expect(createdPeerConnections[0].closed).toBe(true);
    expect(createdPeerConnections[1].closed).toBe(true);
    expect(track.stop).toHaveBeenCalled();
  });
});

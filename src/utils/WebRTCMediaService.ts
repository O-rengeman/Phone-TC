import { debug } from './log';
import type { PeerSync, SyncMessage } from './PeerSync';
import { ICE_SERVERS } from './iceServers';

export interface WebRTCStreamEvent {
  peerId: string;
  stream: MediaStream;
}

// Grace period before a transient ICE 'disconnected' state is treated as a
// real drop — mobile networks (Wi-Fi/cellular handoff) often recover within
// a few seconds without needing to tear down and re-negotiate the connection.
export const DISCONNECT_GRACE_MS = 5000;

function serializeIceCandidate(candidate: RTCIceCandidate): RTCIceCandidateInit {
  if (typeof candidate.toJSON === 'function') {
    return candidate.toJSON();
  }
  return {
    candidate: candidate.candidate,
    sdpMid: candidate.sdpMid,
    sdpMLineIndex: candidate.sdpMLineIndex,
    usernameFragment: candidate.usernameFragment ?? undefined,
  };
}

export class WebRTCMediaService {
  private peerConnections = new Map<string, RTCPeerConnection>();
  // The video RTCRtpSender for each peer, tracked by reference from creation
  // time (whether or not it already has a track) so setPgmStream() can call
  // replaceTrack() directly instead of re-discovering it via
  // pc.getSenders().find(...), which fails to match a still-trackless sender.
  private senders = new Map<string, RTCRtpSender>();
  // ICE candidates that arrive before the corresponding pc's remoteDescription
  // is set — queued instead of dropped, then flushed once it's set.
  private iceCandidateQueues = new Map<string, RTCIceCandidateInit[]>();
  private disconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private localStream: MediaStream | null = null;
  private pgmStream: MediaStream | null = null;

  // Callbacks
  public onRemoteStream?: (event: WebRTCStreamEvent) => void;
  public onStreamClosed?: (peerId: string) => void;

  private peerSync: PeerSync;
  private isMaster: boolean;

  constructor(peerSync: PeerSync, _myId: string, isMaster: boolean) {
    this.peerSync = peerSync;
    this.isMaster = isMaster;
  }

  /**
   * Initializes the local camera with strict constraints.
   */
  public async startLocalCamera(): Promise<MediaStream> {
    if (this.localStream) {
      return this.localStream;
    }

    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 360 },
          frameRate: { ideal: 30, max: 30 },
          facingMode: 'environment' // Prioritize rear camera
        },
        audio: false // No audio to prevent feedback
      });
      debug('[WebRTC] Local camera started', this.localStream.id);
      return this.localStream;
    } catch (err) {
      console.error('[WebRTC] Failed to get local camera', err);
      throw err;
    }
  }

  public stopLocalCamera() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
      debug('[WebRTC] Local camera stopped');
    }
  }

  /**
   * Puts the camera to sleep (stops sending frames) when app is backgrounded.
   */
  public setEcoMode(enabled: boolean) {
    if (this.localStream) {
      this.localStream.getVideoTracks().forEach(track => {
        track.enabled = !enabled;
      });
      debug(`[WebRTC] Eco mode: ${enabled ? 'ON (Paused)' : 'OFF (Active)'}`);
    }
  }

  /**
   * Master only: Switches the PGM return feed seamlessly.
   */
  public async setPgmStream(stream: MediaStream | null) {
    if (!this.isMaster) return;
    this.pgmStream = stream;

    const newVideoTrack = stream?.getVideoTracks()[0] || null;

    // Replace track on all existing connections. Senders are tracked by
    // reference from creation time (see `senders`), so this works even for a
    // sender that started trackless (no pgm feed chosen yet) — replaceTrack
    // can start transmitting without renegotiation since the transceiver was
    // always created with direction 'sendrecv'.
    for (const [peerId, sender] of this.senders.entries()) {
      try {
        await sender.replaceTrack(newVideoTrack);
        debug(`[WebRTC] Replaced PGM track for peer ${peerId}`);
      } catch (err) {
        console.error(`[WebRTC] Failed to replace track for ${peerId}`, err);
      }
    }
  }

  /**
   * Handles incoming signaling messages from PeerSync.
   */
  public async handleSignalingMessage(msg: SyncMessage) {
    if (!msg.clientId) return;
    const peerId = msg.clientId;

    let pc = this.peerConnections.get(peerId);

    if (msg.type === 'webrtc-offer' && msg.sdp) {
      if (!pc) {
        pc = this.createPeerConnection(peerId);
      }
      await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
      await this.flushIceCandidateQueue(peerId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      this.peerSync.sendTo(peerId, {
        type: 'webrtc-answer',
        sdp: answer,
        // Fill required fields with dummies for signaling
        masterTimecode: '00:00:00:00',
        masterTimestamp: 0,
        fps: 30,
        isDropFrame: false,
        isRunning: false
      });
    } else if (msg.type === 'webrtc-answer' && msg.sdp) {
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
        await this.flushIceCandidateQueue(peerId, pc);
      }
    } else if (msg.type === 'webrtc-candidate' && msg.candidate) {
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate', err);
        }
      } else {
        // No pc yet, or its remoteDescription isn't set: queue this candidate
        // instead of dropping it — arrival order across the signaling channel
        // isn't guaranteed relative to the offer/answer round-trip.
        const queue = this.iceCandidateQueues.get(peerId) ?? [];
        queue.push(msg.candidate);
        this.iceCandidateQueues.set(peerId, queue);
      }
    }
  }

  private async flushIceCandidateQueue(peerId: string, pc: RTCPeerConnection): Promise<void> {
    const queue = this.iceCandidateQueues.get(peerId);
    if (!queue || queue.length === 0) return;
    this.iceCandidateQueues.delete(peerId);
    for (const candidate of queue) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error(`[WebRTC] Error adding queued ICE candidate for ${peerId}`, err);
      }
    }
  }

  /**
   * Initiates a WebRTC connection to a peer.
   * Client calls this to connect to Master.
   */
  public async connectToPeer(targetId: string) {
    if (this.peerConnections.has(targetId)) return;
    
    const pc = this.createPeerConnection(targetId);
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    this.peerSync.sendTo(targetId, {
      type: 'webrtc-offer',
      sdp: offer,
      // Fill required fields with dummies for signaling
      masterTimecode: '00:00:00:00',
      masterTimestamp: 0,
      fps: 30,
      isDropFrame: false,
      isRunning: false
    });
  }

  private createPeerConnection(peerId: string): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    this.peerConnections.set(peerId, pc);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.peerSync.sendTo(peerId, {
          type: 'webrtc-candidate',
          candidate: serializeIceCandidate(event.candidate),
          // Fill required fields with dummies
          masterTimecode: '00:00:00:00',
          masterTimestamp: 0,
          fps: 30,
          isDropFrame: false,
          isRunning: false
        });
      }
    };

    pc.ontrack = (event) => {
      debug(`[WebRTC] Received remote track from ${peerId}`, event.track.kind);
      if (event.streams && event.streams[0]) {
        if (this.onRemoteStream) {
          this.onRemoteStream({ peerId, stream: event.streams[0] });
        }
      }
    };

    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      debug(`[WebRTC] ICE state for ${peerId}: ${state}`);

      if (state === 'failed' || state === 'closed') {
        this.clearDisconnectTimer(peerId);
        this.closePeer(peerId);
      } else if (state === 'disconnected') {
        // Transient disconnects (mobile network handoff, brief Wi-Fi drop)
        // often recover on their own — give it a grace period instead of
        // tearing the connection down immediately.
        this.clearDisconnectTimer(peerId);
        const timer = setTimeout(() => {
          this.disconnectTimers.delete(peerId);
          const currentPc = this.peerConnections.get(peerId);
          if (currentPc === pc && currentPc.iceConnectionState === 'disconnected') {
            this.closePeer(peerId);
          }
        }, DISCONNECT_GRACE_MS);
        this.disconnectTimers.set(peerId, timer);
      } else if (state === 'connected' || state === 'completed') {
        this.clearDisconnectTimer(peerId);
      }
    };

    // Add the video transceiver as sendrecv unconditionally — even before a
    // local track exists (master with no PGM feed chosen yet, or a client
    // that hasn't started its camera). A trackless recvonly transceiver would
    // permanently lock this m-line to receive-only in the negotiated SDP, so
    // a later replaceTrack() (see setPgmStream) would silently never
    // transmit. sendrecv lets replaceTrack start sending later with no
    // renegotiation needed.
    const streamToSend = this.isMaster ? this.pgmStream : this.localStream;
    const localTrack = streamToSend?.getVideoTracks()[0] ?? null;
    const transceiver = localTrack
      ? pc.addTransceiver(localTrack, { direction: 'sendrecv', streams: streamToSend ? [streamToSend] : [] })
      : pc.addTransceiver('video', { direction: 'sendrecv' });
    this.senders.set(peerId, transceiver.sender);
    if (localTrack) {
      // Apply bandwidth constraints
      void this.applyBandwidthLimit(transceiver.sender, this.isMaster ? 500000 : 250000); // 500kbps master->client, 250kbps client->master
    }

    return pc;
  }

  public async updateBitrate(peerId: string, maxBitrateBps: number) {
    const sender = this.senders.get(peerId);
    if (sender) {
      await this.applyBandwidthLimit(sender, maxBitrateBps);
      debug(`[WebRTC] Updated bitrate limit for peer ${peerId} to ${maxBitrateBps} Bps`);
    } else {
      debug(`[WebRTC] No sender found for peer ${peerId} to update bitrate`);
    }
  }

  /** Apply bitrate limit to ALL connected senders (used by clients receiving remote bitrate commands). */
  public async updateBitrateAll(maxBitrateBps: number) {
    for (const [peerId, sender] of this.senders) {
      await this.applyBandwidthLimit(sender, maxBitrateBps);
      debug(`[WebRTC] Updated bitrate limit for peer ${peerId} to ${maxBitrateBps} Bps (all)`);
    }
  }

  private clearDisconnectTimer(peerId: string): void {
    const timer = this.disconnectTimers.get(peerId);
    if (timer) {
      clearTimeout(timer);
      this.disconnectTimers.delete(peerId);
    }
  }

  private async applyBandwidthLimit(sender: RTCRtpSender, maxBitrateBps: number) {
    try {
      const params = sender.getParameters();
      if (!params.encodings) {
        params.encodings = [{}];
      }
      params.encodings[0].maxBitrate = maxBitrateBps;
      params.encodings[0].networkPriority = 'low'; // Timecode takes priority
      // @ts-expect-error degradationPreference is valid but might not be in all TS DOM lib versions
      params.encodings[0].degradationPreference = 'maintain-framerate';
      await sender.setParameters(params);
    } catch (e) {
      console.warn('[WebRTC] Bandwidth limitation not fully supported', e);
    }
  }

  public closePeer(peerId: string) {
    const pc = this.peerConnections.get(peerId);
    if (pc) {
      pc.close();
      this.peerConnections.delete(peerId);
      this.senders.delete(peerId);
      this.iceCandidateQueues.delete(peerId);
      this.clearDisconnectTimer(peerId);
      if (this.onStreamClosed) {
        this.onStreamClosed(peerId);
      }
    }
  }

  public closeAll() {
    for (const [peerId, pc] of this.peerConnections.entries()) {
      pc.close();
      if (this.onStreamClosed) {
        this.onStreamClosed(peerId);
      }
    }
    this.peerConnections.clear();
    this.senders.clear();
    this.iceCandidateQueues.clear();
    this.disconnectTimers.forEach(timer => clearTimeout(timer));
    this.disconnectTimers.clear();
    this.stopLocalCamera();
    this.pgmStream = null;
  }
}

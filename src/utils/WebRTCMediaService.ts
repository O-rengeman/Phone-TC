import { debug } from './log';
import type { PeerSync, SyncMessage } from './PeerSync';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' }
];

export interface WebRTCStreamEvent {
  peerId: string;
  stream: MediaStream;
}

export class WebRTCMediaService {
  private peerConnections = new Map<string, RTCPeerConnection>();
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

    // Replace track on all existing connections
    for (const [peerId, pc] of this.peerConnections.entries()) {
      const sender = pc.getSenders().find(s => s.track?.kind === 'video');
      if (sender && newVideoTrack) {
        try {
          await sender.replaceTrack(newVideoTrack);
          debug(`[WebRTC] Replaced PGM track for peer ${peerId}`);
        } catch (err) {
          console.error(`[WebRTC] Failed to replace track for ${peerId}`, err);
        }
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
      }
    } else if (msg.type === 'webrtc-candidate' && msg.candidate) {
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate', err);
        }
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
          candidate: event.candidate,
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
      debug(`[WebRTC] ICE state for ${peerId}: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'closed') {
        this.closePeer(peerId);
      }
    };

    // Add local tracks (Client -> camera, Master -> PGM)
    const streamToSend = this.isMaster ? this.pgmStream : this.localStream;
    if (streamToSend) {
      streamToSend.getTracks().forEach(track => {
        const sender = pc.addTrack(track, streamToSend);
        // Apply bandwidth constraints
        void this.applyBandwidthLimit(sender, this.isMaster ? 500000 : 250000); // 500kbps master->client, 250kbps client->master
      });
    } else {
      // Add a recvonly transceiver if we don't have a stream yet but want to receive
      pc.addTransceiver('video', { direction: 'recvonly' });
    }

    return pc;
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
    this.stopLocalCamera();
    this.pgmStream = null;
  }
}

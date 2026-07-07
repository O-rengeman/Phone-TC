// Shared ICE server list for PeerJS (src/utils/PeerSync.ts) and the WebRTC
// video-monitoring peer connections (src/utils/WebRTCMediaService.ts).
//
// STUN alone lets two peers discover their public IP/port, but cannot
// traverse symmetric NAT (common on mobile carrier networks and CGNAT) or
// many restrictive corporate/hotel networks — in those cases the ICE
// handshake fails outright with no relay fallback, which is why P2P
// connections that work on a local network can fail entirely over the
// public internet. The TURN entries below (Open Relay Project's free,
// publicly documented demo credentials — see
// https://www.metered.ca/tools/openrelay/) relay traffic when a direct
// connection can't be established, at the cost of some added latency and a
// shared bandwidth quota. No account or deployment is required to use them.
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.relay.metered.ca:80' },
  {
    urls: 'turn:global.relay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:global.relay.metered.ca:80?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:global.relay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turns:global.relay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

import { PEER_ID_LENGTH } from './PeerSync';

type P2PRole = 'master' | 'client' | null;

export function hasCompletePeerId(peerId: string): boolean {
  return peerId.length === PEER_ID_LENGTH;
}

export function shouldActivateMediaService(p2pRole: P2PRole, targetId: string): boolean {
  return p2pRole === 'master' || (p2pRole === 'client' && hasCompletePeerId(targetId));
}

export function shouldStartClientCamera(p2pRole: P2PRole, targetId: string): boolean {
  return p2pRole === 'client' && hasCompletePeerId(targetId);
}

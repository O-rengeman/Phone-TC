import { t } from './i18n';
import type { Lang } from './i18n';

/**
 * p2pStatus.ts — translates the machine-oriented P2P status strings emitted by
 * PeerSync/useP2P into the operator's language at display time.
 *
 * The producers keep emitting stable English status text (tests and logic
 * match on it, e.g. `startsWith('CONNECTED')`); only the rendered label is
 * localized here. Telemetry-style statuses ('SYNCED (...)', 'OK (...)',
 * 'SKIP (...)') pass through unchanged — they carry numbers, not prose.
 */

export function formatP2pStatus(status: string, lang: Lang): string {
  const tr = (key: string, vars?: Record<string, string | number>) => t(key, lang, vars);

  let m = status.match(/^READY: ID (.+)$/);
  if (m) return tr('p2p.ready', { id: m[1] });

  m = status.match(/^CONNECTING TO (.+?)\.\.\.$/);
  if (m) return tr('p2p.connecting', { id: m[1] });

  m = status.match(/^CONNECTED TO CLIENT: (.+)$/);
  if (m) return tr('p2p.clientConnected', { id: m[1] });

  m = status.match(/^CONNECTED TO (.+)$/);
  if (m) return tr('p2p.connected', { id: m[1] });

  if (status === 'CONNECTION CLOSED') return tr('p2p.closed');
  if (status === 'RECONNECTING...') return tr('p2p.reconnecting');
  if (status === 'MASTER TIMEOUT') return tr('p2p.masterTimeout');
  if (status === 'PEER INIT FAILED') return tr('p2p.initFailed');
  if (status === 'P2P RESET') return tr('p2p.reset');
  if (status === 'P2P DISCONNECTED') return tr('p2p.disconnected');

  m = status.match(/^ERROR: (.+)$/);
  if (m) return tr('p2p.error', { detail: m[1] });

  return status;
}

import { createContext, useContext } from 'react';

/**
 * masterDriftContext.ts — the P2P client drift value, isolated from the main
 * LTC state context.
 *
 * Every heartbeat (~10Hz while a client is synced) writes a new drift value.
 * Keeping it in LTCStateContext forced every useLTC() consumer to reconcile
 * at heartbeat rate. Only the drift badges (VideoPlayer, DesktopShell) read
 * it, so this context's updates now re-render just those components.
 */
export const MasterDriftContext = createContext<number | null>(null);

export function useMasterDrift(): number | null {
  return useContext(MasterDriftContext);
}

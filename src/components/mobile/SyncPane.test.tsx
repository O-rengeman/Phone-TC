import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// The pane and ConnectionManager both read the whole app state through
// useLTC(). Mock the module once at its resolved path so both components see
// the same fake context.
const { ctx } = vi.hoisted(() => ({
  ctx: { value: {} },
}));

vi.mock('../../LTCSyncContext', () => ({
  useLTC: () => ctx.value,
}));

import { MobileSyncPane } from './SyncPane';
import { ConnectionManager } from '../../ConnectionManager';

const tr = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key} ${JSON.stringify(vars)}` : key;

function makeCtx(overrides: Record<string, unknown> = {}) {
  return {
    tr,
    lang: 'en' as const,
    isMobile: true,
    isRunning: false,
    syncMode: 'network' as const,
    setSyncMode: vi.fn(),
    p2pRole: null as 'master' | 'client' | null,
    syncStatus: null as { offset: number; latency: number } | null,
    driftStatus: null as { hasSync: boolean; msSinceSync: number; rejamRecommended: boolean } | null,
    manualTimecode: '00:00:00:00',
    setManualTimecode: vi.fn(),
    setupP2PMaster: vi.fn(),
    setupP2PClient: vi.fn(),
    resetP2P: vi.fn(),
    peerId: '',
    p2pSyncSource: 'manual' as const,
    setP2pSyncSource: vi.fn(),
    targetId: '',
    setTargetId: vi.fn(),
    joinSession: vi.fn(),
    p2pStatus: 'P2P DISCONNECTED',
    isP2PSetupPending: false,
    packetLossRate: 0,
    setPacketLossRate: vi.fn(),
    addToast: vi.fn(),
    ...overrides,
  };
}

describe('MobileSyncPane', () => {
  beforeEach(() => {
    ctx.value = makeCtx();
  });

  it('shows the METHOD view by default with all four sync modes', () => {
    render(<MobileSyncPane />);
    expect(screen.getByText('label.syncMethod')).toBeTruthy();
    for (const label of ['SYSTEM', 'NETWORK', 'P2P', 'mode.freerun']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
    // P2P view content must not be mounted on the method page.
    expect(screen.queryByText('btn.createMaster')).toBeNull();
  });

  it('disables the P2P mode button until a role exists, and everything while running', () => {
    render(<MobileSyncPane />);
    expect(screen.getByRole('button', { name: 'P2P' })).toHaveProperty('disabled', true);
  });

  it('disables mode buttons while running', () => {
    ctx.value = makeCtx({ isRunning: true, p2pRole: 'master' });
    render(<MobileSyncPane />);
    for (const label of ['SYSTEM', 'NETWORK', 'P2P', 'mode.freerun']) {
      expect(screen.getByRole('button', { name: label })).toHaveProperty('disabled', true);
    }
  });

  it('calls setSyncMode when a mode button is pressed', () => {
    const setSyncMode = vi.fn();
    ctx.value = makeCtx({ setSyncMode });
    render(<MobileSyncPane />);
    fireEvent.click(screen.getByRole('button', { name: 'SYSTEM' }));
    expect(setSyncMode).toHaveBeenCalledWith('system');
  });

  it('shows the network latency/offset detail and drift panel when synced', () => {
    ctx.value = makeCtx({
      syncMode: 'network',
      isRunning: true,
      syncStatus: { latency: 12.34, offset: -5.67 },
      driftStatus: { hasSync: true, msSinceSync: 60_000, rejamRecommended: true },
    });
    render(<MobileSyncPane />);
    expect(screen.getByText(/cm\.latencyOffset/)).toBeTruthy();
    expect(screen.getByText('drift.lastSync')).toBeTruthy();
    expect(screen.getByText(/drift\.rejam/)).toBeTruthy();
  });

  it('shows the START TIMECODE input only in freerun', () => {
    ctx.value = makeCtx({ syncMode: 'freerun' });
    render(<MobileSyncPane />);
    expect(screen.getByText('label.startTc')).toBeTruthy();
    expect(screen.getByPlaceholderText('HH:MM:SS:FF')).toBeTruthy();
  });

  it('switches to the P2P view and renders ConnectionManager there', () => {
    render(<MobileSyncPane />);
    fireEvent.click(screen.getByRole('tab', { name: 'label.p2p' }));
    // Role cards from the session page are now visible.
    expect(screen.getByText('btn.createMaster')).toBeTruthy();
    expect(screen.getByText('btn.joinClient')).toBeTruthy();
    // Method view is gone.
    expect(screen.queryByText('label.syncMethod')).toBeNull();
  });
});

describe('ConnectionManager (mobile)', () => {
  beforeEach(() => {
    ctx.value = makeCtx();
  });

  it('renders SESSION / TURN / PEER sub-tabs instead of <details>', () => {
    const { container } = render(<ConnectionManager />);
    expect(container.querySelector('.cm-mobile-subtabs')).toBeTruthy();
    expect(container.querySelector('details')).toBeNull();
    expect(screen.getByRole('tab', { name: 'dt.session' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'sig.turnSection' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'sig.peerSection' })).toBeTruthy();
  });

  it('session page shows CREATE/JOIN cards when no role is set', () => {
    render(<ConnectionManager />);
    expect(screen.getByText('btn.createMaster')).toBeTruthy();
    expect(screen.getByText('btn.joinClient')).toBeTruthy();
  });

  it('fires setup handlers from the role cards', () => {
    const setupP2PMaster = vi.fn();
    const setupP2PClient = vi.fn();
    ctx.value = makeCtx({ setupP2PMaster, setupP2PClient });
    render(<ConnectionManager />);
    fireEvent.click(screen.getByText('btn.createMaster'));
    fireEvent.click(screen.getByText('btn.joinClient'));
    expect(setupP2PMaster).toHaveBeenCalled();
    expect(setupP2PClient).toHaveBeenCalled();
  });

  it('session page shows master invite, start source and manual TC when master', () => {
    ctx.value = makeCtx({ p2pRole: 'master', peerId: 'ABC123', p2pStatus: 'READY: ID ABC123' });
    render(<ConnectionManager />);
    expect(screen.getByText('MASTER')).toBeTruthy();
    expect(screen.getByText(/ID: ABC123/)).toBeTruthy();
    expect(screen.getByText('p2p.copyLink')).toBeTruthy();
    expect(screen.getByText('p2p.startSource')).toBeTruthy();
    expect(screen.getByText('p2p.startTc')).toBeTruthy();
    expect(screen.getByText('btn.reset')).toBeTruthy();
  });

  it('session page shows the join form when client', () => {
    ctx.value = makeCtx({ p2pRole: 'client' });
    render(<ConnectionManager />);
    expect(screen.getByPlaceholderText('p2p.enterMasterId')).toBeTruthy();
    expect(screen.getByText('p2p.link')).toBeTruthy();
  });

  it('TURN page shows TURN fields plus SAVE/RESET actions', () => {
    render(<ConnectionManager />);
    fireEvent.click(screen.getByRole('tab', { name: 'sig.turnSection' }));
    expect(screen.getByLabelText('sig.turnUrls')).toBeTruthy();
    expect(screen.getByLabelText('sig.turnUsername')).toBeTruthy();
    expect(screen.getByLabelText('sig.turnCredential')).toBeTruthy();
    expect(screen.getByText('sig.save')).toBeTruthy();
    expect(screen.getByText('sig.reset')).toBeTruthy();
    // Peer fields belong to the other page.
    expect(screen.queryByLabelText('sig.peerHost')).toBeNull();
  });

  it('PEER page shows PeerServer fields plus SAVE/RESET actions', () => {
    render(<ConnectionManager />);
    fireEvent.click(screen.getByRole('tab', { name: 'sig.peerSection' }));
    expect(screen.getByLabelText('sig.peerHost')).toBeTruthy();
    expect(screen.getByLabelText('sig.peerPort')).toBeTruthy();
    expect(screen.getByLabelText('sig.peerPath')).toBeTruthy();
    expect(screen.getByLabelText('sig.peerKey')).toBeTruthy();
    expect(screen.getByText('sig.save')).toBeTruthy();
    expect(screen.getByText('sig.reset')).toBeTruthy();
    expect(screen.queryByLabelText('sig.turnUrls')).toBeNull();
  });

  it('keeps one sigForm across TURN and PEER pages', () => {
    render(<ConnectionManager />);
    fireEvent.click(screen.getByRole('tab', { name: 'sig.turnSection' }));
    fireEvent.change(screen.getByLabelText('sig.turnUrls'), { target: { value: 'turn:x:3478' } });
    fireEvent.click(screen.getByRole('tab', { name: 'sig.peerSection' }));
    // Peer page has its own fields; switching back keeps the typed TURN value.
    fireEvent.click(screen.getByRole('tab', { name: 'sig.turnSection' }));
    expect(screen.getByLabelText('sig.turnUrls')).toHaveProperty('value', 'turn:x:3478');
  });
});

describe('ConnectionManager (desktop unchanged)', () => {
  it('keeps the <details> advanced disclosure and no sub-tabs when not mobile', () => {
    ctx.value = makeCtx({ isMobile: false });
    const { container } = render(<ConnectionManager />);
    expect(container.querySelector('details.sig-advanced')).toBeTruthy();
    expect(container.querySelector('.cm-mobile-subtabs')).toBeNull();
    expect(container.querySelector('.cm-v3')).toBeNull();
    // Session block and label still render inside the v2 section.
    expect(screen.getByText('label.p2p')).toBeTruthy();
    expect(screen.getByText('btn.createMaster')).toBeTruthy();
    expect(screen.getByText('sig.advanced')).toBeTruthy();
  });
});

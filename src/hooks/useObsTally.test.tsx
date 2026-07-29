import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import type { ObsSceneState, ObsStatus, ObsErrorCode } from '../utils/ObsWebSocket';

interface FakeClientOptions {
  url: string;
  password?: string;
  onStatus: (status: ObsStatus, error?: ObsErrorCode) => void;
  onSceneState: (state: ObsSceneState) => void;
}

/** Every client the hook builds, so a test can drive it like OBS would. */
const clients: Array<FakeClientOptions & { connected: boolean; disconnected: boolean }> = [];

vi.mock('../utils/ObsWebSocket', async () => {
  const actual = await vi.importActual<typeof import('../utils/ObsWebSocket')>('../utils/ObsWebSocket');
  return {
    ...actual,
    ObsWebSocketClient: class {
      private readonly entry: FakeClientOptions & { connected: boolean; disconnected: boolean };
      constructor(options: FakeClientOptions) {
        this.entry = { ...options, connected: false, disconnected: false };
        clients.push(this.entry);
      }
      connect() { this.entry.connected = true; }
      disconnect() { this.entry.disconnected = true; }
    },
  };
});

const { useObsTally } = await import('./useObsTally');

const SCENE_STATE: ObsSceneState = {
  scenes: ['CAM A', 'CAM B'],
  programScene: 'CAM A',
  previewScene: 'CAM B',
  studioMode: true,
};

function latest() {
  return clients[clients.length - 1];
}

/** Brings a rendered hook to a live, identified OBS link with scenes loaded. */
function goLive(state: ObsSceneState = SCENE_STATE) {
  act(() => {
    latest().onStatus('connected');
    latest().onSceneState(state);
  });
}

beforeEach(() => {
  clients.length = 0;
  localStorage.clear();
});

describe('connection lifecycle', () => {
  it('stays idle until the link is switched on', () => {
    const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a'] }));

    expect(clients).toHaveLength(0);
    expect(result.current.obsStatus).toBe('idle');
    expect(result.current.obsControlActive).toBe(false);
  });

  it('connects once enabled, and remembers that across mounts', () => {
    const { result, unmount } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a'] }));
    act(() => result.current.setObsEnabled(true));

    expect(latest().connected).toBe(true);
    expect(latest().url).toBe('ws://localhost:4455');

    unmount();
    const remounted = renderHook(() => useObsTally({ isHost: true, clientIds: ['a'] }));
    expect(remounted.result.current.obsEnabled).toBe(true);
  });

  it('never opens a socket on a device that is not hosting the session', () => {
    // Only the master broadcasts tally, so a client talking to OBS would be
    // a connection that can't do anything with what it learns.
    const { result } = renderHook(() => useObsTally({ isHost: false, clientIds: [] }));
    act(() => result.current.setObsEnabled(true));

    expect(clients).toHaveLength(0);
    expect(result.current.obsStatus).toBe('idle');
  });

  it('drops the connection when this device stops being the host', () => {
    const { result, rerender } = renderHook(
      ({ isHost }) => useObsTally({ isHost, clientIds: ['a'] }),
      { initialProps: { isHost: true } },
    );
    act(() => result.current.setObsEnabled(true));
    goLive();

    rerender({ isHost: false });

    expect(latest().disconnected).toBe(true);
    expect(result.current.obsControlActive).toBe(false);
    expect(result.current.obsStatus).toBe('idle');
  });

  it('reconnects when the URL changes', () => {
    const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a'] }));
    act(() => result.current.setObsEnabled(true));
    const first = latest();

    act(() => result.current.setObsUrl('192.168.1.50:4455'));

    expect(first.disconnected).toBe(true);
    expect(latest().url).toBe('ws://192.168.1.50:4455');
  });

  it('refuses a non-local ws:// target on an https page before opening anything', () => {
    // jsdom's window.location is not redefinable, so the page origin is faked
    // wholesale for this one case.
    vi.stubGlobal('location', { ...window.location, protocol: 'https:' });
    try {
      const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a'] }));
      act(() => result.current.setObsUrl('192.168.1.50:4455'));
      act(() => result.current.setObsEnabled(true));

      expect(clients).toHaveLength(0);
      expect(result.current.obsStatus).toBe('error');
      expect(result.current.obsError).toBe('mixedContent');
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('surfaces the reason a connection failed', () => {
    const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a'] }));
    act(() => result.current.setObsEnabled(true));
    act(() => latest().onStatus('error', 'authFailed'));

    expect(result.current.obsStatus).toBe('error');
    expect(result.current.obsError).toBe('authFailed');
    expect(result.current.obsControlActive).toBe(false);
  });
});

describe('scene mapping', () => {
  it('drives the buses from the mapped scenes once connected', () => {
    const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a', 'b'] }));
    act(() => result.current.setObsEnabled(true));
    goLive();
    act(() => result.current.autoAssignScenes());

    expect(result.current.obsMapping).toEqual({ 'CAM A': 'a', 'CAM B': 'b' });
    expect(result.current.obsAssignment).toEqual({ programId: 'a', previewId: 'b' });
    expect(result.current.obsControlActive).toBe(true);
  });

  it('follows a scene change', () => {
    const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a', 'b'] }));
    act(() => result.current.setObsEnabled(true));
    goLive();
    act(() => result.current.autoAssignScenes());

    act(() => latest().onSceneState({ ...SCENE_STATE, programScene: 'CAM B', previewScene: 'CAM A' }));

    expect(result.current.obsAssignment).toEqual({ programId: 'b', previewId: 'a' });
  });

  it('holds both buses empty while the link is still connecting', () => {
    const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a', 'b'] }));
    act(() => result.current.setObsEnabled(true));
    act(() => latest().onStatus('connecting'));

    expect(result.current.obsAssignment).toEqual({ programId: null, previewId: null });
  });

  it('assigns and clears a single scene, keeping a camera on one scene only', () => {
    const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a', 'b'] }));
    act(() => result.current.setObsEnabled(true));
    goLive();

    act(() => result.current.assignScene('CAM A', 'a'));
    act(() => result.current.assignScene('CAM B', 'a'));
    expect(result.current.obsMapping).toEqual({ 'CAM B': 'a' });

    act(() => result.current.assignScene('CAM B', null));
    expect(result.current.obsMapping).toEqual({});
  });

  it('persists the mapping across mounts', () => {
    const first = renderHook(() => useObsTally({ isHost: true, clientIds: ['a'] }));
    act(() => first.result.current.setObsEnabled(true));
    goLive();
    act(() => first.result.current.assignScene('CAM A', 'a'));
    first.unmount();

    const second = renderHook(() => useObsTally({ isHost: true, clientIds: ['a'] }));
    goLive();
    expect(second.result.current.obsMapping).toEqual({ 'CAM A': 'a' });
  });

  it('hides mappings for scenes OBS no longer reports', () => {
    const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a', 'b'] }));
    act(() => result.current.setObsEnabled(true));
    goLive();
    act(() => result.current.autoAssignScenes());

    act(() => latest().onSceneState({ ...SCENE_STATE, scenes: ['CAM A'], previewScene: null }));

    expect(result.current.obsMapping).toEqual({ 'CAM A': 'a' });
  });

  it('clears the whole mapping on request', () => {
    const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a', 'b'] }));
    act(() => result.current.setObsEnabled(true));
    goLive();
    act(() => result.current.autoAssignScenes());
    act(() => result.current.clearSceneMapping());

    expect(result.current.obsMapping).toEqual({});
    expect(result.current.obsAssignment).toEqual({ programId: null, previewId: null });
  });

  it('leaves every lamp dark when the live scene has no camera behind it', () => {
    const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a', 'b'] }));
    act(() => result.current.setObsEnabled(true));
    goLive({ ...SCENE_STATE, scenes: ['CAM A', 'CAM B', 'Titles'], programScene: 'Titles', previewScene: null });
    act(() => result.current.assignScene('CAM A', 'a'));

    expect(result.current.obsAssignment).toEqual({ programId: null, previewId: null });
  });

  it('recovers a mapping stored by an older or damaged session', () => {
    localStorage.setItem('ltc-obs-mapping', '{"CAM A":"a","bad":123}');
    const { result } = renderHook(() => useObsTally({ isHost: true, clientIds: ['a'] }));
    expect(result.current.obsMapping).toEqual({ 'CAM A': 'a' });

    localStorage.setItem('ltc-obs-mapping', 'not json');
    const broken = renderHook(() => useObsTally({ isHost: true, clientIds: ['a'] }));
    expect(broken.result.current.obsMapping).toEqual({});
  });
});

describe('credentials', () => {
  it('passes the password to the client and remembers it', () => {
    const { result, unmount } = renderHook(() => useObsTally({ isHost: true, clientIds: [] }));
    act(() => result.current.setObsPassword('hunter2'));
    act(() => result.current.setObsEnabled(true));

    expect(latest().password).toBe('hunter2');

    unmount();
    const remounted = renderHook(() => useObsTally({ isHost: true, clientIds: [] }));
    expect(remounted.result.current.obsPassword).toBe('hunter2');
  });
});

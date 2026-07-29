import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ObsWebSocketClient, EMPTY_OBS_SCENE_STATE } from './ObsWebSocket';
import type { ObsErrorCode, ObsSceneState, ObsStatus } from './ObsWebSocket';

/**
 * Stands in for the browser socket so the handshake can be driven step by
 * step. Only the four members the client touches are implemented.
 */
class FakeSocket {
  static last: FakeSocket | null = null;

  sent: Array<Record<string, unknown>> = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: { code?: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeSocket.last = this;
  }

  send(data: string) {
    this.sent.push(JSON.parse(data) as Record<string, unknown>);
  }

  close() {
    this.closed = true;
  }

  /** Delivers a server frame and lets the client's async handlers settle. */
  async deliver(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) } as MessageEvent);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  }

  lastSent(): Record<string, unknown> | undefined {
    return this.sent[this.sent.length - 1];
  }
}

const HELLO_NO_AUTH = { op: 0, d: { obsWebSocketVersion: '5.4.2', rpcVersion: 1 } };
const HELLO_WITH_AUTH = {
  op: 0,
  d: { rpcVersion: 1, authentication: { challenge: 'CHAL', salt: 'SALT' } },
};
const IDENTIFIED = { op: 2, d: { negotiatedRpcVersion: 1 } };

function sceneListResponse(requestId: string, overrides: Record<string, unknown> = {}) {
  return {
    op: 7,
    d: {
      requestType: 'GetSceneList',
      requestId,
      requestStatus: { result: true, code: 100 },
      responseData: {
        currentProgramSceneName: 'CAM A',
        currentPreviewSceneName: 'CAM B',
        // OBS returns scenes newest-first.
        scenes: [{ sceneName: 'CAM B' }, { sceneName: 'CAM A' }],
        ...overrides,
      },
    },
  };
}

function studioModeResponse(requestId: string, enabled = true) {
  return {
    op: 7,
    d: {
      requestType: 'GetStudioModeEnabled',
      requestId,
      requestStatus: { result: true, code: 100 },
      responseData: { studioModeEnabled: enabled },
    },
  };
}

interface Harness {
  client: ObsWebSocketClient;
  socket: FakeSocket;
  statuses: Array<[ObsStatus, ObsErrorCode | undefined]>;
  scenes: ObsSceneState[];
  lastScene: () => ObsSceneState;
}

function makeClient(password?: string): Harness {
  const statuses: Array<[ObsStatus, ObsErrorCode | undefined]> = [];
  const scenes: ObsSceneState[] = [];

  const client = new ObsWebSocketClient({
    url: 'ws://localhost:4455',
    password,
    onStatus: (status, error) => statuses.push([status, error]),
    onSceneState: state => scenes.push(state),
    createSocket: url => new FakeSocket(url) as unknown as WebSocket,
    // Deterministic stand-in for SHA-256 — the client's job is to nest the two
    // hashes in the right order, not to re-verify the browser's crypto.
    sha256Base64: input => Promise.resolve(`h(${input})`),
  });

  client.connect();
  return {
    client,
    socket: FakeSocket.last!,
    statuses,
    scenes,
    lastScene: () => scenes[scenes.length - 1] ?? EMPTY_OBS_SCENE_STATE,
  };
}

/** Runs a full handshake and the initial state fetch. */
async function connectAndIdentify(harness: Harness, studioMode = true) {
  await harness.socket.deliver(HELLO_NO_AUTH);
  await harness.socket.deliver(IDENTIFIED);

  const requests = harness.socket.sent.filter(msg => msg.op === 6);
  const sceneReq = requests.find(msg => (msg.d as { requestType: string }).requestType === 'GetSceneList');
  const studioReq = requests.find(msg => (msg.d as { requestType: string }).requestType === 'GetStudioModeEnabled');

  await harness.socket.deliver(sceneListResponse((sceneReq!.d as { requestId: string }).requestId));
  await harness.socket.deliver(studioModeResponse((studioReq!.d as { requestId: string }).requestId, studioMode));
}

beforeEach(() => {
  FakeSocket.last = null;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('handshake', () => {
  it('identifies without authentication when OBS asks for none', async () => {
    const harness = makeClient();
    await harness.socket.deliver(HELLO_NO_AUTH);

    const identify = harness.socket.lastSent();
    expect(identify?.op).toBe(1);
    expect((identify?.d as Record<string, unknown>).rpcVersion).toBe(1);
    expect((identify?.d as Record<string, unknown>).authentication).toBeUndefined();
  });

  it('answers the challenge as sha256(sha256(password + salt) + challenge)', async () => {
    const harness = makeClient('hunter2');
    await harness.socket.deliver(HELLO_WITH_AUTH);

    const identify = harness.socket.lastSent();
    expect((identify?.d as Record<string, unknown>).authentication).toBe('h(h(hunter2SALT)CHAL)');
  });

  it('reports authRequired instead of guessing when OBS wants a password and none is set', async () => {
    const harness = makeClient();
    await harness.socket.deliver(HELLO_WITH_AUTH);

    expect(harness.statuses.at(-1)).toEqual(['error', 'authRequired']);
    expect(harness.socket.sent.some(msg => msg.op === 1)).toBe(false);
  });

  it('reports connected and pulls the current scene state once identified', async () => {
    const harness = makeClient();
    await connectAndIdentify(harness);

    expect(harness.statuses.some(([status]) => status === 'connected')).toBe(true);
    expect(harness.lastScene()).toEqual({
      // Reversed out of OBS's newest-first order so the pane reads top-down.
      scenes: ['CAM A', 'CAM B'],
      programScene: 'CAM A',
      previewScene: 'CAM B',
      studioMode: true,
    });
  });
});

describe('events', () => {
  it('follows a program scene change', async () => {
    const harness = makeClient();
    await connectAndIdentify(harness);

    await harness.socket.deliver({
      op: 5,
      d: { eventType: 'CurrentProgramSceneChanged', eventData: { sceneName: 'CAM B' } },
    });

    expect(harness.lastScene().programScene).toBe('CAM B');
  });

  it('follows a preview scene change', async () => {
    const harness = makeClient();
    await connectAndIdentify(harness);

    await harness.socket.deliver({
      op: 5,
      d: { eventType: 'CurrentPreviewSceneChanged', eventData: { sceneName: 'CAM A' } },
    });

    expect(harness.lastScene().previewScene).toBe('CAM A');
  });

  it('clears the preview scene when studio mode is switched off', async () => {
    // Otherwise the last previewed camera keeps a green lamp with no bus behind it.
    const harness = makeClient();
    await connectAndIdentify(harness);

    await harness.socket.deliver({
      op: 5,
      d: { eventType: 'StudioModeStateChanged', eventData: { studioModeEnabled: false } },
    });

    expect(harness.lastScene()).toMatchObject({ studioMode: false, previewScene: null });
  });

  it('ignores events it has no use for', async () => {
    const harness = makeClient();
    await connectAndIdentify(harness);
    const before = harness.scenes.length;

    await harness.socket.deliver({ op: 5, d: { eventType: 'InputVolumeChanged', eventData: {} } });

    expect(harness.scenes).toHaveLength(before);
  });

  it('survives an undecodable frame', async () => {
    const harness = makeClient();
    await connectAndIdentify(harness);

    harness.socket.onmessage?.({ data: 'not json' } as MessageEvent);
    await Promise.resolve();

    expect(harness.statuses.at(-1)?.[0]).toBe('connected');
  });
});

describe('failure handling', () => {
  it('stops retrying after an authentication failure', async () => {
    const harness = makeClient('wrong');
    await harness.socket.deliver(HELLO_WITH_AUTH);

    harness.socket.onclose?.({ code: 4009 });
    expect(harness.statuses.at(-1)).toEqual(['error', 'authFailed']);

    const socketBefore = FakeSocket.last;
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.last).toBe(socketBefore);
  });

  it('reports an unsupported protocol version as terminal', async () => {
    const harness = makeClient();
    await harness.socket.deliver(HELLO_NO_AUTH);

    harness.socket.onclose?.({ code: 4011 });
    expect(harness.statuses.at(-1)).toEqual(['error', 'rpcVersion']);
  });

  it('reconnects after an ordinary drop', async () => {
    // OBS restarted mid-shoot is the normal case, and the console is usually
    // left unattended — it has to come back on its own.
    const harness = makeClient();
    await connectAndIdentify(harness);
    const socketBefore = FakeSocket.last;

    harness.socket.onclose?.({ code: 1006 });
    expect(harness.statuses.at(-1)?.[0]).toBe('connecting');

    vi.advanceTimersByTime(5000);
    expect(FakeSocket.last).not.toBe(socketBefore);
  });

  it('reports a socket that cannot even be constructed', () => {
    const statuses: Array<[ObsStatus, ObsErrorCode | undefined]> = [];
    const client = new ObsWebSocketClient({
      url: 'ws://localhost:4455',
      onStatus: (status, error) => statuses.push([status, error]),
      onSceneState: () => {},
      createSocket: () => { throw new Error('blocked'); },
    });

    client.connect();
    expect(statuses.at(-1)).toEqual(['error', 'refused']);
  });

  it('does not reconnect after disconnect()', async () => {
    const harness = makeClient();
    await connectAndIdentify(harness);

    harness.client.disconnect();
    expect(harness.socket.closed).toBe(true);
    expect(harness.statuses.at(-1)?.[0]).toBe('idle');

    const socketBefore = FakeSocket.last;
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.last).toBe(socketBefore);
  });

  it('leaves the scene state empty when the initial fetch never answers', async () => {
    const harness = makeClient();
    await harness.socket.deliver(HELLO_NO_AUTH);
    await harness.socket.deliver(IDENTIFIED);

    vi.advanceTimersByTime(10000);
    await Promise.resolve();

    expect(harness.scenes).toHaveLength(0);
    expect(harness.statuses.at(-1)?.[0]).toBe('connected');
  });

  it('keeps the last known scene state when OBS rejects a request', async () => {
    const harness = makeClient();
    await connectAndIdentify(harness);
    const before = harness.lastScene();

    await harness.socket.deliver({
      op: 5,
      d: { eventType: 'SceneListChanged', eventData: { scenes: [] } },
    });
    const refreshReq = harness.socket.sent
      .filter(msg => msg.op === 6)
      .at(-1) as { d: { requestId: string } };
    await harness.socket.deliver({
      op: 7,
      d: {
        requestType: 'GetSceneList',
        requestId: refreshReq.d.requestId,
        requestStatus: { result: false, code: 604, comment: 'nope' },
      },
    });

    expect(harness.lastScene()).toEqual(before);
  });

  it('re-reads the scene list when scenes are added or renamed in OBS', async () => {
    const harness = makeClient();
    await connectAndIdentify(harness);
    const requestsBefore = harness.socket.sent.filter(msg => msg.op === 6).length;

    await harness.socket.deliver({
      op: 5,
      d: { eventType: 'SceneCreated', eventData: { sceneName: 'CAM C' } },
    });

    expect(harness.socket.sent.filter(msg => msg.op === 6).length).toBeGreaterThan(requestsBefore);
  });

  it('abandons in-flight requests when the socket drops', async () => {
    const harness = makeClient();
    await harness.socket.deliver(HELLO_NO_AUTH);
    await harness.socket.deliver(IDENTIFIED);

    harness.socket.onclose?.({ code: 1006 });
    await Promise.resolve();

    // The pending GetSceneList must not resolve later against a dead socket.
    expect(harness.scenes).toHaveLength(0);
    expect(harness.statuses.at(-1)?.[0]).toBe('connecting');
  });

  it('ignores a response to a request it is no longer waiting on', async () => {
    const harness = makeClient();
    await connectAndIdentify(harness);
    const before = harness.scenes.length;

    await harness.socket.deliver(sceneListResponse('ltc-999'));

    expect(harness.scenes).toHaveLength(before);
  });
});

/**
 * ObsWebSocket.ts — minimal obs-websocket 5.x client, just enough to follow
 * OBS's program/preview scenes.
 *
 * Hand-rolled rather than pulling in `obs-websocket-js`: this app needs two
 * requests and four events, the official client ships a full RPC surface plus
 * an EventEmitter, and this bundle is loaded on phones over field networks.
 * The protocol's handshake is the only fiddly part and it is ~20 lines.
 *
 * Protocol (obs-websocket 5.x opcodes):
 *   0 Hello          server -> client, carries the auth challenge when a
 *                    password is set
 *   1 Identify       client -> server, answers the challenge and declares
 *                    which event categories we want
 *   2 Identified     server -> client, handshake complete
 *   5 Event          server -> client
 *   6 Request        client -> server
 *   7 RequestResponse server -> client
 *
 * Auth answer: base64(sha256(base64(sha256(password + salt)) + challenge)).
 */

import { computeBackoffDelay } from './backoff';
import { debug } from './log';

/** Event category bitmask from the obs-websocket protocol. */
const EVENT_SUB_GENERAL = 1 << 0;
const EVENT_SUB_SCENES = 1 << 2;
const EVENT_SUB_UI = 1 << 10;
const EVENT_SUBSCRIPTIONS = EVENT_SUB_GENERAL | EVENT_SUB_SCENES | EVENT_SUB_UI;

const RPC_VERSION = 1;
const REQUEST_TIMEOUT_MS = 5000;

export type ObsStatus = 'idle' | 'connecting' | 'connected' | 'error';

/**
 * Failure reasons are i18n keys rather than sentences: the console renders
 * them in the operator's language, and "wrong password" needs a different
 * remedy from "OBS isn't running" so they must stay distinguishable.
 */
export type ObsErrorCode =
  | 'refused'
  | 'authRequired'
  | 'authFailed'
  | 'rpcVersion'
  | 'mixedContent'
  | 'unknown';

export interface ObsSceneState {
  scenes: string[];
  programScene: string | null;
  previewScene: string | null;
  studioMode: boolean;
}

export const EMPTY_OBS_SCENE_STATE: ObsSceneState = {
  scenes: [],
  programScene: null,
  previewScene: null,
  studioMode: false,
};

export interface ObsWebSocketOptions {
  url: string;
  password?: string;
  onStatus: (status: ObsStatus, error?: ObsErrorCode) => void;
  onSceneState: (state: ObsSceneState) => void;
  /** Injectable for tests; defaults to the global WebSocket. */
  createSocket?: (url: string) => WebSocket;
  /** Injectable for tests; defaults to Web Crypto SHA-256. */
  sha256Base64?: (input: string) => Promise<string>;
}

interface PendingRequest {
  resolve: (data: Record<string, unknown>) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** OBS's payloads are untyped JSON; these keep a hostile message from becoming "[object Object]". */
function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Default hasher. Requires a secure context (https or localhost), as does OBS control anyway. */
export async function sha256Base64(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return bytesToBase64(new Uint8Array(digest));
}

/** obs-websocket close codes we can explain; anything else is reported as unknown. */
function errorForCloseCode(code: number): ObsErrorCode | null {
  if (code === 4009) return 'authFailed';
  if (code === 4008) return 'authRequired';
  if (code === 4011) return 'rpcVersion';
  return null;
}

/**
 * Connects, keeps the scene state current, and reconnects with backoff until
 * `disconnect()` is called. Authentication failures are terminal — retrying a
 * wrong password just locks the operator out of the real error — while every
 * other drop (OBS not started yet, OBS restarted mid-shoot) retries forever,
 * which is the behaviour you want when the console is left running on set.
 */
export class ObsWebSocketClient {
  private readonly options: ObsWebSocketOptions;
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempt = 0;
  private closedByUs = false;
  private requestSeq = 0;
  private pending = new Map<string, PendingRequest>();
  private state: ObsSceneState = { ...EMPTY_OBS_SCENE_STATE };

  constructor(options: ObsWebSocketOptions) {
    this.options = options;
  }

  connect(): void {
    this.closedByUs = false;
    this.openSocket();
  }

  disconnect(): void {
    this.closedByUs = true;
    this.clearReconnect();
    this.failPending(new Error('disconnected'));
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onopen = null;
      socket.onmessage = null;
      socket.onerror = null;
      socket.onclose = null;
      try { socket.close(); } catch { /* already closing */ }
    }
    this.state = { ...EMPTY_OBS_SCENE_STATE };
    this.options.onStatus('idle');
  }

  private openSocket(): void {
    this.clearReconnect();
    this.options.onStatus('connecting');

    const create = this.options.createSocket ?? ((url: string) => new WebSocket(url));
    let socket: WebSocket;
    try {
      socket = create(this.options.url);
    } catch (err) {
      debug('[OBS] socket construction failed', err);
      this.fail('refused');
      return;
    }

    this.socket = socket;
    socket.onmessage = event => { void this.handleMessage(event); };
    socket.onerror = () => { debug('[OBS] socket error'); };
    socket.onclose = event => this.handleClose(event);
  }

  private handleClose(event: { code?: number }): void {
    if (this.closedByUs) return;
    this.failPending(new Error('socket closed'));
    this.socket = null;

    const code = event?.code ?? 0;
    const terminal = errorForCloseCode(code);
    if (terminal) {
      // A bad password or an incompatible OBS will fail identically on every
      // retry, so surface it and stop rather than hiding it behind a loop.
      this.closedByUs = true;
      this.options.onStatus('error', terminal);
      return;
    }

    this.state = { ...EMPTY_OBS_SCENE_STATE };
    this.options.onStatus('connecting', 'refused');
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const delay = computeBackoffDelay(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.closedByUs) this.openSocket();
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private fail(error: ObsErrorCode): void {
    this.closedByUs = true;
    this.clearReconnect();
    this.options.onStatus('error', error);
  }

  private send(payload: unknown): void {
    try {
      this.socket?.send(JSON.stringify(payload));
    } catch (err) {
      debug('[OBS] send failed', err);
    }
  }

  private async handleMessage(event: MessageEvent): Promise<void> {
    let message: { op?: number; d?: Record<string, unknown> };
    try {
      message = JSON.parse(asString(event.data)) as { op?: number; d?: Record<string, unknown> };
    } catch {
      debug('[OBS] undecodable message');
      return;
    }

    const data = message.d ?? {};
    switch (message.op) {
      case 0:
        await this.handleHello(data);
        break;
      case 2:
        await this.handleIdentified();
        break;
      case 5:
        this.handleEvent(data);
        break;
      case 7:
        this.handleRequestResponse(data);
        break;
      default:
        break;
    }
  }

  private async handleHello(data: Record<string, unknown>): Promise<void> {
    const auth = data.authentication as { challenge?: string; salt?: string } | undefined;
    const identify: Record<string, unknown> = {
      rpcVersion: RPC_VERSION,
      eventSubscriptions: EVENT_SUBSCRIPTIONS,
    };

    if (auth?.challenge && auth?.salt) {
      const password = this.options.password ?? '';
      if (!password) {
        this.fail('authRequired');
        return;
      }
      const hash = this.options.sha256Base64 ?? sha256Base64;
      try {
        const secret = await hash(password + auth.salt);
        identify.authentication = await hash(secret + auth.challenge);
      } catch (err) {
        debug('[OBS] hashing failed', err);
        this.fail('unknown');
        return;
      }
    }

    this.send({ op: 1, d: identify });
  }

  private async handleIdentified(): Promise<void> {
    this.reconnectAttempt = 0;
    this.options.onStatus('connected');
    await this.refreshSceneState();
  }

  /**
   * Pulls the full picture once per (re)connect. Events afterwards carry only
   * what changed, so without this baseline a console attached to an
   * already-running OBS would show nothing until the operator happened to cut.
   */
  private async refreshSceneState(): Promise<void> {
    try {
      const [sceneList, studio] = await Promise.all([
        this.request('GetSceneList'),
        this.request('GetStudioModeEnabled'),
      ]);

      const scenes = Array.isArray(sceneList.scenes)
        ? (sceneList.scenes as Array<Record<string, unknown>>)
          .map(scene => asString(scene.sceneName))
          .filter(Boolean)
          // OBS lists scenes newest-first; the switcher reads top-down.
          .reverse()
        : [];

      this.updateState({
        scenes,
        programScene: asStringOrNull(sceneList.currentProgramSceneName),
        previewScene: asStringOrNull(sceneList.currentPreviewSceneName),
        studioMode: Boolean(studio.studioModeEnabled),
      });
    } catch (err) {
      debug('[OBS] scene refresh failed', err);
    }
  }

  private handleEvent(data: Record<string, unknown>): void {
    const eventType = asString(data.eventType);
    const eventData = (data.eventData ?? {}) as Record<string, unknown>;

    switch (eventType) {
      case 'CurrentProgramSceneChanged':
        this.updateState({ programScene: asStringOrNull(eventData.sceneName) });
        break;
      case 'CurrentPreviewSceneChanged':
        this.updateState({ previewScene: asStringOrNull(eventData.sceneName) });
        break;
      case 'StudioModeStateChanged': {
        const enabled = Boolean(eventData.studioModeEnabled);
        // Leaving studio mode retires the preview bus entirely; keeping the
        // last preview scene would leave a camera's lamp stuck on green.
        this.updateState({
          studioMode: enabled,
          previewScene: enabled ? this.state.previewScene : null,
        });
        if (enabled) void this.refreshSceneState();
        break;
      }
      case 'SceneListChanged':
      case 'SceneNameChanged':
      case 'SceneCreated':
      case 'SceneRemoved':
        void this.refreshSceneState();
        break;
      default:
        break;
    }
  }

  private handleRequestResponse(data: Record<string, unknown>): void {
    const requestId = asString(data.requestId);
    const pending = this.pending.get(requestId);
    if (!pending) return;

    this.pending.delete(requestId);
    clearTimeout(pending.timer);

    const status = (data.requestStatus ?? {}) as { result?: boolean; comment?: string };
    if (status.result === false) {
      pending.reject(new Error(status.comment ?? 'request failed'));
      return;
    }
    pending.resolve((data.responseData ?? {}) as Record<string, unknown>);
  }

  private request(requestType: string, requestData: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    this.requestSeq += 1;
    const requestId = `ltc-${this.requestSeq}`;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`${requestType} timed out`));
      }, REQUEST_TIMEOUT_MS);

      this.pending.set(requestId, { resolve, reject, timer });
      this.send({ op: 6, d: { requestType, requestId, requestData } });
    });
  }

  private failPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private updateState(patch: Partial<ObsSceneState>): void {
    this.state = { ...this.state, ...patch };
    this.options.onSceneState({ ...this.state });
  }
}

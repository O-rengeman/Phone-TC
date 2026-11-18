import { registerPlugin, Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { debug } from './log';

export interface TimecodeNativeBridgePlugin {
  /** バックグラウンド動作に必要なオーディオセッション・サービスの初期化と有効化 */
  startBackgroundMode(): Promise<void>;
  
  /** バックグラウンド動作の解除（オーディオセッションの非アクティブ化など） */
  stopBackgroundMode(): Promise<void>;
  
  /** 
   * 現在のタイムコードと再生状態をネイティブに伝達 
   * iOSのロック画面表示やAndroidの通知表示更新などに利用
   */
  updatePlaybackStatus(options: { isRunning: boolean; timecode: string }): Promise<void>;

  /** デバイスのトーチ（フラッシュライト）のON/OFFを切り替えます */
  setTorch(options: { on: boolean }): Promise<void>;
}

const isNative = Capacitor.isNativePlatform();

// Capacitor プラグインとしての登録を試みます
let nativePlugin: TimecodeNativeBridgePlugin | null = null;
if (isNative) {
  try {
    nativePlugin = registerPlugin<TimecodeNativeBridgePlugin>('TimecodeNativeBridge');
  } catch (e) {
    console.warn('TimecodeNativeBridge plugin not registered in native build.', e);
  }
}

/**
 * TimecodeNativeBridge - ブラウザ・ネイティブ両対応のブリッジラッパー
 * ネイティブ機能が実装されていない環境（ブラウザ動作時など）では、
 * コンソールログを出力するダミーとして安全に動作（フォールバック）します。
 */
export const TimecodeNativeBridge = {
  async startBackgroundMode(): Promise<void> {
    if (isNative && nativePlugin) {
      try {
        await nativePlugin.startBackgroundMode();
        debug('[NativeBridge] Native startBackgroundMode invoked.');
        return;
      } catch (err) {
        console.error('[NativeBridge] Failed to invoke native startBackgroundMode', err);
      }
    }
    debug('[NativeBridge] (Fallback) Background mode simulation started (Browser/Web).');
  },

  async stopBackgroundMode(): Promise<void> {
    if (isNative && nativePlugin) {
      try {
        await nativePlugin.stopBackgroundMode();
        debug('[NativeBridge] Native stopBackgroundMode invoked.');
        return;
      } catch (err) {
        console.error('[NativeBridge] Failed to invoke native stopBackgroundMode', err);
      }
    }
    debug('[NativeBridge] (Fallback) Background mode simulation stopped (Browser/Web).');
  },

  async updatePlaybackStatus(isRunning: boolean, timecode: string): Promise<void> {
    if (isNative && nativePlugin) {
      try {
        await nativePlugin.updatePlaybackStatus({ isRunning, timecode });
        return;
      } catch (err) {
        console.error('[NativeBridge] Failed to invoke native updatePlaybackStatus', err);
      }
    }
    // 開発中のログ過多を防ぐため、再生中はデバッグコンソールへの出力のみにします
    if (isRunning && Math.random() < 0.05) {
      debug(`[NativeBridge] (Fallback) Playback status updated. active: ${isRunning}, timecode: ${timecode}`);
    }
  },

  async setTorch(on: boolean): Promise<void> {
    if (isNative && nativePlugin) {
      // Capacitor v3/v4+ conventions
      const plugin = nativePlugin;
      if (typeof plugin.setTorch === 'function') {
        try {
          await plugin.setTorch({ on });
          return;
        } catch (err) {
          console.error('[NativeBridge] Failed to invoke native setTorch', err);
        }
      }
    }
    // Web environment: App.tsx will handle the browser torch API if Capacitor fails
    debug(`[NativeBridge] (Fallback) Torch set to ${on}`);
  },

  /**
   * iOS のオーディオセッション割り込み（着信など）を購読します。
   * ネイティブ側は割り込み終了時に自動でセッションを再アクティブ化しますが、
   * UI 警告のためにここで began/ended を通知します。ブラウザ環境では何もしません。
   *
   * Returns an unsubscribe function that removes BOTH native listeners —
   * callers must invoke it on cleanup, otherwise StrictMode double-mounts
   * and remounts stack duplicate listeners (double toasts, stale closures).
   */
  addInterruptionListener(callback: (state: 'began' | 'ended') => void): () => void {
    const noop = () => {};
    if (!isNative || !nativePlugin) return noop;

    const plugin = nativePlugin as unknown as
      | { addListener?: (event: string, handler: () => void) => Promise<PluginListenerHandle> }
      | null;
    if (!plugin || typeof plugin.addListener !== 'function') return noop;

    // Register each listener independently: if the second addListener throws
    // after the first succeeded, the first handle must still be tracked for
    // removal — a single shared try/catch used to leak it permanently.
    const subs: Promise<PluginListenerHandle>[] = [];
    for (const [event, state] of [['interruptionBegan', 'began'], ['interruptionEnded', 'ended']] as const) {
      try {
        subs.push(plugin.addListener(event, () => callback(state)));
      } catch (e) {
        debug(`Failed to register ${event} listener`, e);
      }
    }
    if (subs.length === 0) return noop;

    let disposed = false;
    return () => {
      if (disposed) return;
      disposed = true;
      // allSettled at both stages: one rejected addListener result or one
      // failed remove() must not skip the remaining removals.
      void Promise.allSettled(subs)
        .then((results) => Promise.allSettled(
          results.flatMap(r => (r.status === 'fulfilled' ? [r.value.remove()] : []))
        ))
        .then((removals) => {
          removals.forEach(r => {
            if (r.status === 'rejected') debug('Failed to remove interruption listener', r.reason);
          });
        });
    };
  }
};

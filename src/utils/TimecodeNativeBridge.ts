import { registerPlugin } from '@capacitor/core';

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

// Capacitor プラグインとしての登録を試みます
let nativePlugin: TimecodeNativeBridgePlugin | null = null;
try {
  nativePlugin = registerPlugin<TimecodeNativeBridgePlugin>('TimecodeNativeBridge');
} catch (e) {
  console.warn('TimecodeNativeBridge plugin not registered in native build.', e);
}

/**
 * TimecodeNativeBridge - ブラウザ・ネイティブ両対応のブリッジラッパー
 * ネイティブ機能が実装されていない環境（ブラウザ動作時など）では、
 * コンソールログを出力するダミーとして安全に動作（フォールバック）します。
 */
export const TimecodeNativeBridge = {
  async startBackgroundMode(): Promise<void> {
    if (nativePlugin) {
      try {
        await nativePlugin.startBackgroundMode();
        console.log('[NativeBridge] Native startBackgroundMode invoked.');
        return;
      } catch (err) {
        console.error('[NativeBridge] Failed to invoke native startBackgroundMode', err);
      }
    }
    console.log('[NativeBridge] (Fallback) Background mode simulation started (Browser/Web).');
  },

  async stopBackgroundMode(): Promise<void> {
    if (nativePlugin) {
      try {
        await nativePlugin.stopBackgroundMode();
        console.log('[NativeBridge] Native stopBackgroundMode invoked.');
        return;
      } catch (err) {
        console.error('[NativeBridge] Failed to invoke native stopBackgroundMode', err);
      }
    }
    console.log('[NativeBridge] (Fallback) Background mode simulation stopped (Browser/Web).');
  },

  async updatePlaybackStatus(isRunning: boolean, timecode: string): Promise<void> {
    if (nativePlugin) {
      try {
        await nativePlugin.updatePlaybackStatus({ isRunning, timecode });
        return;
      } catch (err) {
        console.error('[NativeBridge] Failed to invoke native updatePlaybackStatus', err);
      }
    }
    // 開発中のログ過多を防ぐため、再生中はデバッグコンソールへの出力のみにします
    if (isRunning && Math.random() < 0.05) {
      console.log(`[NativeBridge] (Fallback) Playback status updated. active: ${isRunning}, timecode: ${timecode}`);
    }
  },

  async setTorch(on: boolean): Promise<void> {
    if (nativePlugin) {
      // Capacitor v3/v4+ conventions
      const plugin = nativePlugin as unknown as TimecodeNativeBridgePlugin;
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
    console.log(`[NativeBridge] (Fallback) Torch set to ${on}`);
  },

  /**
   * iOS のオーディオセッション割り込み（着信など）を購読します。
   * ネイティブ側は割り込み終了時に自動でセッションを再アクティブ化しますが、
   * UI 警告のためにここで began/ended を通知します。ブラウザ環境では何もしません。
   */
  addInterruptionListener(callback: (state: 'began' | 'ended') => void): void {
    const plugin = nativePlugin as unknown as
      | { addListener?: (event: string, handler: () => void) => void }
      | null;
    if (plugin && typeof plugin.addListener === 'function') {
      plugin.addListener('interruptionBegan', () => callback('began'));
      plugin.addListener('interruptionEnded', () => callback('ended'));
    }
  }
};

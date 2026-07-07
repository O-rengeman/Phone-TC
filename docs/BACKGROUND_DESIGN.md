# バックグラウンド動作およびOSネイティブ連携設計書

プロフェッショナルな映像制作現場において「絶対に停止しない・ズレないタイムコード同期」を Capacitor ハイブリッドアプリ環境で実現するための、iOS/Android ネイティブ制御の設計ガイドラインです。

---

## 1. iOS におけるバックグラウンド設計

### A. リジェクト回避のための `audio` モード単一運用
* **罠 (Gotcha)**: `voip` バックグラウンドキーを `Info.plist` に指定すると、Appleは PushKit（VoIP通信の着信制御）の利用を強制し、それ以外の用途での使用は厳格にリジェクトします。
* **解決策**: **`audio` キーのみを採用**します。
  iOS の仕様上、オーディオセッションがアクティブ（常に有音のLTC信号のオーディオバッファを生成・出力している状態）であれば、OSはバックグラウンド移行時やスリープ時であっても該当プロセスをサスペンドしません。副次効果として、同一スレッド内で実行されている WebRTC の接続や JavaScript のタイマー処理もサスペンドされずに稼働し続けます。

### B. AVAudioSession の排他制御と通知音割り込み対策
* **罠 (Gotcha)**: `mixWithOthers` オプションを有効にすると、LINEやシステム通知などの効果音がタイムコード（LTC音声信号）にミックスされ、受信側機材の同期エラーを引き起こします。
* **解決策**:
  1. **完全排他制御**: `AVAudioSessionCategoryPlayback`（または `PlayAndRecord`）のみを設定し、他の音声を一切ミックスさせない仕様を徹底します。
  2. **割り込みハンドリング**: ネイティブ側（Swift）で `AVAudioSessionInterruptionNotification` をリッスンし、電話の着信などによるOSレベルの強制的なオーディオ中断が発生した際、アプリUI上で「同期割り込み発生」の警告を表示し、割り込み終了後に自動でLTC出力を即座に安全復帰させるロジックをネイティブブリッジに組み込みます。

---

## 2. Android におけるバックグラウンド設計

### A. Android 14 (API 34) フォアグラウンドサービス規格への適合
* **仕様**: Android 14以降では、フォアグラウンドサービス起動時にその「用途 (Type)」の宣言が必須となり、未宣言の場合はセキュリティ例外（Crash）を引き起こします。
* **解決策**:
  `AndroidManifest.xml` 内の `<service>` 定義に `android:foregroundServiceType="mediaPlayback"` を追記します。
  また、通知バー（Notification）には、再生制御（Start/Stop）や「現在のタイムコード」を常時描写するメディアスタイルコントローラーをネイティブ側で実装します。

### B. Wakelock / WifiLock の段階的アプローチによる Google Play 審査対策
* **リスク**: `WAKE_LOCK` によるCPU常時稼働制御は、Playストアの「バッテリー消費悪化」判定によるペナルティや審査リジェクトの引き金になり得ます。
* **解決策**:
  まずは Android 14 に準拠した `mediaPlayback` タイプのフォアグラウンドサービス単体で長時間のスリープ試験を行います。基本的にはこれのみでOSのオーディオ再生スレッド保護が適用されますが、Dozeモード突入時にWebRTCのハートビートが落ちる場合にのみ、段階的に `WifiLock` などの最小限のネットワーク維持ロックの導入を検討します。

---

## 3. Capacitor 独自プラグイン構成: `TimecodeNativeBridge`

汎用のバックグラウンドプラグインでは Web Audio API (JavaScript側) とネイティブのオーディオセッションのライフサイクル同期が取れず、スリープ移行時に出力が破綻します。
そのため、LTCエンジンのUIスイッチ（Start/Stop）に完全に連動する独自ブリッジプラグイン `TimecodeNativeBridgePlugin` を構築します。

### プラグインインターフェース定義 (TypeScript)
```typescript
export interface TimecodeNativeBridgePlugin {
  /** バックグラウンドモード（オーディオセッション・サービス）の有効化 */
  startBackgroundMode(): Promise<void>;
  
  /** バックグラウンドモードの無効化（セッション解放） */
  stopBackgroundMode(): Promise<void>;
  
  /** 現在のタイムコードと稼働状態をネイティブ側に通知（通知バーの更新など） */
  updatePlaybackStatus(options: { isRunning: boolean; timecode: string }): Promise<void>;
}
```

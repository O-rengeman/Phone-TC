# タリーランプ機能 設計ドキュメント

LTC Sync PRO にタリーランプ（本番/プレビュー表示灯）を追加するための設計。
方針: **P2P連動＋単体内包 / 手動制御＋LTC自動の両対応 / カメラ個別指定 / トーチLEDも点灯**。

---

## 1. 用語と状態モデル

タリー状態（4種）:

| 状態 | 意味 | 色 | ラベル |
|------|------|----|--------|
| `live` | 本番（PGM、オンエア中） | 赤 | LIVE |
| `preview` | 次カメラ（PVW） | 緑 | PVW |
| `standby` | 待機 | 橙（薄） | STBY |
| `off` | 消灯 | 黒 | （無地） |

色覚配慮のため**色＋ラベル＋形**で二重符号化（既存方針を踏襲）。

---

## 2. 役割と構成

- **master（ディレクター機）**: タリーを操作・配信。`clients` レジストリ（接続中のclient ID）を既に保持しているため、**カメラ個別指定**に流用。
- **client（カメラ横のスマホ）**: 受信したタリー状態で全画面点灯。
- **単体内包**: P2P未接続時は、自機の `isRunning`（LTC出力中）から自動的にタリーを決定（live/standby）。

---

## 3. トリガー（手動＋自動）

master に **MANUAL / AUTO** モードを用意:

- **MANUAL**: ディレクターが各カメラへ `live/preview/standby/off` を割当（本来のタリー）。
- **AUTO**: LTC出力中（`isRunning`）に連動。「LTC開始 → 指定カメラ（または全台）を `live`、停止で `standby`」。
- 既定は MANUAL。AUTO は補助。

---

## 4. 同期プロトコル（既存 PeerSync 拡張）

`SyncMessage.type` に `'tally'` を追加し、ペイロードを拡張:

```ts
// PeerSync.ts
export type TallyState = 'live' | 'preview' | 'standby' | 'off';
export interface TallyPayload {
  rev: number;                          // 単調増加。古い更新を無視するため
  all: TallyState;                      // 既定（個別指定が無いclient用）
  assignments: Record<string, TallyState>; // clientId -> 状態（個別指定）
}
// SyncMessage に追加: type 'tally' を許可し、 tally?: TallyPayload を持たせる
```

配信:
- master はタリー変更時に `broadcast({ type:'tally', tally })`。
- **heartbeat に現在の tally を同梱**（master→client は既に定期送信あり）。後から接続/再接続した client も追従。
- client は受信 `rev` が手元より新しい時のみ採用（順序逆転・重複に強い）。

client 側の状態解決（純関数・テスト対象）:

```
resolveTally({ assignments, all, rev }, myClientId, { autoMode, selfIsRunning, connected })
  → TallyState
  // 1) P2P接続あり: assignments[myClientId] ?? all
  // 2) 未接続: autoMode ? (selfIsRunning ? 'live' : 'standby') : 'off'
```

`src/utils/tally.ts` に切り出し、`tally.test.ts` で単体テスト（DriftMonitor / battery / i18n と同じ流儀）。

---

## 5. UI

### client（タリー表示）
- 全画面オーバーレイ（ビジュアルスレートのオーバーレイ実装を流用）。
  - `live`=赤 / `preview`=緑 / `standby`=橙(薄) / `off`=黒。中央に大きく LIVE / PVW / STBY。
  - 画面輝度ブースト＋スリープ抑止（既存のバックグラウンド/ウェイク制御と連携）。
  - タップで一時的にコントロールを表示、長押しで終了（誤操作防止は既存パターン踏襲）。

### master（タリー制御）
- SYNCエリアに「TALLY」セクション。
  - MANUAL/AUTO トグル。
  - **個別指定**: 接続中clientの一覧（`clients` レジストリ流用）に各 PGM/PVW/STBY/OFF ボタン。
  - 「ALL」一括ボタン（all を更新）。
  - AUTO時: 「LTCでLIVEにするカメラ」を選択（全台 or 個別）。

---

## 6. トーチLED（スマホ背面ライト）

タリー `live` の端末で背面LEDを点灯（任意の「トーチ使用」トグルで有効化）。

- **Web フォールバック**: `getUserMedia({video})` のビデオトラックに
  `applyConstraints({ advanced:[{ torch:true }] })`。一部 Android Chrome で動作。
- **ネイティブ（推奨・確実）**: `TimecodeNativeBridge` に `setTorch(on)` を追加。
  - iOS: `AVCaptureDevice.torchMode`。
  - Android: Camera2 `setTorchMode` / `CameraManager`。
- 点灯は `live` のときON、それ以外OFF。点滅は任意（録画開始の数秒だけパルス等）。
- バッテリー消費が大きいので既定OFF、明示トグルで有効化。

---

## 7. 堅牢性・エッジ

- **再接続追従**: heartbeat の tally 同梱＋client接続時に master がスナップショット送信。
- **遅延**: タリーはフレーム精度不要。WebRTCデータチャネルの数十ms遅延で十分。
- **master 落ち**: client は最後の状態を保持しつつ、一定時間 heartbeat 途絶で `standby`（または設定で `off`）へフェイルセーフ。
- **色覚/視認性**: 色＋ラベル、屋外向けに高輝度。
- **言語不変**: ラベル（LIVE/PVW/STBY）は i18n 化しても固定幅で扱う（既存ポリシー）。

---

## 8. 実装フェーズ（推奨順）

1. **状態モデル＋単体タリー**: `tally.ts`（`resolveTally` 純関数）＋ client全画面オーバーレイ＋AUTO(自機 isRunning 連動)。単体で動作。テスト追加。
2. **P2P連動**: `SyncMessage` 拡張、master broadcast＋heartbeat同梱、client解決、`rev` 制御。全台一斉。
3. **カメラ個別指定**: master のクライアント一覧UIに PGM/PVW/STBY/OFF 割当。
4. **トーチLED**: Webフォールバック → ネイティブ `setTorch` 実装（iOS/Android）。

各フェーズで `tsc` / ESLint / テスト / ビルドを通し、コミット＋changelog を残す（既存運用に合わせる）。

---

## 9. 影響範囲（想定ファイル）

- 新規: `src/utils/tally.ts`, `src/utils/tally.test.ts`
- 変更: `src/utils/PeerSync.ts`（型・配信）, `src/App.tsx`（master制御UI / client表示 / 解決ロジック配線）, `src/App.css`（タリー表示）, `src/utils/i18n.ts`（ラベル）
- ネイティブ（フェーズ4）: `src/utils/TimecodeNativeBridge.ts` ＋ iOS/Android 実装、権限（カメラ/トーチ）

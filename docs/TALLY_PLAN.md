# タリーランプ 実装プラン / 進捗トラッカー

> このファイルは「途中で中断しても再開できる」ための**永続的な作業計画＋進捗**です。
> 設計の詳細は [`TALLY_DESIGN.md`](./TALLY_DESIGN.md)。各ステップ完了ごとに本ファイルのチェックを更新してコミットします。

## 決定事項（ユーザー合意済み）
- 連動範囲: **P2P連動＋単体内包**（P2P未接続時は自機 `isRunning` から自動）
- トリガー: **手動制御＋AUTO（LTC出力連動）の両対応**
- カメラ個別指定: **必要**（client ID ごとに状態割当 / PGM・PVW 運用）
- トーチLED: **使う**（Webフォールバック→ネイティブ）

## 状態モデル
- `TallyState = 'live' | 'preview' | 'standby' | 'off'`（赤LIVE / 緑PVW / 橙STBY / 黒）
- 色＋ラベルで色覚配慮。

## 再開のしかた
1. このファイルの「進捗」で次の未完ステップ（⬜）を確認。
2. 直前に `git log --oneline` で最後の `feat(tally)` コミットを確認。
3. 該当フェーズの作業を続行 → tsc/eslint/test/build を通す → コミット → ここを ✅ に更新してコミット。
4. App.tsx 等の大きいファイルは編集時に末尾切断が起きることがあるため、`git cat-file -p HEAD:<path>` で復元して python による確定置換で再適用する運用。

---

## 進捗

### フェーズ0: 準備
- ✅ 設計ドキュメント `TALLY_DESIGN.md`
- ✅ 本プラン `TALLY_PLAN.md`（このファイル）

### フェーズ1: 状態ロジック＋単体タリー（P2Pなしで動く）
- ⬜ `src/utils/tally.ts`: 型 `TallyState`、`resolveTally(payload|null, myId, {connected, autoMode, selfIsRunning})`、`tallyColor(state)`/`tallyLabel(state)` ヘルパ
- ⬜ `src/utils/tally.test.ts`: resolve の各分岐（接続/未接続・auto・個別/all・rev）
- ⬜ `App.tsx`: state `tallyOn`(表示ON/OFF), `tallyMode`('manual'|'auto'), 自機タリーの算出
- ⬜ client全画面オーバーレイ（色/ラベル、高輝度、タップで操作表示・長押しで閉じる）
- ⬜ TOOLSかSYNCに「TALLY」入口（表示トグル＋MANUAL/AUTO）
- ⬜ i18n キー（tally.live/preview/standby/off, label等）
- ⬜ tsc / eslint / test / build 緑 → コミット `feat(tally): phase1 local tally + state logic`

### フェーズ2: P2P連動（全台一斉）
- ⬜ `PeerSync.ts`: `TallyState`/`TallyPayload` 型、`SyncMessage.type` に `'tally'`、`tally?` フィールド
- ⬜ master: タリー変更時 `broadcast({type:'tally', tally})`＋heartbeatに現在tally同梱、`rev` 単調増加
- ⬜ client: 受信tallyを `rev` 比較で採用、`resolveTally` に供給。master途絶でフェイルセーフ
- ⬜ tsc / eslint / test / build 緑 → コミット `feat(tally): phase2 P2P broadcast + heartbeat`

### フェーズ3: カメラ個別指定
- ⬜ master UI: 接続中client一覧（既存 `clients`）に PGM/PVW/STBY/OFF 割当＋「ALL」一括
- ⬜ AUTO時のLIVE対象選択（全台 or 個別）
- ⬜ tsc / eslint / test / build 緑 → コミット `feat(tally): phase3 per-camera assignment`

### フェーズ4: トーチLED
- ⬜ Webフォールバック: getUserMedia(video) + `applyConstraints({advanced:[{torch:true}]})`、`live`時ON
- ⬜ ネイティブ: `TimecodeNativeBridge.setTorch(on)`（iOS AVCaptureDevice / Android Camera2）＋権限
- ⬜ 「トーチ使用」トグル（既定OFF・電池消費注意）
- ⬜ tsc / eslint / build 緑 → コミット `feat(tally): phase4 torch LED`

### 仕上げ
- ⬜ changelog エントリ追加（各フェーズ or まとめ）＋ index 更新
- ⬜ `main` を `feat/enhancements` に ff

---

## メモ / 注意
- 言語不変ポリシー維持（タリーのラベルは固定幅扱い）。
- タリーはフレーム精度不要（WebRTC数十msでOK）。
- 既存の `clients: Record<id,{rtt,drift,lastSeen}>`、`peerId`、`broadcast()`、`messageHandlerRef` を流用。
- 現在地: **フェーズ1 着手前**。

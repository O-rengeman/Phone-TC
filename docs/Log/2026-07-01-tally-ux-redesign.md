# タリーランプ機能 ユーザー目線リデザイン実装ログ

**日時**: 2026-07-01  
**コミット**: `94841b8` feat: tally UX redesign

## 実装した変更

### Phase 1: ナビゲーション改善
- **P1-1**: ヘッダーに `TALLY` クイックボタンを追加（常時表示）
  - タリー状態の色をドットで表示（赤/緑/オレンジ/グレー）
  - ボタンクリックで直接全画面タリーをトグル
- **P1-2**: マスター（`isHost`）のみに `DIR` ボタンを追加
  - ヘッダーから1タップでディレクターパネルへ

### Phase 2: タリー画面リデザイン（カメラマン側）
- **P2-1**: 状態ラベルを `7.5vw` → `min(22vw, 20vh)` に大幅拡大
  - 日本語サブラベル追加（「本番中」「次点・確認中」「待機中」）
  - ON AIR / PREVIEW / READY / OFF の直感的な英語表記
- **P2-2**: 状態別アニメーション追加
  - `ON AIR`（赤）: 1.2秒の速いパルス
  - `PREVIEW`（緑）: 2秒のゆっくりした呼吸
  - `READY`（amber）: 3秒の穏やかなパルス
- **P2-3**: 「タップでコントロール表示」→ 画面下部の常時表示バーに変更
  - 明るさ（明/中/暗）・TORCH・CLOSE ボタンを常時表示
  - iOS SafeArea対応（`padding-bottom: env(safe-area-inset-bottom)`）
- **P2-4**: 接続状態バナーを画面上部に常時表示
  - `● CONNECTED TO DIRECTOR`（接続時）
  - `⚠ DISCONNECTED — STANDALONE MODE`（切断時、黄色警告）

### Phase 3: ディレクターパネル改善
- **P3-1**: カメラ名ラベル機能
  - `CAM1`, `CAM2` のデフォルト連番ラベル
  - インライン入力フィールドで編集可能
  - `localStorage` に保存（再接続後も引き継ぎ）
- **P3-2**: ボタンを縦1列大型ボタンに変更
  - `ON AIR` / `PREVIEW` / `OFF` の3択（READY/STANDBYは削除）
  - スマホ操作に適した大きなタッチターゲット
- **P3-3**: カード左端カラーバーで状態を強調（`::before` 疑似要素）
  - ON AIR = 赤、PREVIEW = 緑、STANDBY = オレンジ
- **P3-4**: 「ALL CAMERAS」エリアを大型・シンプルな3ボタンに
  - `ON AIR` / `PREVIEW` / `OFF` の一括制御
- **P3-5**: オフラインカメラを斜線パターン + 透明度で表示

### Phase 4: UIテーマ統一
- ディレクターパネルのフォントを `var(--font-main)` に変更
- 全ての配色を `var(--bg)`, `var(--panel)`, `var(--border)` 等のCSS変数に統一

### Phase 6（一部）: 運用支援
- **P6-2**: タリー操作ログ（最新10件）
  - `TC時刻`, `カメラ名`, `状態` をパネル右側に表示

## ビルド結果
```
✓ built in 237ms (TypeScriptエラーなし)
dist/assets/index-BTvaKuIb.css  41.94 kB
dist/assets/index-CvFMZeZY.js  373.98 kB
```

## 変更ファイル
- `src/App.tsx`: JSX構造の全面更新（タリーオーバーレイ・ディレクターパネル）
- `src/App.css`: タリー・ディレクター関連CSSの全面書き換え

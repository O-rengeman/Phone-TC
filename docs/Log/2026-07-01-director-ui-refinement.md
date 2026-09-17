# Director Tally Panel UI/UX Refinement

## 概要
ユーザーの要望に基づき、ディレクター用タリー操作パネル（Director Tally Switcher）のUIと機能ラベルの改善を行いました。

## 作業内容
### 1. UIの最適化（App.css）
全体のトーン（`.pro-theme`）と統一感を持たせるため、パネルのハードコーディングされていた配色をCSS変数に置き換えました。
- `background: #0b0b0f;` などのベタ塗りの色を、`var(--bg)`, `var(--panel)` に修正
- 境界線の色を `var(--border)` 等のテーマ変数に適用
- 文字色を `var(--text-bright)`, `var(--text-muted)` 等に統一

### 2. ボタン機能の直感的な名称への変更（App.tsx）
従来の放送用語ベースのボタンラベルを、より文字通りで一般的に分かりやすい用語に変更しました。
- `DIRECTOR TALLY SWITCHER` -> `DIRECTOR PANEL`
- `PGM (LIVE)` -> `ON AIR`
- `PVW (PREV)` -> `PREVIEW`
- `STANDBY` -> `READY`
- `ALL PGM` -> `ALL ON AIR`
- `ALL PVW` -> `ALL PREVIEW`
- `ALL STANDBY` -> `ALL READY`

### 3. ビルドテスト
修正後、`npm run build` を実行し、エラーなく正常にコンパイルおよびビルドが完了することを確認しました。

## 次のステップ
現在のコードは本番環境に向けてビルド可能な状態であり、ディレクターパネルは他のUIと完全に調和するようになりました。ユーザーによる実機テストで操作感の最終確認を行います。

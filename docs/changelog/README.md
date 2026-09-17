# 変更ログ (Changelog)

LTC Sync PRO の変更を「変更単位」ごとに Markdown で記録するログです。
各ファイルは 1 つの論理的な変更（機能追加・修正・基盤整備）に対応します。

## 命名規則

```
docs/changelog/YYYY-MM-DD-NN-<slug>.md
```

- `YYYY-MM-DD` … 変更日
- `NN` … 同日内の連番
- `<slug>` … 変更内容の短い識別子

各エントリの先頭にメタ情報（日付・種別・対象コミット・主な対象ファイル）を置き、
本文で「背景 / 変更内容 / 影響・検証」を記述します。

## エントリ一覧

### 2026-06-29 — コミット `2b0f55c`（`6f9193f` からの差分。34ファイル / +7150 / -5519）

| # | 種別 | 変更 | ファイル |
|---|------|------|---------|
| 01 | ✨ 追加 | [ドリフト/精度モニタリング (DriftMonitor)](./2026-06-29-01-drift-monitoring.md) | `src/utils/DriftMonitor.ts` ほか |
| 02 | 🛠 修正 | [切断していた App.tsx / App.css の復旧](./2026-06-29-02-app-recovery.md) | `src/App.tsx`, `src/App.css` |
| 03 | ✨ 追加 | [バックグラウンド動作用ネイティブブリッジ (iOS/Android)](./2026-06-29-03-background-native-bridge.md) | `ios/...`, `android/...` |
| 04 | ♻️ 変更 | [AudioWorklet ベースの LTC 生成エンジン](./2026-06-29-04-audioworklet-engine.md) | `src/audio/ltcWorkletSource.ts`, `src/utils/LtcEngine.ts` |
| 05 | ✨ 追加 | [EDL / ALE エクスポート](./2026-06-29-05-edl-ale-export.md) | `src/utils/export.ts` |
| 06 | ♻️ 変更 | [同期エンジン (TimeSync / PeerSync) 強化とテスト](./2026-06-29-06-sync-engine.md) | `src/utils/TimeSync.ts`, `src/utils/PeerSync.ts` |
| 07 | 🧱 基盤 | [CI・テスト・依存・Lint 整備](./2026-06-29-07-tooling-ci.md) | `.github/workflows/ci.yml`, `vitest.config.ts` ほか |
| 08 | ✨ 追加 | [UI改良（操作明確化 / TC視認性・録画中表示）](./2026-06-29-08-ui-usability.md) | `src/App.tsx`, `src/App.css` |
| 09 | ✨ 追加 | [現場目線のUX改善（誤停止防止/接続ガイド/MAIN集約）](./2026-06-29-09-ux-onset.md) | `src/App.tsx`, `src/App.css` |
| 10 | ✨ 追加 | [バッテリー残量/可動時間・マーカー打点フィードバック](./2026-06-29-10-battery-marker-feedback.md) | `src/utils/battery.ts` ほか |
| 11 | ✨ 追加 | [日本語化(i18n) と 色覚配慮(色＋文字/形)](./2026-06-29-11-i18n-colorblind.md) | `src/utils/i18n.ts` ほか |
| 12 | ♻️ 変更 | [PC(デスクトップ)UIのスペース効率改善](./2026-06-29-12-desktop-density.md) | `src/App.css`, `src/App.tsx` |
| 13 | ♻️ 変更 | [モバイルUIのスペース効率改善](./2026-06-29-13-mobile-density.md) | `src/App.css` |
| 14 | 🛠 修正 | [言語切替でレイアウトが変わらないように固定](./2026-06-29-14-lang-stable-layout.md) | `src/App.css` |
| 15 | ♻️ 変更 | [モバイル密度のさらなる改善＋言語不変の総仕上げ](./2026-06-29-15-mobile-density2-lang.md) | `src/App.css` |
| 16 | ♻️ 変更 | [上部バー(ヘッダー)の整理・スマート化](./2026-06-29-16-header-tidy.md) | `src/App.tsx`, `src/App.css` |
| 17 | ✨ 追加 | [任意TC開始(FREE)モード＋精度表示を実測値のみに](./2026-06-29-17-freerun-grounded-accuracy.md) | `src/App.tsx`, `src/utils/i18n.ts` ほか |
| 18 | 🛠 修正 | [停止=リセット/一時停止=保持 ＋ LTC監査(BPCビット)](./2026-06-29-18-stop-reset-ltc-audit.md) | `src/App.tsx`, `src/audio/ltcWorkletSource.ts` |
| 19 | 🛠 修正 | [長押し停止直後の開始誤発火を修正](./2026-06-29-19-holdstop-trailing-click.md) | `src/App.tsx` |

> 種別凡例: ✨ 追加 / ♻️ 変更 / 🛠 修正 / 🧱 基盤

# ✨ ドリフト / 精度モニタリング (DriftMonitor)

- **日付**: 2026-06-29
- **種別**: 機能追加
- **対象コミット**: `2b0f55c`
- **主な対象ファイル**:
  - 新規 `src/utils/DriftMonitor.ts`
  - 新規 `src/utils/DriftMonitor.test.ts`（テスト13件）
  - 変更 `src/App.tsx`（SYNCタブに精度パネルを追加・配線）
  - 変更 `src/App.css`（`.drift-panel` 系スタイル）

## 背景

スマホには専用タイムコード機材（Tentacle Sync E / Deity TC-1）のような高精度クリスタル(TCXO)が無く、必ずわずかにドリフト（時刻ズレ）する。市場調査の結果、スマホ製LTCアプリで最も信頼を失う点が「いつの間にかズレているのに気づけない」ことだった。多くの競合はこれを隠すが、本アプリは**正直に可視化**して差別化する。

## 変更内容

`DriftMonitor`（純ロジック・DOM非依存）を追加。

- NTP/ネットワーク再同期のたびに `addSync(offset, at)` を記録。
- 2サンプル以上で**実測ドリフトレート(ppm)**を算出（EMAで平滑化）。実測前は保守的に ±30ppm を仮定。
- 短すぎる間隔(<2s)や非現実的なレート(>1000ppm、NTP異常値)は除外。
- `getStatus(fps)` が以下を返す:
  - `msSinceSync`（最終同期からの経過）
  - `estimatedDriftMs` / `estimatedDriftFrames`（推定ズレ量）
  - `driftRatePpm` / `measured`（クロック誤差）
  - `confidence`（high / medium / low / none）
  - `rejamRecommended`（半フレーム超 または 1時間経過で true）
- `formatSyncAge(ms)` で `12s` / `3m` / `1h04m` 表記に整形。

UI: SYNCタブの `network` モード時、毎秒更新の精度パネルを表示。
ACCURACY バッジ（色分け）、最終同期、推定ズレ(ms/frames)、クロック誤差(ppm)、必要時に `⚠ RE-SYNC RECOMMENDED` を表示。`stopEngine()` でリセット。

## 影響・検証

- 既存挙動への破壊的変更なし（表示の追加と内部計測のみ）。
- `DriftMonitor.test.ts` 13件すべて合格。全体スイートも 71件合格。
- `tsc -b` / ESLint クリーン、Viteビルド成功。

## 今後の候補

- NTP同期精度の底上げ（複数サンプル+中央値）→ 推定ドリフトの実測精度向上。
- 外部LTC読み取り(jam-sync in) と組み合わせ、再同期を自動化。

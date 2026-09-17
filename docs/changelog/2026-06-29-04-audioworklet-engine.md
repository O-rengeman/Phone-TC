# ♻️ AudioWorklet ベースの LTC 生成エンジン

- **日付**: 2026-06-29
- **種別**: 変更（アーキテクチャ刷新／コミット時点のスナップショットを記録）
- **対象コミット**: `2b0f55c`
- **主な対象ファイル**:
  - 新規 `src/audio/ltcWorkletSource.ts`
  - 変更 `src/utils/LtcEngine.ts`, `src/utils/LtcEngine.test.ts`
  - 変更 `src/App.tsx`, `src/types.d.ts`

## 背景

旧構成は `ScriptProcessorNode`（非推奨・メインスレッド依存でグリッチが起きやすい）でLTC音声を生成していた。プロ用途の安定性のため、専用オーディオスレッドで動く **AudioWorklet** へ移行。

## 変更内容

- `src/audio/ltcWorkletSource.ts`: LTCの実サンプル（ビット列→音声波形）を生成する AudioWorklet のソースを追加。**出力される信号の単一の真実源（source of truth）**。
- `LtcEngine.ts`: 役割を**タイムコードの数学（math）専用**に整理。TC解析・ドリフト計算・レイテンシ補正値の算出を担当し、サンプル生成はWorkletへ委譲。NTSC有理数FPS（例: 29.97 = 30000/1001, 23.976 = 24000/1001）を厳密表現。
- `App.tsx`: エンジン起動を Worklet ノード接続へ刷新（`workletNodeRef` / `currentTcRef` など）。
- `types.d.ts`: Worklet 関連の型を追加。

## 影響・検証

- `LtcEngine.test.ts` を更新し 27件合格（全体71件合格）。
- メインスレッド負荷を低減し、UI描画と音声生成を分離。

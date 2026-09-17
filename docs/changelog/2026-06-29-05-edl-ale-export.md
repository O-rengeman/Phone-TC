# ✨ EDL / ALE エクスポート

- **日付**: 2026-06-29
- **種別**: 機能追加（コミット時点のスナップショットを記録）
- **対象コミット**: `2b0f55c`
- **主な対象ファイル**:
  - 新規 `src/utils/export.ts`
  - 新規 `src/utils/export.test.ts`（テスト8件）
  - 変更 `src/App.tsx`（TOOLSタブの EDL / ALE ボタンから呼び出し）

## 背景

現場で打ったマーカー（テイク）をポスプロへ橋渡しするため、編集ソフトが読める標準フォーマットでの書き出しが必要。

## 変更内容

- `buildEdl(markers, isDropFrame)`: マーカー配列から EDL テキストを生成。
- `buildAle(markers, fpsLabel)`: Avid Log Exchange (ALE) テキストを生成。
- `Marker` 型を `export.ts` に集約し、`App.tsx` から参照（型の一元化）。
- TOOLSタブの「LOGGED TAKES」から EDL / ALE をエクスポート（マーカー0件時は無効化）。

## 影響・検証

- `export.test.ts` 8件合格（全体71件合格）。
- 純関数のため副作用なし・テスト容易。

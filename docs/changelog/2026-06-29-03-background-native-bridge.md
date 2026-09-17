# ✨ バックグラウンド動作用ネイティブブリッジ (iOS / Android)

- **日付**: 2026-06-29
- **種別**: 機能追加（コミット時点のスナップショットを記録）
- **対象コミット**: `2b0f55c`
- **主な対象ファイル**:
  - 新規 `ios/App/App/TimecodeNativeBridge.swift` / `.m`
  - 新規 `android/.../TimecodeNativeBridgePlugin.java`
  - 新規 `android/.../TimecodeForegroundService.java`
  - 変更 `android/.../AndroidManifest.xml`, `MainActivity.java`
  - 変更 `ios/App/App/Info.plist`, `project.pbxproj`
  - 変更 `src/utils/TimecodeNativeBridge.ts`
  - 変更 `docs/BACKGROUND_DESIGN.md`

## 背景

無料系の競合LTCアプリの致命的な弱点は「アプリをバックグラウンドにすると信号が止まる」こと。プロ現場では**絶対に停止しない**ことが必須要件であり、ここが本アプリの主要な差別化点になる。設計指針は `docs/BACKGROUND_DESIGN.md` を参照。

## 変更内容

Capacitor 独自プラグイン `TimecodeNativeBridge` を導入し、Web Audio のライフサイクルとネイティブのオーディオセッションを同期。

- **iOS**: `AVAudioSession` を `Playback`/`PlayAndRecord` で**排他制御**（通知音などのミックス混入を防止）。`audio` バックグラウンドモード単独運用でサスペンドを回避。割り込み（着信等）を購読し、終了後に自動復帰。`Info.plist` に `NSMicrophoneUsageDescription` 等を追加。
- **Android**: `foregroundServiceType="mediaPlayback"` のフォアグラウンドサービス（`TimecodeForegroundService`）でOSのオーディオスレッド保護を利用。通知に再生状態/TCを表示。`AndroidManifest.xml` に必要権限・サービス宣言を追加。
- **TS側ラッパー** (`TimecodeNativeBridge.ts`): `startBackgroundMode` / `stopBackgroundMode` / `updatePlaybackStatus` / 割り込みリスナーを提供。ネイティブ未実装環境（ブラウザ）では安全にフォールバック。

## 影響・検証

- ブラウザ動作時はフォールバックで無害。ネイティブ挙動は実機での確認が必要。
- 既存のWeb側ロジックとは疎結合（ブリッジ越し）。

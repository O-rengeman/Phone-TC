# 2026-07-02 実装ログ (ハイアマチュア向け改善)

## 実装内容
事前に作成した `implementation_plan.md` に基づき、以下の4つの機能を実装しました。

1. **User BitsのHex入力制限**
   - ファイル: `src/App.tsx`
   - 変更点: `<input>` の `onChange` イベント内で `.replace(/[^0-9A-F]/g, '')` を用いて、16進数（0-9, A-F）以外の文字をフィルタリングする処理を追加しました。

2. **高フレームレート撮影時のガイド表示**
   - ファイル: `src/App.tsx`
   - 変更点: フレームレート設定UIの下に「59.94p 撮影時は 29.97 を、50p 撮影時は 25 を選択してください。」というガイドテキストを追加しました。

3. **スレートのビープ音の1フレーム長対応**
   - ファイル: `src/LTCSyncContext.tsx`
   - 変更点: `handleSlateClick` メソッド内で、固定値 `0.1` だったビープ音のデュレーションを `1 / FPS_OPTIONS[fpsIndex].value` を使って計算し、ビープ音が正確に1フレーム分鳴るように調整しました。

4. **出力オフセット（キャリブレーション）の追加**
   - ファイル: `src/App.tsx`, `src/LTCSyncContext.tsx`
   - 変更点: `LTCSyncContext` に `outputOffset` ステート（単位: フレーム）を追加し、`localStorage` (キー: `ltc-out-offset`) に保存・復元する処理を追加。
   - `startSequence` および P2Pクライアント時の `syncWithOffset`、`applySyncToWorklet` の計算処理で、`outputOffset` を加算して生成されるLTCの出力時間をシフトさせました。
   - P2Pマスターとしての機能に影響を与えないよう、他のデバイスへ送信するタイムコードからはオフセット分を減算する安全策 (`getUnshiftedTc`) を実装しました。

## テスト結果
- `npm run build` を実行し、TypeScriptの型エラーがないこと、およびViteによるビルドが正常に完了することを確認しました。
- 当初 `LtcEngine` の `settings` プロパティが `private` であることに起因するコンパイルエラーが発生しましたが、`LTCSyncContext.tsx` 側で参照可能な `FPS_OPTIONS` から直接フレームレート（ミリ秒）を計算する形に修正し、解決しました。

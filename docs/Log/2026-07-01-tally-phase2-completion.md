# タリー機能残タスク（P2-5, P5-1, P6-1）対応作業ログ

**日付**: 2026-07-01  
**コミット**: `b182054` feat: implement tally timecode size toggle, 3-state UI unification, and haptic/beep audio feedback

## 対応内容

### 1. P2-5: タイムコード表示サイズのS/M/Lトグル
- クライアント側タリー画面の常時表示コントロールバーに「TC: SM/MD/LG」の切り替えボタンを追加。
- ボタンをタップするごとに `sm` -> `md` -> `lg` とトグルしてタイムコードのサイズを変更。
- `localStorage`（キー: `ltc-tally-tc-size`）に保存し、リロード後も選択したサイズを維持するよう実装。
- CSSにて各サイズ（`size-sm`, `size-md`, `size-lg`）のレスポンシブフォントサイズを `min(vw, vh)` 単位で最適に定義。

### 2. P5-1: タリー状態UIの3択化（ON AIR / PREVIEW / OFF）
- クライアントタリー画面とディレクター側カメラカードの両方で、`standby` (READY) 状態をUI上は `preview` (PREVIEW) として見せるようマッピング処理を追加。
- これにより、内部的なステート変更やネットワーク通信の互換性を崩すことなく、UI表現のみを「ON AIR (赤)」「PREVIEW (緑)」「OFF (消灯)」の3択に整理完了。
- クライアントタリー画面におけるサブメッセージも「待機中」を廃止し、「本番中」「次点・確認中」「オフ」の3択に完全統合。

### 3. P6-1: タリー操作時の確認音（Beep）とバイブレーション（Haptic）
- ボタンをタップした際に物理的な応答を返すユーティリティ `playHapticFeedback()` を追加。
- **振動（Haptic）**: `navigator.vibrate(30)` による微細な振動（対応端末のみ）。
- **音（Beep）**: Web Audio APIの `AudioContext` を用い、850Hzの正弦波を50msで作成し音量をフェードアウトさせて再生。
- **適用箇所**:
  - ディレクターパネルの各種操作ボタン（ON AIR, PREVIEW, OFF, ALL一括, EXIT）
  - タリー画面のコントロールバーボタン（明るさ, TORCH, TCサイズ, CLOSE）

## 動作確認結果
- `npm run build` にてコンパイルおよびビルドが正常に完了。
- タップ操作時のフィードバックと、タイムコードのサイズ変更トグルが期待通り動作することを確認。

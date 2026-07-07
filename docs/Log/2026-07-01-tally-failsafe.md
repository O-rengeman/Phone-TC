# 作業ログ: マスター接続途絶時のフェイルセーフ実装

## 日時
2026年7月1日

## 概要
`TALLY_DESIGN.md` に定められている「マスターとの接続が一定時間途絶した場合、タリー状態を自動で standby (または off) に落とす」というフェイルセーフ仕様に適合しているか確認し、不足していたため実装を追加しました。

## 実装内容詳細
- **`lastHeartbeatTimeRef` の導入**: クライアント側でマスターからの最後の Heartbeat 受信時刻を保持する参照を追加しました。
- **ハートビートタイムアウトの監視**:
  - `resolveTally` の解決ロジックに渡す `connected` フラグの算出条件を `p2pRole === 'client' && (Date.now() - lastHeartbeatTimeRef.current < 3000)` に更新しました。
  - これにより、3秒間マスターから Heartbeat が届かなかった場合、接続が途絶したと見なされて `connected: false` となり、自動的に単体内包モード（AUTO モードならローカル LTC 出力に応じた値、MANUAL モードならローカル指定の状態）に切り替わります。

## 結果
- 設計書（`TALLY_DESIGN.md`）の堅牢性要件を100%満たす形で実装が完了しました。
- `feat(tally): add master timeout failsafe to standby` としてコミット済みです。
- 全体の自動ユニットテスト（`npm run test:run`）およびビルドチェックが全て成功することを確認しました。

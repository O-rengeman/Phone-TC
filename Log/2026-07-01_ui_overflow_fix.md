# UIはみ出し修正ログ (2026-07-01)

## 概要
ホーム画面において、特定の文字列やボタン内のテキストが長くなった際に、要素の枠をはみ出してしまう（オーバーフローする）問題を修正しました。

## 修正内容
`src/App.css` の以下のクラスに対して、テキストの切り詰め処理（三点リーダー `...` による省略）とオーバーフロー防止のスタイルを追加しました。

- `.info-label` （タイムコード下の FPS や UBIT などの情報ラベル）
- `.section-label` （コントロールセクションの見出し：FRAME RATE など）
- `.btn-pill` （FPS選択ボタンなど、コンパクトなグリッド内に配置されるボタン）
- `.vu-label` （VUメーターのラベル。新たにクラスを定義して追加）

**追加した主要なCSSプロパティ:**
```css
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
```

これにより、画面幅が狭いモバイル端末などでテキストが長くなった場合でも、要素を突き破ることなくきれいに省略記号で収まるようになります。

## 対象ファイル
- `src/App.css`

## Gitコミット
上記変更を `fix(ui): prevent text overflow on home screen elements` としてコミットしました。

# Ledra Code Graph — ネットワーク表示

## 開き方
1. GitHub Actions → **Ledra Full Code Explorer** を開く。
2. `docs/code-flow-observability-proposal` ブランチの実行を選択する。
3. 実行が成功したら、Artifacts の `ledra-code-flow-explorer` をダウンロードする。
4. ZIP 内の `code-flow-explorer.html` を Chrome で開く。外部 CDN 不要。

## 操作
- **全体**: 依存関係の多いファイルを最大 150 / 400 / 800 ノード表示。
- **選択中心**: 選択したファイルの近傍を最大2階層まで表示。
- **ドラッグ**: ノード移動 / 背景のパン。
- **ホイール**: 拡大縮小。
- **クリック**: 関連ファイル・呼び出し候補・外部操作候補を表示。GitHub の行番号へ移動。

## 正確性と限界
- **静的解析**であり、実行時に呼ばれたことを証明しない。
- import の依存と、import 済み関数の直接呼び出し候補を区別する。
- DB / Stripe / HTTP / Queue は正規表現で検出した**候補**で、宛先や更新内容の確定ではない。
- alias `@/` は `src/` に対応するが、他の TypeScript paths や動的解決は網羅しない。
- 表示ノード数の制限は描画負荷を下げるためで、解析対象の削減ではない。
- 参照ゼロを理由にコードを自動削除しない。Next.js ルート、cron、webhook、SQL、RLS は追加確認が必要。
- HTML にファイルパスと呼び出し候補が含まれるため、社外共有しないこと。

## 検証
CI は `node --check`、HTML生成、JSON構造、ネットワーク UI と埋め込み JavaScript の構文検証を行う。CI の実行成功を確認するまで、リポジトリ全体で動作確認済みとは扱わない。

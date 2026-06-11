# data/ — 分析データ置き場（コミットしない）

`daily-ops` / `weekly-ops` / `monthly-ops` / `analyze-performance` が参照する**エクスポートデータ**の置き場所です。
GSC/GA4 を MCP で直接接続している場合は不要。手元で CSV 等を渡したいときにここへ置きます。

## 想定ファイル（例）

| ファイル例 | 内容 |
| --- | --- |
| `gsc-queries-YYYYMMDD.csv` | Search Console: クエリ別 clicks/impressions/CTR/position |
| `gsc-pages-YYYYMMDD.csv` | Search Console: ページ別 |
| `ga4-overview-YYYYMMDD.csv` | GA4: セッション/エンゲージメント/CV など |
| `ga4-landing-YYYYMMDD.csv` | GA4: ランディングページ別 |
| `inquiries-YYYYMMDD.csv` | 問い合わせ集計（**個人情報は含めない/マスクする**） |

## 重要・取り扱い注意

- **このフォルダの中身は Git にコミットしない**（`.gitignore` 済み。README のみ追跡）。
- **個人情報（PII）を置かない**。問い合わせデータは氏名・メール等を除いた集計値のみにする。
- 機微データはローカル/安全な実行環境内に留める。共有が必要なら集計・匿名化してから。
- データが無いときは、各スキルは数値を捏造せず「データなし」として内部改善に切り替える。

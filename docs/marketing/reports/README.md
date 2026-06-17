# HP 運用レポート

Cowork の `daily-ops` / `weekly-ops` / `monthly-ops` が生成するレポートの置き場所です。
レポートは**事実（データ）と実施内容と次の打ち手**を簡潔にまとめます。推測は「仮説」と明記。

## 置き場所・命名

- 日次: `docs/marketing/reports/daily/YYYY-MM-DD.md`（例 `2026-06-10.md`）
- 週次: `docs/marketing/reports/weekly/YYYY-Www.md`（例 `2026-W24.md`、ISO 週番号）
- 月次: `docs/marketing/reports/monthly/YYYY-MM.md`（例 `2026-06.md`）

数値は GSC / GA4 / PostHog から取得（読み取り専用、`analyze-performance` 経由）か `docs/marketing/data/` のエクスポート。
出典・期間・比較対象を必ず明記。**データが無ければ「データなし」と書き、捏造しない。**

## 使う様式（テンプレート）

テンプレートは `docs/marketing/operation/templates/` に集約:

| レポート | 使う様式 |
| --- | --- |
| 日次 | `operation/templates/daily-report.md`（Daily SEO & CVR Report） |
| 週次 | `operation/templates/weekly-report.md`（Weekly KPI Growth Report） |
| 月次 | `operation/templates/monthly-report.md`（Monthly HP Growth Report） |
| 臨時 | `operation/templates/growth-report.md`（HPグロース運営レポート） |

> 様式を変えたいときは `operation/templates/` を編集すれば、全ルーチンの出力に反映されます。

## 月次レポートの補足

月次は KPI（当月 / 前月比 / 前年同月比）に加え、計画ドキュメントへのリンクを必ず含める:
- `docs/marketing/operation/content-calendar-YYYY-MM.md`（コンテンツカレンダー）
- `docs/marketing/operation/keyword-strategy-YYYY-MM.md`（キーワード戦略）
- `docs/marketing/operation/cvr-improvement-plan-YYYY-MM.md`（CVR改善計画）

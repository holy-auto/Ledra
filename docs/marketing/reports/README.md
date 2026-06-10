# HP 運用レポート

Cowork の `weekly-ops` / `monthly-ops` が生成するレポートの置き場所とテンプレートです。
レポートは**事実（データ）と実施内容と次の打ち手**を簡潔にまとめます。推測は「仮説」と明記。

## 置き場所・命名

- 週次: `docs/marketing/reports/weekly/YYYY-Www.md`（例 `2026-W24.md`、ISO 週番号）
- 月次: `docs/marketing/reports/monthly/YYYY-MM.md`（例 `2026-06.md`）

数値は GSC / GA4 / PostHog から取得（読み取り専用、`analyze-performance` 経由）。出典・期間・比較対象を必ず明記。

---

## 週次レポート テンプレ

```markdown
# 週次HPレポート YYYY-Www（MM/DD–MM/DD）

## サマリ
- GSC: clicks <値>（前週比 ±%）/ impressions <値> / CTR <%> / avg position <値>
- GA4: sessions <値> / engagement rate <%> / conversions <値> / CVR <%>
- ひとこと所感（1–2 行）

## 検索パフォーマンス（GSC）
- 伸びたクエリ/ページ: …
- 落ちたクエリ/ページ: …
- CTR 機会（高impression・低CTR）: …
- Striking distance（順位11–30）: …

## 行動・CV（GA4）
- 流入チャネルの動き: …
- 主要 LP の状況 / 離脱: …

## 今週実施した改善
- [seo] … (PR: …)
- [content] ブログ下書き … (PR: …, draft)
- [faq] … (PR: …)

## 来週の打ち手
- …（優先度付き）
```

---

## 月次レポート テンプレ

```markdown
# 月次HPレポート YYYY-MM

## KPI サマリ（当月 / 前月比 / 前年同月比）
| 指標 | 当月 | 前月比 | 前年同月比 |
| --- | --- | --- | --- |
| clicks (GSC) | | | |
| impressions (GSC) | | | |
| CTR | | | |
| avg position | | | |
| sessions (GA4) | | | |
| conversions | | | |
| CVR | | | |

## 先月の打ち手の効果
- <施策> → <結果（データ）/ 仮説の検証>

## 今月の重点
- …

## 計画（別ドキュメント）
- キーワード戦略: docs/marketing/plans/keyword-strategy.md
- 記事計画: docs/marketing/plans/article-calendar.md
- CVR 改善計画: docs/marketing/plans/cvr-improvement.md
- 新規 LP 候補: docs/marketing/plans/lp-candidates.md
```

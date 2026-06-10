---
name: monthly-ops
description: >
  Run the Ledra HP monthly operations routine (月次 / マンスリー). Use when the user asks to
  run the "毎月のHP運用", "月次KPIレポート", "月次の計画", or schedules a monthly HP task.
  Produces a monthly KPI analysis, keyword strategy, article plan, CVR-improvement plan,
  new landing-page candidates, and a monthly report — all as review-gated planning docs (PRs).
  These are PROPOSALS for humans to approve, not implementations.
---

Ledra の公開HPの**月次運用**ルーティン。**振り返り（KPI）と次月の計画**を作るのが主目的です。
出力は基本的に `docs/marketing/plans/` と `docs/marketing/reports/monthly/` への**ドキュメント PR（＝人が承認する提案）**。
`hp-ops` のガードレールに従う。LP やページの実装はここでは行わず、承認後に `publish-article`/`seo-maintenance` 等で別途実施。

## 月次タスク（この順で）

1. **月次 KPI 分析** — `analyze-performance` で当月 vs 前月 / 前年同月: clicks / impressions / CTR / 平均順位（GSC）、セッション / CV / CVR / 流入チャネル（GA4）、主要 LP・記事の貢献。
2. **キーワード戦略** — 当月データ＋業界文脈から、注力クエリ群（取りに行く / 守る / 捨てる）を整理。検索意図とページの対応表を更新。→ `docs/marketing/plans/keyword-strategy.md`。
3. **記事計画（編集カレンダー）** — 次月の記事テーマ・コレクション・対象読者・狙うクエリ・公開週を一覧化。→ `docs/marketing/plans/article-calendar.md`。
4. **CVR 改善計画** — GA4 のコンバージョン経路・離脱から、CTA / フォーム（`/contact`）/ 料金 / 導線の仮説と改善案を優先度付きで。→ `docs/marketing/plans/cvr-improvement.md`。計測は PostHog イベント（`cta_clicked`/`lead_submitted` 等, `src/lib/marketing/analytics.ts`）。
5. **新規 LP 候補** — 取りに行くセグメント/クエリに対する新しいランディングページの**候補と要件定義**（目的・対象・主要メッセージ・想定 URL・必要素材）。→ `docs/marketing/plans/lp-candidates.md`。**実装はしない**（承認後に別タスク）。
6. **月次レポート** — `docs/marketing/reports/monthly/YYYY-MM.md`（テンプレは `docs/marketing/reports/README.md`）。KPI サマリ・先月の打ち手の効果・今月の重点・上記計画へのリンク。

## 成果物（すべて提案＝レビュー前提）

| 出力 | 置き場所 |
| --- | --- |
| 月次レポート | `docs/marketing/reports/monthly/YYYY-MM.md` |
| キーワード戦略 | `docs/marketing/plans/keyword-strategy.md`（更新） |
| 記事計画 | `docs/marketing/plans/article-calendar.md`（更新） |
| CVR 改善計画 | `docs/marketing/plans/cvr-improvement.md`（更新） |
| 新規 LP 候補 | `docs/marketing/plans/lp-candidates.md`（更新） |

PR にまとめ（例 `cowork/monthly-YYYYMM`）、レビュー観点と「承認後の次アクション」を本文に明記。
plans 配下は**追記・改訂**運用（過去版を破壊しない。意思決定の経緯を残す）。テンプレ/様式は `docs/marketing/plans/README.md`。

## やってはいけないこと

- 計画段階で LP やページを実装する（承認前に作らない）。
- データ元への書き込み。出典・前提のない数値や断定。
- 過大な KPI 目標の独断設定（目標は提案として出し、人が決める）。

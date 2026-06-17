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
出力は `docs/marketing/reports/monthly/` と `docs/marketing/operation/` への**ドキュメント PR（＝人が承認する提案）**。
`hp-ops` のガードレールに従う。LP やページの実装はここでは行わず、承認後に `publish-article`/`seo-maintenance` 等で別途実施。

スケジュールタスク用プロンプト: `docs/marketing/operation/prompts/monthly.md`

## 月次タスク（この順で）

1. **月次 KPI 分析** — `analyze-performance` で当月 vs 前月 / 前年同月: clicks / impressions / CTR / 平均順位（GSC）、セッション / CV / CVR / 流入チャネル（GA4）、主要 LP・記事の貢献。
2. **月次レポート作成** — `docs/marketing/reports/monthly/YYYY-MM.md`（テンプレ: `docs/marketing/operation/templates/monthly-report.md`）。KPI サマリ・先月の打ち手の効果・今月の重点・関連計画へのリンク。
3. **コンテンツカレンダー** — 来月の記事テーマ・コレクション・対象読者・狙うクエリ・公開週を一覧化（10本）。→ `docs/marketing/operation/content-calendar-YYYY-MM.md`。
4. **キーワード戦略** — 当月データ＋業界文脈から、注力クエリ群（取りに行く / 守る / 捨てる）を整理。検索意図とページの対応表を更新。→ `docs/marketing/operation/keyword-strategy-YYYY-MM.md`。
5. **CVR 改善計画** — GA4 のコンバージョン経路・離脱から、CTA / フォーム（`/contact`）/ 料金 / 導線の仮説と改善案を優先度付きで。→ `docs/marketing/operation/cvr-improvement-plan-YYYY-MM.md`。計測は PostHog イベント（`cta_clicked`/`lead_submitted` 等, `src/lib/marketing/analytics.ts`）。
6. **改善ログ更新** — `docs/marketing/operation/improvement-log.md` に今月の改善を記録。
7. **PR 作成** — 上記を `cowork/monthly-YYYYMM` ブランチにまとめ PR。レビュー観点と「承認後の次アクション」を本文に明記。

## 自動実行してよい作業

- meta title / description改善
- CTA文言改善
- FAQの追加
- 内部リンク追加
- 改善ログ更新
- 計画ドキュメント作成（コンテンツカレンダー・キーワード戦略・CVR改善計画）

## 確認が必要な作業（実行せず、PR本文かレポートで人に依頼する）

- 本番公開（draft を外す / マージ）
- 価格変更
- 会社情報変更
- 実績数値追加
- 顧客情報掲載
- 写真公開
- 保証内容変更
- 法的断定表現
- ファイル削除
- mainへの直接push

## 成果物（すべて提案＝レビュー前提）

| 出力 | 置き場所 |
| --- | --- |
| 月次レポート | `docs/marketing/reports/monthly/YYYY-MM.md` |
| コンテンツカレンダー | `docs/marketing/operation/content-calendar-YYYY-MM.md` |
| キーワード戦略 | `docs/marketing/operation/keyword-strategy-YYYY-MM.md` |
| CVR 改善計画 | `docs/marketing/operation/cvr-improvement-plan-YYYY-MM.md` |
| 改善ログ | `docs/marketing/operation/improvement-log.md`（追記） |

PR 本文にレビュー観点と「承認後の次アクション」を必ず明記。各月のファイルは**新規作成**（過去月を上書きしない）。

## やってはいけないこと

- 計画段階で LP やページを実装する（承認前に作らない）。
- データ元への書き込み。出典・前提のない数値や断定。
- 過大な KPI 目標の独断設定（目標は提案として出し、人が決める）。
- 過去月の計画ファイルを上書き・削除する（経緯は残す）。
- `main` への直接 push。

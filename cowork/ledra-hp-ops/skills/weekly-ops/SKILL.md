---
name: weekly-ops
description: >
  Run the Ledra HP weekly operations routine (週次 / ウィークリー). Use when the user asks to
  run the "毎週のHP運用", "週次SEOレポート", "ウィークリーチェック", or schedules a weekly HP task.
  Analyzes Search Console + GA4, finds CTR and "striking distance" (rank 11–30) opportunities,
  drafts a blog post, adds FAQ entries, and writes a weekly report — each as review-gated PRs/drafts.
  Never publishes or merges; a human reviews.
---

Ledra の公開HPの**週次運用**ルーティン。データ（Search Console / GA4）起点で改善を回し、**週次レポート**にまとめます。
`hp-ops` のガードレールに従う。実装系は小さな PR、記事は `draft: true`、レポート/計画は docs への PR。公開・送信・マージはしない。

スケジュールタスク用プロンプト: `docs/marketing/operation/prompts/weekly.md`

## 週次タスク（この順で）

1. **Search Console 分析** — `analyze-performance` を使い、直近7日 vs 前週で clicks / impressions / CTR / 平均掲載順位、伸びた/落ちたクエリ・ページを把握。
2. **GA4 分析** — セッション / ユーザー / エンゲージメント / コンバージョン、流入元、ランディングページ別の動き。`analyze-performance` 参照。
3. **CTR 改善** — 表示回数が多いのに CTR が低いクエリ/ページを特定し、`title`/`description`/OGP を調整（→ 小さな PR）。
4. **順位 11〜30 位ページ改善（striking distance）** — あと一歩で1ページ目に入るクエリ/ページを GSC で抽出し、見出し・本文の充実・内部リンク・meta を強化（→ PR）。詳細は `analyze-performance/references/gsc-ga4-playbook.md`。
5. **ブログ下書き** — その週のデータ/業界ニュース（`saved_news`）から1本、`publish-article` でドラフト（`draft: true`）→ PR。
6. **FAQ 追加** — 検索クエリ・問い合わせ傾向から、不足している Q&A を `src/app/(marketing)/faq/page.tsx` の `FAQ_SECTIONS` に追加（→ PR）。`FAQJsonLd`（`src/components/marketing/JsonLd.tsx`）と整合を保つ。
7. **週次レポート** — `docs/marketing/reports/weekly/YYYY-Www.md` を作成（テンプレ: `docs/marketing/operation/templates/weekly-report.md`）。データ要約・実施した改善・来週の打ち手を記載 → PR。
8. **改善ログ更新** — `docs/marketing/operation/improvement-log.md` に今週の改善を記録（新しい日付を上に追記）。

## 自動実行してよい作業

- meta title / description改善
- h1/h2/h3整理
- 画像alt追加
- 内部リンク追加
- CTA文言改善
- FAQの軽微追加
- リンク切れ修正
- 表記ゆれ修正
- 誤字脱字修正
- OGP改善
- 構造化データの軽微追加
- ブログ下書き作成（draft: true）
- 既存記事のリライト
- 改善ログ更新

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

## 成果物（すべてレビュー前提）

| タスク | 成果物 |
| --- | --- |
| CTR / 順位11-30 改善 | `cowork/seo-YYYYMMDD-<対象>` の PR（meta/本文/内部リンク） |
| ブログ下書き | `cowork/blog-YYYYMMDD-<slug>` の PR（`draft: true`） |
| FAQ 追加 | `cowork/faq-YYYYMMDD` の PR |
| 週次レポート | `cowork/report-weekly-YYYY-Www` の PR（docs） |

関心事ごとに PR を分ける（レポートと実装変更を混ぜない）。各 PR は `npm run lint`/`build` が通る状態に。

## FAQ 追加の作法

- `FAQ_SECTIONS`（`{ heading, items: [{ question, answer }] }`）の該当セクションに追記。新カテゴリが必要なら heading を追加。
- 回答は事実ベース・簡潔・ブランドボイス準拠。料金/契約は実態と一致させる（憶測で書かない）。
- 構造化データ（FAQPage / `FAQJsonLd`）が page と同じソースから生成されているか確認し、矛盾を作らない。

## やってはいけないこと

- データ取得元（GSC/GA4/PostHog/Supabase）への書き込み（すべて読み取り専用）。
- 数値の捏造・出典なしの主張。レポートに推測を事実として書かない（推測は「仮説」と明記）。
- 1 PR に複数の関心事を詰め込む / 大規模リライト。
- `main` への直接 push。

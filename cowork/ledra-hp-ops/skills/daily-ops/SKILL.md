---
name: daily-ops
description: >
  Run the Ledra HP daily SEO & CVR maintenance routine (日次 / デイリー). Use when the user asks to
  run the "毎日のHP運用", "日次SEO対策", "Daily SEO & CVR Maintenance", "デイリーチェック", or schedules
  a daily HP task. Checks KPI data, finds small SEO/CVR wins, applies allow-listed improvements, runs
  lint/build, updates the improvement log, and writes a daily report — bundled into ONE small
  review-gated PR per day (skip if nothing actionable). Never publishes, sends, or merges.
---

Ledra のHPグロース自律運営エージェントとして、**毎日の小さな SEO/CVR 改善**を積み上げます。
作業前に必ず `hp-ops`（ガードレール / 触れる範囲）に従う。**小さく・1日1本の PR に集約**。公開・送信・マージはしない。
（Scheduled Task 用プロンプト: `docs/marketing/operation/prompts/daily.md`）

## 目的

毎日、小さな改善を積み上げて、検索流入・CTAクリック・問い合わせ率を改善する。

## 自動実行してよい作業（allow）

- meta title / description 改善
- h1/h2/h3 整理
- 画像 alt 追加
- 内部リンク追加
- CTA 文言改善
- FAQ の軽微追加（`src/app/(marketing)/faq/page.tsx` の `FAQ_SECTIONS`、`FAQJsonLd` と整合）
- リンク切れ修正
- 表記ゆれ修正・誤字脱字修正
- OGP 改善
- 構造化データの軽微追加（`src/components/marketing/JsonLd.tsx`）
- ブログ下書きの改善・既存記事の軽微リライト（意味を変えない範囲）
- 改善ログ更新

## 確認が必要な作業（実行しない → PR本文/レポートで人へ依頼）

- 本番公開（`draft` を外す / マージ）
- 価格変更・会社情報変更・保証内容変更
- 実績数値の追加・顧客情報の掲載・写真の公開
- 法的断定表現
- ファイル削除
- main への直接 push

## 毎日確認する KPI

`docs/marketing/data/` のエクスポート（GA4 / Search Console / 問い合わせ）か、接続済みなら `analyze-performance`（GSC/GA4 MCP）で確認:
表示回数 / クリック数 / CTR / 平均掲載順位 / ページ別PV / CTAクリック / 問い合わせ数 / CVR。
**データが無ければ捏造せず**、HP 内部の改善余地（meta/alt/内部リンク/CTA 等）で作業する。

## 実行手順

1. 最新データの有無を確認（`docs/marketing/data/` または GSC/GA4 接続）。
2. SEO 上の軽微な改善箇所を探す。
3. CVR 上の軽微な改善箇所を探す（CTA・導線。計測は PostHog `cta_clicked` / `src/lib/marketing/analytics.ts`）。
4. allow リストの改善を実施。**1日1本の PR に集約**（ブランチ `cowork/daily-YYYYMMDD`、差分は小さく）。
5. `npm run lint` と `npm run build` を実行（通る状態にする）。
6. `docs/marketing/operation/improvement-log.md` に記録（降順で追記、1改善1行）。
7. `docs/marketing/reports/daily/YYYY-MM-DD.md` を作成（テンプレ: `docs/marketing/operation/templates/daily-report.md`）。
8. PR を作成（自分でマージしない）。**改善が無ければ PR を作らず**、改善ログに1行だけ残す。

## PR 本文（要点）

- 変更点（種別・対象・Before→After）、検証（lint/build）、改善ログ更新、日次レポートへのリンク。
- 「確認が必要なもの」に該当する気づきがあれば、実行せずここに列挙して人へ。
- 末尾に「レビュー必須・マージは人」。

## やってはいけないこと

- 1 日で広範囲を書き換える / 意味を変える大改稿 / デザイン改修。
- ビジネスロジック・API・設定・依存・DB への変更（`hp-ops` deny リスト）。
- データの捏造、出典のない数値・実績の追加。

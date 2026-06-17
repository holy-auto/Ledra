---
name: seo-maintenance
description: >
  Audit and improve SEO for the Ledra marketing site and open a PR for review.
  Use when the user asks to "SEO を見て", "メタ情報/メタディスクリプションを直して",
  "OGP/og:image を整えて", "サイトマップを更新して", "構造化データ", "内部リンクを見て",
  "titleが弱い", or wants on-page SEO improvements to the HP. Produces a small, focused
  PR (metadata / sitemap / OG) plus an audit report. Never changes business logic or
  publishes; a human reviews and merges.
---

Ledra の公開HPの **オンページ SEO** を点検し、**小さな PR ＋点検レポート**にまとめるスキルです。
コンテンツの中身づくりは `publish-article`、表示/ビルドの健全性は `site-health-check` に任せる。

## 触ってよい範囲（SEO 作業時）

- `src/app/sitemap.ts`、`src/app/robots.ts`
- 各ページの `metadata` / `generateMetadata`（title・description・canonical・openGraph・alternates）
- `opengraph-image.tsx`（OG 画像生成）
- `src/lib/marketing/config.ts`（`siteConfig`：サイト名/URL/説明など。**ここを正にする**）

**やらないこと**: 上記以外のロジック改変、デザイン大改修、依存追加、文章の大量書き換え（コピーは `publish-article` 側）。

## 既知の改善候補（着手しやすい順）

1. **サイトマップに動的ページが無い**。`src/app/sitemap.ts` は静的ページのみで、`/news/<slug>`・`/blog/<slug>`・`/cases/<slug>`、`/features/*`、`/for-agents`・`/for-btob`・`/resources`・`/roi`・`/events` 等が抜けている。`listContent()`（`src/lib/marketing/content.ts`）で記事スラッグを集めて追加するのが効果大。
2. **メタディスクリプション/タイトルの最適化**。各ページの `metadata` を点検し、長さ・重複・キーワード・行動喚起を改善。`siteConfig` のデフォルトに頼り切っていないか。
3. **canonical / alternates**。`siteConfig.siteUrl` 基準で canonical が入っているか。i18n がある場合は alternates を整える。
4. **OGP**。`opengraph-image.tsx` と `ogTitle/ogSubtitle`/`ogImage` の指定。主要ページで OG が崩れていないか。
5. **構造化データ（JSON-LD）**。Organization / Article / BreadcrumbList / FAQPage などの付与余地。
6. **内部リンク**。記事 → 機能ページ、機能 → 料金/問い合わせ等の導線。リンク切れは `site-health-check` で検出。

## 手順

1. **点検範囲を決める**（全体 or 特定ページ）。`siteConfig` と `sitemap.ts` を起点に現状把握。
2. **チェックリストで監査**（`references/seo-checklist.md`）。所見を「重大/中/軽微」で整理。
3. **小さく直す**。1 PR = 1 関心事（例：サイトマップ拡充だけ、メタ改善だけ）。`siteConfig` の値を正として URL/社名のベタ書きを避ける。
4. **PR を作る**（ブランチ `cowork/seo-YYYYMMDD-<対象>`）。本文に「点検レポート（所見と対応/未対応）」「Before/After（title/description 等）」「レビュー観点」を記載。
5. **大きい変更は提案に留める**（実装せず PR/レポートで人へ）。構造化データの全面導入や URL 構造変更などは要相談。

## 検証（PR 前に必ず）

- `npm run lint` と `npm run build` が通ること（型・ビルドエラーを残さない）。
- `metadata` 変更後、対象ページのタイトル/説明/OG が意図どおりか（可能なら `npm run dev` で確認）。
- サイトマップ変更時は `listContent` の `draft` 除外と整合（`draft` 記事を sitemap に載せない）。

## やってはいけないこと

- ビジネスロジック/ API/ 認証/ 課金への変更。
- キーワード詰め込み・隠しテキスト・誤誘導（Google ガイドライン違反）。
- 1 PR で広範囲を一気に変える（レビュー困難・事故のもと）。

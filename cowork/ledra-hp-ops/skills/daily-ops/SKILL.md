---
name: daily-ops
description: >
  Run the Ledra HP daily operations routine (日次 / デイリー). Use when the user asks to
  run the "毎日のHP運用", "日次SEOルーティン", "デイリーチェック", or schedules a daily HP task.
  Does a light SEO check, small meta/alt/CTA improvements, minor copy rewrites, and updates the
  improvement log — bundled into ONE small review-gated PR per day (skip if nothing actionable).
  Never publishes or merges; a human reviews the PR.
---

Ledra の公開HPの**日次運用**ルーティン。**小さく・安全に・1日1つの PR にまとめる**のが原則です。
まず `hp-ops`（ガードレール / allow・deny リスト）に従う。公開・マージはしない。

## 本日のタスク（この順で）

1. **SEO 点検（軽量）** — `seo-maintenance` の観点で「直近の公開ページ＋トップ／主要LP」だけを軽くチェック。重い全体監査は週次に回す。明らかな欠落（title/description 欠け、canonical、OG）を拾う。
2. **meta 改善** — 弱い `title`/`description` を 1〜数ページ分だけ調整（`siteConfig` 基準、重複回避）。
3. **alt 追加** — 画像の `alt` 欠落・空 alt を補う（`next/image` の `alt`）。装飾画像は空 alt 維持。
4. **CTA 改善** — `CTABanner`/`CTAButton` の文言・配置や記事フロントマターの `ctaTitle/ctaPrimaryLabel` 等を 1 箇所だけ改善。計測は PostHog `cta_clicked`（`src/lib/marketing/analytics.ts`）。大きな A/B は計画（週次/月次）へ。
5. **軽微リライト** — 誤字・冗長・読みにくい一文の修正など**小さな**改稿のみ。意味を変える書き換えはしない（ブランドボイス `publish-article/references/brand-voice.md`）。
6. **改善ログ更新** — `docs/marketing/improvement-log.md` に本日の変更を 1 行ずつ追記（日付・対象・種別・要約・PR）。

## まとめ方（重要）

- 変更は **1 本の日次 PR** に集約: ブランチ `cowork/daily-YYYYMMDD`、タイトル `chore(marketing): 日次HP改善 YYYY-MM-DD`。
- **触ってよいのは少数ファイル・小さな差分だけ**（allow リスト内）。1 PR が大きくなりそうなら分割し、重い項目は週次/月次へ送る。
- **何もなければ PR を作らない**（「本日は対応なし」と改善ログに 1 行だけ残す or 報告のみ）。空 PR を作らない。
- すべて `npm run lint` / `npm run build` が通る状態にする。記事に触れた場合は `draft` の扱いを誤らない。

## PR 本文テンプレ

```
## 日次HP改善 YYYY-MM-DD
### 変更点
- [meta] <ページ>: <Before → After>
- [alt] <画像>: alt 追加
- [cta] <場所>: <Before → After>
- [rewrite] <ページ>: <要約>
### 検証
- lint ✅ / build ✅
### 改善ログ
- docs/marketing/improvement-log.md を更新
> レビュー必須・マージは人。
```

## やってはいけないこと

- 1 日で広範囲を書き換える / 意味を変える大改稿 / デザイン改修。
- ビジネスロジック・API・設定・依存への変更（`hp-ops` deny リスト）。
- 効果測定なしの思いつき変更を積み増す（迷ったら改善ログに「候補」として記録し、週次で検討）。

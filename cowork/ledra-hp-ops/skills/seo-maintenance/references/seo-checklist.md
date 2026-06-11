# SEO 点検チェックリスト

`siteConfig`（`src/lib/marketing/config.ts`）を「正」とし、URL・社名・説明はそこを参照しているか常に確認する。

## 1. クロール / インデックス基盤
- [ ] `robots.ts`：本番で公開ページが `allow`、プレビュー/管理系が適切に `disallow`。`sitemap` 参照あり。
- [ ] `sitemap.ts`：**動的ページ（news/blog/cases の各 slug、features/* など）を含む**。`draft: true` の記事は含めない。`lastModified` が妥当。
- [ ] 重複・孤立ページ（どこからもリンクされていない）が無いか。

## 2. ページ単位メタ（各 `metadata` / `generateMetadata`）
- [ ] `title`：全角30字前後目安、ページ固有、サイト名サフィックスの重複なし。
- [ ] `description`：80〜120字目安、要約＋行動喚起、ページ固有（使い回しを避ける）。
- [ ] `canonical`（`alternates.canonical`）が `siteConfig.siteUrl` 基準で正しい。
- [ ] 動的ページ（記事）で `generateMetadata` がフロントマター（title/excerpt/ogTitle/ogImage）を反映。

## 3. OGP / SNS カード
- [ ] `openGraph`（title/description/url/images/type）と `twitter` カードが入っている。
- [ ] `opengraph-image.tsx` が主要ページにあり、崩れていない。記事は `ogTitle/ogSubtitle/ogImage` 反映。
- [ ] 画像サイズ（1200×630 目安）、ファイルサイズが過大でない。

## 4. 構造化データ（JSON-LD）
- [ ] Organization（トップ）/ Article（記事）/ BreadcrumbList / FAQPage（FAQ）/ Product or Service。
- [ ] 実態と矛盾しない（虚偽のレビュー評価・実績を入れない）。

## 5. コンテンツ / 内部リンク
- [ ] 見出し階層（h1 は 1 つ、h2/h3 が論理的）。
- [ ] 記事 → 機能/料金/問い合わせ への内部リンク導線。
- [ ] アンカーテキストが具体的（「こちら」連発を避ける）。
- [ ] リンク切れ（→ `site-health-check` で機械検出）。

## 6. パフォーマンス / 技術（Lighthouse SEO カテゴリ）
- [ ] `.lighthouserc.json` の SEO スコア閾値（≥0.9）を割っていない。
- [ ] 画像に `alt`、適切な `next/image` 利用、フォント/CLS。
- [ ] 多言語がある場合は `hreflang`/`alternates.languages`。

## 報告フォーマット（PR 本文に貼る）
```
## SEO 点検レポート（<対象範囲> / <日付>）
### 所見
- [重大] <内容>（該当: <ファイル/URL>）
- [中]   <内容>
- [軽微] <内容>
### このPRでの対応
- <変更点。Before/After（title/description 等）>
### 未対応（要相談 / 別PR）
- <大きい変更・構造変更など>
```

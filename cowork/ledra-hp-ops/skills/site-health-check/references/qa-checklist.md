# 品質チェック手順・コマンド・レポート様式

## コマンド早見（package.json）

| 目的 | コマンド | 備考 |
| --- | --- | --- |
| Lint | `npm run lint` | ESLint |
| ビルド + 型チェック | `npm run build` | Next.js。型エラーもここで検出 |
| 単体テスト | `npm run test` | Vitest（`vitest run`） |
| 整形チェック | `npm run format:check` | Prettier |
| E2E（任意・重い） | `npm run test:e2e` | Playwright。公開前の最終確認時のみ |
| ローカル起動 | `npm run dev` | 表示確認・`draft` 記事プレビュー |
| 本番相当起動 | `npm run build && npm run start` | Lighthouse 計測用 |

> これらは**検証目的**で実行する。出力（特に失敗ログ）は要点を引用してレポートに残す。
> 失敗を回避するために設定や閾値を緩めない。

## リンクチェックの観点

- 内部: `src/lib/marketing/config.ts` の `marketingNav` / `footerNavGroups` のリンク先が実在するルートか。
- 記事内リンク: 相対パス・`/news/...` 等が正しいスラッグを指すか。
- 外部: 記事の出典 URL が生存しているか（4xx/5xx/タイムアウトを記録）。
- 画像: 参照パスが `public/` に存在するか。`alt` があるか。

## Lighthouse（`.lighthouserc.json`）

- preset: desktop、対象カテゴリ: performance / accessibility / best-practices / seo。
- 閾値（割ったら所見化）: performance ≥ 0.85（warn）, accessibility ≥ 0.90（**error**）, best-practices ≥ 0.90（warn）, seo ≥ 0.90（warn）。
- `@lhci/cli` がある場合: `npx lhci autorun`。無ければ Chrome の Lighthouse で主要ページを手動計測し数値を記録。
- accessibility はエラー扱い＝最優先で見る。

## 公開前チェック（記事1本のリリース時・軽量）

- [ ] 対象記事のフロントマターが規約どおり（`publish-article/references/content-conventions.md`）。
- [ ] 公開なら `draft` を外したか／まだなら `draft: true` のままか（意図と一致）。
- [ ] `npm run build` 成功（その記事を含めて）。
- [ ] 記事内リンク・画像・出典 URL が生きている。
- [ ] 一覧（/news 等）に正しく出る／日付順が妥当。

## レポート様式

```
## サイト健全性チェック（<範囲> / <日付>）
### サマリ
- Lint: ✅/❌   Build: ✅/❌   Test: ✅/❌   Lighthouse(主要): P../A../BP../SEO..
### 所見
- [重大] <内容>（該当・ログ抜粋）
- [中]   <内容>
- [軽微] <内容>
### このチェックでの対応
- <軽微修正の PR リンク（あれば）>
### 要対応（人へ / 別途）
- <ロジック・性能・デザイン等。Issue 化候補>
```

# コンテンツ規約（MDX / フロントマター）

ローダ実装は `src/lib/marketing/content.ts`。**ここに書く規約はその実装に厳密に合わせること**。
フロントマターは**自前の最小 YAML パーサ**で読まれる（`gray-matter` ではない）。普通の YAML 機能の多くは使えない。

## ファイルの置き場所と命名

- 置き場所: `src/content/news/`・`src/content/blog/`・`src/content/cases/`
- 命名: `YYYY-MM-DD-<英小文字スラッグ>.mdx`（例 `2026-06-10-parts-integrity.mdx`）
- 拡張子は `.mdx`（`.md` も可）
- **先頭が `_` や `.` のファイルは常に非公開**（テンプレ/下書き扱い）。`src/content/cases/_template.mdx` が雛形。
- `slug` はファイル名（拡張子なし）と一致させる。URL は `/news/<slug>` など。

## フロントマター（使えるフィールド）

`---` で囲む。`ContentFrontmatter` 型に対応：

| フィールド | 型 | 用途 / 必須度 |
| --- | --- | --- |
| `title` | string | 記事タイトル（必須） |
| `slug` | string | URL スラッグ（ファイル名と一致。実質必須） |
| `publishedAt` | string | 公開日 `YYYY-MM-DD`（一覧の並び順に使う。実質必須） |
| `excerpt` | string | 一覧/メタ説明用の要約（1〜2文。推奨） |
| `tags` | string[] | タグ。リスト記法（下記）。推奨 |
| `draft` | boolean | **記事ドラフトは必ず `true`**。本番では非表示になる |
| `author` | string | 署名（blog 推奨。例 `Ledra 編集部`） |
| `hero` | string | ヒーロー画像パス（`public/` 基準）。任意 |
| `ogImage` | string | OGP 画像パス。任意（無ければ自動 OG 画像） |
| `ogTitle` / `ogSubtitle` | string | SNS カード用の短いコピー。任意 |
| `company` / `industry` | string | **cases 専用**（顧客名・業種） |
| `ctaTitle` / `ctaSubtitle` | string | 記事末 CTA の上書き。任意 |
| `ctaPrimaryLabel` / `ctaPrimaryHref` | string | CTA ボタン（一次）。`Secondary` / `Tertiary` も同様。任意 |

未知のキーも保持されるが、**勝手な独自キーは増やさない**（既存記事に倣う）。

## 最小 YAML パーサの制約（重要・ハマりどころ）

パーサは `key: value` 行とリストだけを理解する。**以下を必ず守る**：

1. **ネスト不可**。`key:` の下に `subkey:` のような入れ子マップは書けない。
2. **リストはこの形だけ**：
   ```yaml
   tags:
     - お知らせ
     - 機能アップデート
   ```
   インラインの `tags: [a, b]` は**不可**。
3. **値の自動型変換に注意**。`true`/`false` は真偽値、数字は数値になる。
   - 文字列として残したい数値・真偽値（例タグ `"2026"`）は**クォートで囲む**。
4. **コロンを含む値**（日本語の「：」ではなく半角 `:`）や、先頭/末尾に空白・記号がある値は **`"..."` で囲む**。
   - 例: `title: "Ledra、新機能「装着インテグリティ」: 部品の真正性を証明"`
5. **空の値を書かない**（`excerpt:` だけの行は空リスト扱いになる）。値が無いキーは行ごと削除する。
6. 行頭が `#` の行はコメントとして無視される。

## `draft` の挙動（レビュー運用の要）

```ts
if (frontmatter.draft === true && process.env.NODE_ENV === "production") continue;
```

- `draft: true` の記事は**本番ビルドでのみ非表示**。
- Vercel の Preview デプロイも production ビルド扱い → **Preview でも表示されない**。
- レビュー時のプレビューは**ローカル `npm run dev`** が確実。
- 公開時は人がレビュー後に `draft: true` を削除（または `false`）してマージ。

## 本文（MDX ボディ）

- 先頭は `## 見出し` から。**`# H1` は書かない**（タイトルはフロントマターが描画）。
- 記法は **Markdown（GFM）**：`##`/`###`、`**強調**`、`- 箇条書き`、表、引用 `>`、リンク `[文字](url)`。
- 生 HTML / JSX / 独自コンポーネントは使わない（既存記事に同等表現があるときのみ、それに倣う）。
- 画像は `public/` に最適化済みを置き、Markdown 画像記法 or `hero`/`ogImage` で参照。
- 既存記事（`src/content/news/2026-06-05-parts-integrity.mdx` 等）を**実例として必ず開いて倣う**。

## 最小テンプレ（news）

```mdx
---
title: "<タイトル>"
slug: 2026-06-10-<slug>
publishedAt: 2026-06-10
draft: true
excerpt: "<一覧/メタ用の1〜2文>"
tags:
  - お知らせ
---

## <導入の見出し>

<本文…>
```

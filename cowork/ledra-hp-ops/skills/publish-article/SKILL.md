---
name: publish-article
description: >
  Draft a Ledra marketing article (news / blog / case study) as an MDX file and
  open a Pull Request for human review. Use when the user asks to "ニュースを書いて",
  "お知らせを出して", "ブログ記事を作って", "新機能を告知して", "事例記事にして",
  "プレスリリースを記事化して", or wants to publish industry-news-based content to the
  Ledra HP. Produces a `draft: true` MDX file under src/content/ on a new branch + PR.
  Never publishes directly: a human reviews the PR and flips the draft flag to publish.
---

Ledra の公開HP向けに、ニュース/ブログ/事例の**記事ドラフト**を MDX で作り、**PR まで**用意するスキルです。
**公開はしません**（`draft: true` で出し、人がレビューで公開判断）。

## コレクションの選び方

| コレクション | 置き場所 | 用途 |
| --- | --- | --- |
| `news` | `src/content/news/` | お知らせ・プレスリリース・機能アップデート・業界ニュースの解説 |
| `blog` | `src/content/blog/` | 技術/業界の読み物・ノウハウ・思想（署名記事） |
| `cases` | `src/content/cases/` | 導入事例（顧客名・業種・成果）。`docs/marketing/case-study-guide.md` に沿う |

迷ったら news。技術・読み物寄りなら blog。

## 手順

1. **意図を確認する**
   - 何の記事か（テーマ / コレクション / 想定読者 = 施工店・保険会社・代理店のどれか）。
   - 素材があるか（プレスリリース、`docs/marketing/`、`saved_news` の業界ニュース、URL）。素材集めは `references/source-from-news.md`。

2. **下調べ・出典確保**
   - 業界ニュース起点なら Supabase（読み取り専用）の `saved_news` か、提示された URL を一次ソースとして確認。
   - 数値・主張は**出典 URL を控える**。裏が取れないものは書かない。

3. **規約に沿って執筆する**（`references/content-conventions.md` 必読）
   - フロントマターは規約どおり。**`draft: true` を必ず入れる**。
   - ファイル名は `YYYY-MM-DD-<英小文字スラッグ>.mdx`。`slug` はファイル名（拡張子なし）と一致させる。
   - 本文はブランドのトーンで（`references/brand-voice.md`）。見出し（##）から始め、`# H1` は書かない（タイトルはフロントマター）。
   - 文字コロン `:` を含む title/excerpt は `"..."` で囲む（最小 YAML パーサ対策）。

4. **PR を作る**（GitHub コネクタ）
   - ブランチ `cowork/<collection>-YYYYMMDD-<slug>` を切る。
   - 追加ファイルは原則 MDX 1 本（＋必要なら `public/` の画像）。それ以外は触らない。
   - PR タイトル例: `feat(marketing): ニュース記事ドラフト「<タイトル>」`。
   - PR 本文テンプレ：
     ```
     ## 概要
     <記事の狙い・コレクション・想定読者>

     ## 参照・出典
     - <一次ソース URL>

     ## レビュー観点
     - 事実/数値の正確さ、出典の妥当性
     - トーン・表現（景表法/薬機など断定表現がないか）
     - フロントマター（slug・tags・excerpt・ogTitle 等）

     ## 公開手順
     - レビュー後、フロントマターの `draft: true` を削除（または false）してマージ
     - プレビューは `npm run dev`（本番ビルドでは draft は非表示）

     > レビュー必須。マージは人が行ってください。
     ```

5. **報告**
   - 作成した PR の URL、コレクション、想定公開手順を簡潔に伝える。自分でマージしない。

## やってはいけないこと

- `draft: true` を外して出す / `draft` を入れ忘れる。
- MDX 以外のアプリコードを触る（コンポーネント新規作成が必要なら PR 本文で人に依頼）。
- 出典のない数値・実績・第三者比較を書く。顧客の個人情報をそのまま載せる。
- 既存記事を断りなく書き換える（誤字修正など軽微でも、別 PR にして理由を書く）。

## プレビューの注意（レビュアーへ伝える）

`draft: true` の記事は**本番ビルドでは非表示**（`process.env.NODE_ENV === "production"` で除外）。
Vercel の Preview デプロイも production ビルド扱いのため表示されない点に注意。
レビュー時のプレビューは `npm run dev`（ローカル）で確認するのが確実。

# 記事の投稿手順（お知らせ・ブログ・イベント・事例）

**結論: ふだんの投稿は管理画面（`/admin/site-content`）から。デプロイは要らない。**
MDX ファイルは、コードと一緒に管理したい記事と事例のためだけに使う。

投稿経路は2つあり、どちらで書いても一覧・記事ページ・`sitemap.xml`・
RSS（`/feed.xml`）に載る。

## 経路A: 管理画面（推奨）

`/admin/site-content` → 「新規」。`site_content:view` 権限が要る。

| 種別 | 表示される場所 |
| --- | --- |
| お知らせ（news） | `/news` |
| ブログ（blog） | `/blog` |
| イベント（event） | `/events` |
| ウェビナー（webinar） | `/events` |

状態は4つ。

- **下書き（draft）** — 公開されない
- **予約（scheduled）** — 公開日時を過ぎると自動で「公開中」になる。
  昇格は5分ごとの cron（`/api/cron/publish-scheduled`、`vercel.json` に登録済み）。
  公開日時の入力が必須。
- **公開中（published）** — サイトに出る
- **アーカイブ（archived）** — サイトから下げる

スラッグは半角英小文字・数字・ハイフンのみ。記事ごとに CTA と OG の文言を
上書きできる（未入力なら既定にフォールバックする）。

## 経路B: MDX ファイル

`src/content/<コレクション>/<slug>.mdx` を足してコミット・デプロイする。

| コレクション | 表示される場所 | 備考 |
| --- | --- | --- |
| `news` | `/news` | 管理画面の news と同じ一覧に混ざる |
| `blog` | `/blog` | 管理画面の blog と同じ一覧に混ざる |
| `cases`（事例） | `/cases` | **MDX のみ。管理画面からは投稿できない** |

frontmatter は `title` と `slug` が実質必須（`slug` を省くとファイル名が slug になる）。
そのほか `publishedAt` / `excerpt` / `tags` / `hero` / `ogTitle` / `ogSubtitle` /
`cta*` を使える。定義は `src/lib/marketing/content.ts` の `ContentFrontmatter`。

- `draft: true` は **本番だけ**で隠れる。Vercel のプレビューとローカルでは表示される
  （レビューのため。`shouldHideDraft` の仕様）。
- ファイル名が `_` で始まるものは常に非公開。`cases/_template.mdx` が雛形。

## 同じ slug を両方に置かない

一覧と記事ページは **DB を優先**して重複を排除するが、`sitemap.xml` の
重複排除は MDX を優先する（`src/app/sitemap.ts`）。URL は同じなので実害は
`lastModified` のズレだけだが、どちらが出ているか分からなくなるので置かない。

## 公開後に自動で反映されるもの

- 一覧ページ・記事ページ
- `sitemap.xml`（DB・MDX の両方から集める）
- `/feed.xml`（お知らせとブログの RSS。5分キャッシュ）

`llms.txt` / `llms-full.txt` は手書きなので、載せたい内容が増えたら自分で直す。

## 書くときの決まり

- **書いていないことは書かない。** 実績・数値・メディア掲載・受賞は出典を示せるものだけ。
- 公開日は実際の日。未来の日付で「もう起きたこと」として書かない
  （告知なら予約投稿を使う）。
- 法令・保険・整備に関する断定は `docs/` の一次資料に当たってから書く。

## 壊れたら

MDX の frontmatter が読めないときは記事が黙って落ちるのではなく、
`title` がファイル名にフォールバックするなど**中途半端に出る**ことがある。
追加したら必ずプレビューで一覧と記事ページを開いて確認する。
RSS の組み立ては `npm run test -- src/lib/marketing/__tests__/rss.test.ts` で検査できる。

# 業界ニュースを素材にする（saved_news 連携）

Ledra は業界ニュースを自動収集している。これを**記事の素材**に使う（コピペ転載ではなく、Ledra の視点で解説・要約する）。

## 収集の仕組み（背景）

- `/api/cron/news`（`src/app/api/cron/news/route.ts`）が RSS フィード＋スクレイピングで業界ニュースを集め、Supabase の **`saved_news`** テーブルに保存している。
- 対象は塗装/コーティング/PPF/整備/板金/ディテイリング、法改正・行政（国交省・環境省）、海外動向（SEMA, Automechanika, IDA 等）。

## アクセス方法（読み取り専用）

Supabase コネクタ（`.mcp.json` の `supabase-ledra-readonly`、`--read-only`）でクエリする。**書き込みはしない**。

`saved_news` の主なカラム：

| カラム | 内容 |
| --- | --- |
| `title` | 見出し |
| `summary` | 要約（最大 300 字程度） |
| `category` | 分類（例「PPF」「塗装・コーティング」「法改正・規制」「海外動向」） |
| `source` | 出典メディア名 |
| `url` | **一次ソース URL（出典として必ず残す）** |
| `published_at` | 公開日時 |
| `keywords` | マッチした業界キーワード |
| `is_relevant` | 関連フラグ |

例: 直近1週間の関連ニュースを新しい順に取得 →
`select title, summary, source, url, published_at, category from saved_news where is_relevant = true and published_at > now() - interval '7 days' order by published_at desc limit 30`

## 記事化の進め方

1. `saved_news`（または提示された URL）から、Ledra の読者（施工店/損保/代理店）に価値がある話題を選ぶ。
2. **一次ソースに当たって裏を取る**（`url` を開く）。要約だけで断定しない。数値・固有名詞は原文で確認。
3. 「事実の要約」＋「Ledra としての解説・示唆」を分けて書く。Ledra の機能に無理に結びつけない（関連が薄ければ触れない）。
4. 出典は本文中のリンク＋PR 本文の「参照・出典」に **URL を必ず記載**。
5. 著作権に配慮：**全文転載しない**。引用は最小限＋出典明記。画像は権利が明確なもの以外使わない。

## やってはいけないこと

- `saved_news` への書き込み・更新（読み取り専用）。
- 出典 URL を残さずに数値・主張を書く。
- 1 つのニュースソースを丸写しする（要約・解説に変換する）。
- 関連の薄い話題を Ledra の宣伝に強引につなげる。

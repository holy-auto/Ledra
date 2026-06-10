# HP 運用の Cowork 自動化ガイド（運用者向け）

公開HP（マーケティングサイト `src/app/(marketing)/`）の運用を **Claude Cowork** で半自動化するための運用者向けガイドです。
仕組みの本体は Cowork プラグイン **`cowork/ledra-hp-ops/`**（リポジトリ同梱）。

> 基本思想：**Cowork は下書きと提案まで。公開・送信・マージは必ず人。**
> リポジトリ変更は必ず PR、メール返信は Gmail 下書きまで、本番データは読み取り専用。

---

## 何が自動化されるか

| 領域 | スキル | Cowork の成果物 | 人がやること |
| --- | --- | --- | --- |
| 記事制作（ニュース/ブログ/事例） | `publish-article` | `draft: true` の MDX を載せた PR | 内容レビュー → `draft` を外してマージ |
| 問い合わせ対応 | `triage-inquiry` | 分類＋ Gmail 返信下書き | 下書き確認 → 送信 |
| SEO 保守 | `seo-maintenance` | メタ/サイトマップ/OGP 修正 PR ＋点検レポート | レビュー → マージ |
| 公開前/定期 品質チェック | `site-health-check` | lint/build/test・リンク・Lighthouse のレポート | 所見の対応判断 |

入口は `hp-ops` スキル（ガードレールと振り分け）。

---

## セットアップ

### 1. プラグインを Cowork に入れる
```
/plugin marketplace add holy-auto/ledra
/plugin install ledra-hp-ops@ledra-cowork
```
（Cowork アプリの Plugins 設定からリポジトリ指定でも可。定義はリポジトリ直下 `.claude-plugin/marketplace.json`。）

### 2. コネクタを接続する（最小権限）
詳細は `cowork/ledra-hp-ops/CONNECTORS.md`。要点：
- **GitHub**（必須）: `holy-auto/ledra` への PR 作成まで。**マージ権限は渡さない**。
- **Gmail**（問い合わせ対応時）: `info@ledra.co.jp` 読み取り＋**下書き作成のみ**（送信権限なし）。
- **Slack**（任意）: 問い合わせ通知の読み取り。
- **Supabase（読み取り専用・任意）**: `saved_news` を記事素材に使う場合。環境変数 `SUPABASE_PROJECT_REF` / `SUPABASE_ACCESS_TOKEN` を Cowork 実行環境に設定（`cowork/ledra-hp-ops/.mcp.json` 参照）。

---

## 日々の使い方（例）

- 「先週の業界ニュースから、施工店向けに価値のある話題を1本、ニュース記事のドラフトにして PR を作って」
- 「未対応の問い合わせを仕分けて、それぞれ一次返信の下書きを用意して。価格や納期は書かないで」
- 「/news と /blog の記事がサイトマップに入っていないので、sitemap.ts を直す PR を作って」
- 「公開前チェックを回して。lint/build/test とリンク切れ、Lighthouse の SEO を見てレポートして」

Cowork は依頼に応じて該当スキルを呼び、**PR か下書き**を用意して止まります。最後の公開判断は運用者が行います。

---

## 定期実行（/schedule）の例

| 頻度 | 内容 | スキル |
| --- | --- | --- |
| 毎朝 8:30 | `saved_news` を確認し、価値ある話題があればニュース記事ドラフトの PR を作る | publish-article |
| 平日 10:00 | 未対応の問い合わせを仕分け、一次返信の下書きを用意 | triage-inquiry |
| 毎週月曜 9:00 | SEO 点検レポート＋サイト健全性チェック（lint/build/link/Lighthouse） | seo-maintenance / site-health-check |

> スケジュールはあくまで**ドラフト/レポート生成**まで。レビュー待ちが溜まらないよう、確認担当を決めておくと良い。

---

## レビュー手順（公開する人向け）

### 記事 PR
1. PR の本文（概要・出典・レビュー観点・公開手順）を確認。
2. 事実/数値の出典、表現（景表法・薬機法の断定回避）、フロントマターをチェック。
3. プレビューは **`npm run dev`**（`draft: true` は本番ビルドでは非表示。Vercel Preview でも非表示）。
4. 問題なければフロントマターの `draft: true` を削除（または `false`）→ マージ → Vercel が公開。

### 問い合わせ下書き
1. Gmail 下書きを開き、内容・宛先・`<要確認: …>` を確認。
2. 価格/契約/法務に踏み込んでいないか確認し、必要なら加筆。
3. 問題なければ**人が送信**。

---

## 安全設計（プラグインの約束）

1. 公開・送信・マージは人間のみ（`draft: true` / Gmail 下書き / PR まで）。
2. 触ってよいのは記事・マーケ文書・サイトマップ/メタ等に限定。ビジネスロジック・API・認証・課金・DB マイグレーション・秘密情報には触れない。
3. `main` へ直接 push しない（必ずブランチ＋PR）。
4. 本番データは読み取り専用。
5. 事実は出典付き。個人情報を公開物に出さない。

ルールの実体は `cowork/ledra-hp-ops/skills/hp-ops/SKILL.md`（ガードレール）と各スキルの SKILL.md にある。
運用ルールを変えたいときは該当 Markdown を編集（ビルド不要）。

---

## 関連ファイル

- プラグイン本体: `cowork/ledra-hp-ops/`（`README.md` / `CONNECTORS.md` / `skills/*`）
- マーケットプレイス定義: `.claude-plugin/marketplace.json`
- コンテンツ実装: `src/lib/marketing/content.ts`、`src/content/{news,blog,cases}/`
- サイト設定: `src/lib/marketing/config.ts`、`src/app/sitemap.ts`、`src/app/robots.ts`
- 問い合わせ: `src/app/api/contact/route.ts`
- ニュース収集: `src/app/api/cron/news/route.ts`（`saved_news`）

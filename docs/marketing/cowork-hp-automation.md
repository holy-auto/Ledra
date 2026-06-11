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
| データ分析（GSC / GA4） | `analyze-performance` | CTR・順位11-30・CVR の機会レポート（読み取り専用） | 提案を確認 → 各スキルで実装 |

これらを**日次/週次/月次のルーチン**（`daily-ops` / `weekly-ops` / `monthly-ops`）が束ねて回します（下記「運用カデンス」）。
入口は `hp-ops` スキル（ガードレールと振り分け）。

---

## セットアップ

### 1. プラグインを Cowork に入れる
**Cowork デスクトップ**は UI から追加します（チャットに `/plugin ...` は不可＝「不明なスキル: plugin」）。
**Customize（カスタマイズ）→ Plugins → Personal plugins → ＋ → Add marketplace → GitHub リポジトリ `holy-auto/ledra`**（プライベートのため GitHub 認可が必要）→ `ledra-hp-ops` を **Install**。
全ステップは `cowork/ledra-hp-ops/SETUP.md`。定義はリポジトリ直下 `.claude-plugin/marketplace.json`。
（Claude Code CLI の場合のみ `/plugin marketplace add holy-auto/ledra` → `/plugin install ledra-hp-ops@ledra-cowork`。）

### 2. コネクタを接続する（最小権限）
詳細は `cowork/ledra-hp-ops/CONNECTORS.md`。要点：
- **GitHub**（必須）: `holy-auto/ledra` への PR 作成まで。**マージ権限は渡さない**。
- **Gmail**（問い合わせ対応時）: `info@ledra.co.jp` 読み取り＋**下書き作成のみ**（送信権限なし）。
- **Slack**（任意）: 問い合わせ通知の読み取り。
- **Supabase（読み取り専用・任意）**: `saved_news` を記事素材に使う場合。環境変数 `SUPABASE_PROJECT_REF` / `SUPABASE_ACCESS_TOKEN` を Cowork 実行環境に設定（`cowork/ledra-hp-ops/.mcp.json` 参照）。
- **Google Search Console（読み取り専用・週次/月次）**: `mcp-server-gsc`。サービスアカウント JSON を `GSC_SERVICE_ACCOUNT_JSON` に設定し、GSC プロパティにそのアカウントを追加。
- **GA4（読み取り専用・週次/月次）**: 公式 `google-analytics-mcp`（`pipx install`）。`GA4_SERVICE_ACCOUNT_JSON`（または ADC）で認証し、対象 GA4 プロパティに閲覧権限。

---

## 日々の使い方（例）

- 「先週の業界ニュースから、施工店向けに価値のある話題を1本、ニュース記事のドラフトにして PR を作って」
- 「未対応の問い合わせを仕分けて、それぞれ一次返信の下書きを用意して。価格や納期は書かないで」
- 「/news と /blog の記事がサイトマップに入っていないので、sitemap.ts を直す PR を作って」
- 「公開前チェックを回して。lint/build/test とリンク切れ、Lighthouse の SEO を見てレポートして」

Cowork は依頼に応じて該当スキルを呼び、**PR か下書き**を用意して止まります。最後の公開判断は運用者が行います。

---

## 運用カデンス（Daily / Weekly / Monthly）

3 つのルーチンスキルが、各タスクを束ねて回します。**すべてレビュー前提**（PR / 下書き / 提案ドキュメント）。

### Daily（`daily-ops`）— 毎日の小さな改善
- SEO点検（軽量）・meta改善・alt追加・CTA改善・軽微リライト・改善ログ更新
- 成果物: **1日1本の小さな PR**（`cowork/daily-YYYYMMDD`）＋ `docs/marketing/reports/daily/YYYY-MM-DD.md` ＋ `docs/marketing/operation/improvement-log.md` 追記
- Scheduled Task 用プロンプト: `docs/marketing/operation/prompts/daily.md`
- 何もなければ PR を作らない（改善ログに 1 行だけ）

### Weekly（`weekly-ops`）— データ起点の改善 + 下書き
- Search Console 分析・GA4 分析・CTR改善・順位11〜30位ページ改善・ブログ下書き・FAQ追加・週次レポート
- 成果物: 関心事ごとの PR（SEO修正 / ブログ`draft` / FAQ）＋ `docs/marketing/reports/weekly/YYYY-Www.md`

### Monthly（`monthly-ops`）— 振り返りと計画
- 月次KPI分析・コンテンツカレンダー・キーワード戦略・CVR改善計画・月次レポート
- 成果物: `docs/marketing/reports/monthly/YYYY-MM.md` ＋ `docs/marketing/operation/content-calendar-YYYY-MM.md` ＋ `operation/keyword-strategy-YYYY-MM.md` ＋ `operation/cvr-improvement-plan-YYYY-MM.md`（承認用の提案）

## スケジュール設定例

Cowork 左メニューの **Scheduled（予定済み）/ New task** から定期タスクを作ります（`/schedule` チャットコマンドではなく UI）。
指示文を貼り付け、繰り返し（毎日/毎週/毎月）と時刻を指定。**プロジェクトで作業**に `holy-auto/ledra` を選ぶとパス参照が効きます。

| 周期（例） | 指示文 |
| --- | --- |
| 毎朝 8:30 | `Ledra の daily-ops ルーチンを実行して。docs/marketing/operation/prompts/daily.md の手順に従うこと。` |
| 毎週 月 9:00 | `Ledra の weekly-ops ルーチンを実行して。docs/marketing/operation/prompts/weekly.md の手順に従うこと。` |
| 毎月 1日 9:00 | `Ledra の monthly-ops ルーチンを実行して。docs/marketing/operation/prompts/monthly.md の手順に従うこと。` |

任意で粒度を分けたい場合の例:

| 周期（例） | 指示文 |
| --- | --- |
| 平日 10:00 | 未対応の問い合わせを仕分けて一次返信の下書きを作って（triage-inquiry） |
| 毎朝 8:30 | saved_news を見て価値ある話題があればニュース記事ドラフトの PR を作って（publish-article） |

> スケジュールはあくまで**ドラフト/レポート/提案の生成**まで。公開・送信・マージ・実装は人が判断する。
> レビュー待ちが溜まらないよう、Daily/Weekly/Monthly それぞれの確認担当・確認タイミングを決めておくと良い。

### 出力先まとめ
| 種類 | 置き場所 |
| --- | --- |
| 改善ログ | `docs/marketing/operation/improvement-log.md` |
| 日次レポート | `docs/marketing/reports/daily/YYYY-MM-DD.md` |
| 週次レポート | `docs/marketing/reports/weekly/YYYY-Www.md` |
| 月次レポート | `docs/marketing/reports/monthly/YYYY-MM.md` |
| 月次計画 | `docs/marketing/operation/content-calendar-YYYY-MM.md` / `keyword-strategy-YYYY-MM.md` / `cvr-improvement-plan-YYYY-MM.md` |
| 記事ドラフト | `src/content/{news,blog,cases}/*.mdx`（`draft: true`、PR） |
| 分析データ(入力) | `docs/marketing/data/`（コミットしない / PII禁止） |

### 様式・プロンプト
| 種類 | 置き場所 |
| --- | --- |
| 日次レポート様式 | `docs/marketing/operation/templates/daily-report.md` |
| 週次レポート様式 | `docs/marketing/operation/templates/weekly-report.md` |
| 月次レポート様式 | `docs/marketing/operation/templates/monthly-report.md` |
| 汎用運営レポート様式（臨時） | `docs/marketing/operation/templates/growth-report.md` |
| Daily スケジュールタスク用プロンプト | `docs/marketing/operation/prompts/daily.md` |
| Weekly スケジュールタスク用プロンプト | `docs/marketing/operation/prompts/weekly.md` |
| Monthly スケジュールタスク用プロンプト | `docs/marketing/operation/prompts/monthly.md` |
| KPI改善専用プロンプト（CSV投入後に使用） | `docs/marketing/operation/prompts/kpi-analysis.md` |

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

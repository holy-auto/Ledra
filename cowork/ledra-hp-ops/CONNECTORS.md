# コネクタ設定ガイド

このプラグインが使う外部接続と**最小権限**の指針です。Cowork の「Connectors / 接続」設定で有効化します。
GitHub・Gmail・Slack は Cowork のファーストパーティ・コネクタ（OAuth）で接続します。Supabase はこのプラグインの `.mcp.json` で接続します。

---

## 1. GitHub（必須）

記事ドラフトや SEO 修正を **PR** として作るために使います。

- **対象リポジトリ**: `holy-auto/ledra`
- **必要な操作**: ブランチ作成 / ファイル作成・更新 / コミット / Pull Request 作成・更新・コメント
- **不要な権限**: **マージ権限は付与しない**（マージは人が行う）。`main` への直接 push も行わない。
- 推奨: Cowork 専用の machine user か、PR 作成までに絞った PAT / GitHub App。

> スキルは必ず `cowork/...` で始まるブランチを切り、PR を作って終わります。直接 push やマージはしません。

---

## 2. Gmail（triage-inquiry を使う場合）

問い合わせは Resend 経由で **`info@ledra.co.jp`** に届きます（`src/app/api/contact/route.ts`）。
このメールボックスを読み、**返信の下書き**を作るために使います。

- **必要な操作**: メール読み取り / **下書き作成（drafts.create）**
- **不要な権限**: **送信権限は付与しない**（送信は人が行う）。
- 推奨ラベル運用: Cowork が処理したスレッドに `cowork/triaged` ラベルを付け、二重処理を防ぐ。

---

## 3. Slack（任意）

問い合わせは Slack にも通知されます（`SLACK_ADMIN_SUPPORT_WEBHOOK_URL`）。
未対応の問い合わせを拾う・社内へ要約共有する用途で読み取り接続します。

- **必要な操作**: 対象チャンネルの読み取り（＋必要なら下書き的な投稿は人の確認後）
- **不要な権限**: 顧客に向けた自動投稿はしない。

---

## 4. Supabase（読み取り専用・任意）

業界ニュース自動収集テーブル **`saved_news`** を、記事ドラフトの**素材**として使う場合に接続します。
`/api/cron/news` が RSS＋スクレイピングで収集しています。

- 接続は本プラグインの `.mcp.json` に定義済み（`supabase-ledra-readonly`、`--read-only`）。
- 必要な環境変数（Cowork 実行環境に設定）:
  - `SUPABASE_PROJECT_REF` — Supabase プロジェクト ref
  - `SUPABASE_ACCESS_TOKEN` — 読み取り用の Supabase アクセストークン
- **読み取り専用**。本番データの書き換えは行いません。

参照する主なカラム（`saved_news`）: `title`, `summary`, `category`, `source`, `url`, `published_at`, `keywords`, `is_relevant`。

---

## 5. Google Search Console（GSC・読み取り専用・週次/月次で使用）

検索パフォーマンス（クエリ・ページ・clicks/impressions/CTR/position）を分析するために使う。
本プラグインの `.mcp.json` の `gsc-readonly`（`mcp-server-gsc`）で接続する。

- セットアップ:
  1. Google Cloud でプロジェクトを用意し **Search Console API** を有効化。
  2. **サービスアカウント**を作成し JSON 鍵を発行。
  3. Search Console のプロパティ設定で、そのサービスアカウントのメールを**ユーザー（フル/制限）として追加**。
  4. Cowork 実行環境に環境変数 `GSC_SERVICE_ACCOUNT_JSON`＝鍵 JSON のパスを設定。
- **読み取り専用**。プロパティ設定やデータは変更しない。鍵はパスワード同様に厳重管理。

## 6. Google Analytics 4（GA4・読み取り専用・週次/月次で使用）

セッション/エンゲージメント/コンバージョン/流入/LP を分析するために使う。
公式 MCP（`googleanalytics/google-analytics-mcp`）を `.mcp.json` の `analytics-mcp` で接続。

- セットアップ:
  1. `pipx install analytics-mcp`（Python 3.10+。公式パッケージ名は `analytics-mcp`。これで `.mcp.json` が使う `google-analytics-mcp` コマンドが入る）。
  2. **GA4 Admin API / Data API** を有効化。
  3. 認証は ADC（`gcloud auth application-default login`）か**サービスアカウント JSON**。サービスアカウントを使う場合、その GA4 プロパティに**閲覧権限**を付与し、`GA4_SERVICE_ACCOUNT_JSON`＝鍵 JSON のパスを設定。
  4. 分析対象の **GA4 プロパティ ID** を把握しておく（`run_report` 等で指定）。
- すべて**読み取り専用**（設定変更不可）。

> GSC/GA4 が未接続のときは、Cowork は数値を捏造せず「未接続」と明記する（`analyze-performance` スキルの方針）。

---

## 接続ごとの「やらないこと」一覧

| コネクタ | やること | やらないこと |
| --- | --- | --- |
| GitHub | ブランチ・PR 作成 | main へ直接 push / マージ |
| Gmail | 読み取り・下書き作成 | 送信 |
| Slack | 読み取り・社内共有 | 顧客向け自動投稿 |
| Supabase | 読み取り | 書き込み・スキーマ変更 |
| Search Console | 検索データの読み取り | プロパティ設定の変更 |
| GA4 | 行動/CV データの読み取り | 計測設定の変更 |

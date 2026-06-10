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

## 接続ごとの「やらないこと」一覧

| コネクタ | やること | やらないこと |
| --- | --- | --- |
| GitHub | ブランチ・PR 作成 | main へ直接 push / マージ |
| Gmail | 読み取り・下書き作成 | 送信 |
| Slack | 読み取り・社内共有 | 顧客向け自動投稿 |
| Supabase | 読み取り | 書き込み・スキーマ変更 |

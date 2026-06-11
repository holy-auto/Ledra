# セットアップ手順書

このプラグインを Cowork で動かすまでの**全手順**をコピペできる形でまとめた作業書です。
上から順に進めれば完了します。所要時間の目安: 約30〜60分（Google の設定が大半）。

---

## Step 1 — プラグインをインストールする

> ⚠️ **Cowork のチャットに `/plugin ...` と打っても動きません**（「不明なスキル: plugin」エラーになる）。
> `/plugin` は Claude Code CLI 専用の構文です。Cowork デスクトップでは **Customize（カスタマイズ）メニューの UI** から追加します。
> また `holy-auto/ledra` は**プライベートリポジトリ**のため、先に **Step 2 の GitHub 接続を済ませておく**とスムーズです（マーケットプレイス追加時に GitHub の認可を求められます）。

### 1-1. マーケットプレイスを追加する（Cowork UI）

1. 左メニューの **Customize（カスタマイズ）** を開く
2. **Plugins** タブを開く
3. **Personal plugins（個人用プラグイン）** セクションの **＋** ボタン → **Add marketplace（マーケットプレイスを追加）**
4. **GitHub リポジトリから追加**を選び、リポジトリに `holy-auto/ledra` を指定（URL を求められたら `https://github.com/holy-auto/ledra`）
5. GitHub の認可を求められたら**許可**（プライベートリポジトリの読み取りに必要）
6. **Add** → **Done**。マーケットプレイス `ledra-cowork` が一覧に表示される

### 1-2. プラグインをインストールする

1. 追加した `ledra-cowork` マーケットプレイスを開く
2. プラグイン **`ledra-hp-ops`** を見つけて **Install**
3. インストール後、以下のスキルが使えることを確認（`/` を押す or `＋` で一覧表示）:
   `hp-ops` / `publish-article` / `triage-inquiry` / `seo-maintenance` / `site-health-check` / `analyze-performance` / `daily-ops` / `weekly-ops` / `monthly-ops`

> 参考: Claude Code CLI（ターミナル版）で使う場合のみ、`/plugin marketplace add holy-auto/ledra` → `/plugin install ledra-hp-ops@ledra-cowork` が使えます。**Cowork デスクトップは上記 UI 手順**を使ってください。
> 既知の不具合: アプリ再起動後に個人マーケットプレイスのインストールが消える事象が報告されています。消えた場合は 1-2 を再実行してください。

---

## Step 2 — GitHub を接続する（必須）

PR 作成に使う。**マージ権限は不要**。

### 2-1. Fine-grained PAT を作成する

1. https://github.com/settings/tokens を開く
2. **Generate new token (fine-grained)** をクリック
3. 以下を設定:

| 項目 | 値 |
|---|---|
| Token name | `cowork-ledra-hp-ops` |
| Expiration | 90 days（または運用に合わせて） |
| Resource owner | `holy-auto` |
| Repository access | `Only select repositories` → `holy-auto/ledra` を選択 |

4. **Repository permissions** で以下だけ `Read and write` にする:

| Permission | Level |
|---|---|
| Contents | Read and write |
| Pull requests | Read and write |
| Metadata | Read-only（自動） |

5. **Generate token** → トークン文字列をコピー（一度しか表示されない）

### 2-2. Cowork に登録する

Cowork の **Settings（設定）→ Connectors** → **GitHub** を選び、案内に従って接続。
PAT 入力欄があれば 2-1 でコピーしたトークンを貼り付け、なければ OAuth で `holy-auto` 組織を認可（`holy-auto/ledra` を含む）。

> GitHub をファーストパーティ・コネクタ（OAuth）で接続する場合は PAT 作成（2-1）は不要なこともあります。
> その場合も**マージ権限は付与せず**、PR 作成までに留めてください。

---

## Step 3 — Gmail を接続する（問い合わせ対応を使う場合）

**送信権限は付与しない**。下書き作成のみ。

### 3-1. Google Cloud で Gmail API を有効化する

1. https://console.cloud.google.com/ を開く
2. プロジェクトを選択（または新規作成: `ledra-cowork`）
3. **APIs & Services** → **Enable APIs** → `Gmail API` を検索して有効化

### 3-2. OAuth クライアントを作成する

1. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
2. Application type: **Desktop app**
3. Name: `cowork-gmail`
4. **Create** → **クライアントID** と **クライアントシークレット** をメモ

### 3-3. Cowork に登録する

Cowork の設定 → **Connectors** → **Gmail** → OAuth でログイン。

ログインアカウントは `info@ledra.co.jp`（問い合わせが届くアカウント）を選択。

許可する権限:
- `gmail.readonly`（メール読み取り）
- `gmail.compose`（下書き作成）

> 「送信」の権限リクエストが出た場合は拒否してよい。Cowork は送信しない。

---

## Step 4 — Supabase を接続する（saved_news を使う場合）

記事素材として `saved_news` テーブルを参照する。**読み取り専用**。

### 4-1. プロジェクト ref を確認する

1. https://app.supabase.com/ を開く
2. `ledra`（または対象プロジェクト）を選択
3. **Settings** → **General** → **Reference ID** をコピー

例: `abcdefghijklmnop`

### 4-2. アクセストークンを作成する

1. https://app.supabase.com/account/tokens を開く
2. **Generate new token** → Name: `cowork-readonly` → **Generate**
3. トークンをコピー

### 4-3. Cowork に環境変数を設定する

Cowork の設定 → **Environment variables** に以下を追加:

| 変数名 | 値 |
|---|---|
| `SUPABASE_PROJECT_REF` | Step 4-1 でコピーした Reference ID |
| `SUPABASE_ACCESS_TOKEN` | Step 4-2 でコピーしたトークン |

---

## Step 5 — Google Search Console を接続する（週次/月次分析）

検索クエリ・クリック・掲載順位を分析する。**読み取り専用**。

### 5-1. Google Cloud でサービスアカウントを作成する

1. https://console.cloud.google.com/ → 同プロジェクト
2. **APIs & Services** → **Enable APIs** → `Google Search Console API` を有効化
3. **IAM & Admin** → **Service Accounts** → **Create Service Account**
4. 設定:

| 項目 | 値 |
|---|---|
| Name | `cowork-gsc-reader` |
| ID | `cowork-gsc-reader`（自動入力） |
| Role | なし（GSC で権限を付与するため） |

5. 作成後 → **Keys** タブ → **Add Key** → **JSON** → ダウンロード
6. ダウンロードしたファイルを安全な場所に保存（例: `~/.cowork/gsc-service-account.json`）
7. ファイル内の `"client_email"` の値をコピー（例: `cowork-gsc-reader@your-project.iam.gserviceaccount.com`）

### 5-2. Search Console にサービスアカウントを追加する

1. https://search.google.com/search-console を開く
2. `https://ledra.co.jp/`（または対象プロパティ）を選択
3. **設定** → **ユーザーと権限** → **ユーザーを追加**
4. Step 5-1 でコピーした `client_email` を入力 → **権限: 制限付き** → **追加**

### 5-3. Cowork に環境変数を設定する

| 変数名 | 値 |
|---|---|
| `GSC_SERVICE_ACCOUNT_JSON` | JSONファイルの**絶対パス**（例: `/Users/yourname/.cowork/gsc-service-account.json`） |

### 5-4. mcp-server-gsc をインストールする

```bash
npx -y mcp-server-gsc --version
```

コマンドが通れば OK（`.mcp.json` の `gsc-readonly` が自動で使う）。

---

## Step 6 — Google Analytics 4 を接続する（週次/月次分析）

セッション・流入・CVR を分析する。**読み取り専用**。

### 6-1. google-analytics-mcp をインストールする

```bash
pip install pipx   # pipx が未インストールの場合
pipx install google-analytics-mcp
```

コマンドが通ることを確認:
```bash
google-analytics-mcp --version
```

### 6-2. GA4 プロパティ ID を確認する

1. https://analytics.google.com/ を開く
2. `ledra.co.jp`（または対象）を選択
3. **Admin** → **Property** → **Property details** → **Property ID** をメモ

例: `123456789`

### 6-3. サービスアカウントを GA4 に追加する

GSC と同じサービスアカウントを使い回せます。

1. https://analytics.google.com/ → **Admin** → **Property Access Management**
2. **+** → **Add users**
3. Step 5-1 でコピーした `client_email` を入力 → **役割: 閲覧者** → **追加**

### 6-4. Cowork に環境変数を設定する

| 変数名 | 値 |
|---|---|
| `GA4_SERVICE_ACCOUNT_JSON` | JSONファイルの絶対パス（GSC と同じファイルで OK） |
| `GA4_PROPERTY_ID` | Step 6-2 でメモした Property ID |

---

## Step 7 — 動作確認をする

Cowork のチャットで以下を実行して、各接続が機能するか確認:

```
Ledra の HP を確認して、現在の改善余地を簡単に教えて
```

GSC/GA4 が接続済みなら:
```
Ledra の今週の Search Console データを確認して、CTRが低いページを教えて
```

エラーが出たら → エラーメッセージを確認 → 対応するステップを再確認。

---

## Step 8 — スケジュールを登録する

Cowork 左メニューの **Scheduled（予定済み）** から定期タスクを作ります（チャットに `/schedule` と打つ方式ではありません）。
時刻は運用に合わせて変更可。**3つ**登録します。

各タスクの作り方:
1. **New task（新しいタスク）** を開く（または Scheduled → ＋）
2. 指示文（下記）を貼り付ける
3. **実行** の横などにあるスケジュール設定で**繰り返し（毎日 / 毎週 / 毎月）と時刻**を指定
4. **プロジェクトで作業**で対象リポジトリ（`holy-auto/ledra`）を選んでおくと、プロンプト内のパスを参照できます
5. 保存 → **Scheduled** 一覧に表示されることを確認

登録する3タスク（指示文をそのまま貼り付け）:

**日次（毎朝 8:30 など）**
```
Ledra の daily-ops ルーチンを実行して。docs/marketing/operation/prompts/daily.md の手順に従うこと。
```

**週次（毎週月曜 9:00 など）**
```
Ledra の weekly-ops ルーチンを実行して。docs/marketing/operation/prompts/weekly.md の手順に従うこと。
```

**月次（毎月 1日 9:00 など）**
```
Ledra の monthly-ops ルーチンを実行して。docs/marketing/operation/prompts/monthly.md の手順に従うこと。
```

> プロンプト全文を貼りたい場合は、各 `prompts/*.md` の ```md ブロックの中身```をコピーして貼り付けてもOK。

---

## チェックリスト

セットアップ完了の確認。

- [ ] Step 1: プラグインインストール済み
- [ ] Step 2: GitHub PAT 設定済み（`holy-auto/ledra` への PR 作成のみ）
- [ ] Step 3: Gmail 接続済み（`info@ledra.co.jp`、下書きのみ）※任意
- [ ] Step 4: Supabase 環境変数設定済み ※任意
- [ ] Step 5: GSC サービスアカウント設定済み ※週次/月次に使う場合
- [ ] Step 6: GA4 接続済み ※週次/月次に使う場合
- [ ] Step 7: 動作確認済み
- [ ] Step 8: スケジュール登録済み（daily / weekly / monthly）

---

## トラブルシューティング

| 症状 | 確認場所 |
|---|---|
| PR が作れない | GitHub PAT のスコープ（Contents/Pull requests が Read and write か） |
| Gmail が読めない | OAuth のスコープ（gmail.readonly が許可されているか） |
| GSC データが取れない | サービスアカウントが GSC プロパティに追加されているか |
| GA4 データが取れない | `google-analytics-mcp` のインストール / サービスアカウントの閲覧権限 |
| スキルが呼ばれない | `/plugin list` でプラグインが有効か確認 |

詳細は `CONNECTORS.md`（各接続の最小権限の説明）を参照。

# Ledra マーケティング自動投稿

LinkedIn へ **毎朝1本** 自動投稿する仕組みです。Ledra のメリット・デメリット・利用想定を1ヶ月（30本）でひと巡りし、その後は先頭に戻ってループします。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `marketing/linkedin-posts.md` | 人が読む用の30日分ストック（コピペ手動投稿にも使える） |
| `marketing/linkedin-posts.json` | 投稿コンテンツの編集用ソース（人が編集しやすい形） |
| `src/lib/marketing/linkedinPosts.ts` | **実行時のソース・オブ・トゥルース**。cron がここを読む |
| `src/lib/marketing/linkedin.ts` | LinkedIn REST Posts API クライアント（トークンを受け取り投稿） |
| `src/lib/marketing/linkedinTokens.ts` | トークン保管＋**自動リフレッシュ**（期限前に更新しDBへ書き戻し） |
| `src/app/api/cron/linkedin-posting/route.ts` | 毎日のcronエンドポイント |
| `src/lib/marketing/runLinkedInPost.ts` | cron / 手動テスト共通の「次の1本を投稿」ロジック |
| `src/app/api/admin/marketing/linkedin/test/route.ts` | 手動テスト用エンドポイント（運営管理者限定） |
| `supabase/migrations/20260611000000_marketing_linkedin_log.sql` | 投稿ログ＆ローテーション管理テーブル |
| `supabase/migrations/20260611000001_marketing_linkedin_credentials.sql` | トークン保管テーブル（暗号化・シングルトン行） |

## 仕組み（ローテーション）

`marketing_linkedin_log` テーブルの `status='posted'` の件数を数え、
`index = postedCount % 投稿数` で「次に投稿する1本」を決めます。

- 投稿成功 → ログに `posted` を1件追加 → 次回は次の投稿へ
- 失敗 / 未設定（スキップ）→ スロットを消費しない → 次回に同じ投稿を再試行

二重投稿は cron ロック（`withCronLock`）で防止します。

## スケジュール

`vercel.json` に登録済み：

```json
{ "path": "/api/cron/linkedin-posting", "schedule": "0 0 * * *" }
```

`0 0 * * *` = 毎日 00:00 UTC = **日本時間 朝9時**。

## LinkedIn 連携のセットアップ

実投稿には LinkedIn アプリ（OAuth2）が必要です。設定するまでは安全に
「スキップ」され、cron はグリーンのまま動きます（アラートも出ません）。

1. LinkedIn Developer Portal でアプリを作成
   - 組織ページに投稿: `w_organization_social` スコープ
   - 個人で投稿: `w_member_social` スコープ
2. アクセストークンと投稿主 URN を取得
3. 以下の環境変数を Vercel（Production）に設定：

```bash
LINKEDIN_AUTOPOST_ENABLED=true
LINKEDIN_ACCESS_TOKEN=<OAuth2 アクセストークン>      # 初回ブートストラップ用
LINKEDIN_REFRESH_TOKEN=<リフレッシュトークン>        # 自動更新に必須
LINKEDIN_CLIENT_ID=<アプリのClient ID>               # 自動更新に必須
LINKEDIN_CLIENT_SECRET=<アプリのClient Secret>       # 自動更新に必須
LINKEDIN_AUTHOR_URN=urn:li:organization:12345678    # 個人なら urn:li:person:xxxx
LINKEDIN_API_VERSION=202405                          # 任意（未設定なら既定値）
```

## トークンの自動リフレッシュ

LinkedIn のアクセストークンは約60日で失効します。本実装は**自動更新**します：

- 初回起動時、env（`LINKEDIN_ACCESS_TOKEN` / `LINKEDIN_REFRESH_TOKEN`）から
  暗号化して `marketing_linkedin_credentials`（シングルトン行）へ保存（ブートストラップ）。
- 以降は cron が毎回、有効期限まで2日を切っていたら `LINKEDIN_REFRESH_TOKEN` で
  新しいアクセストークンを取得し、DBへ書き戻します（env の手動更新は不要）。
- リフレッシュには **`LINKEDIN_CLIENT_ID` / `LINKEDIN_CLIENT_SECRET`** が必須です。
- トークンは既存の暗号化方式（AES-256-GCM, `SECRET_ENCRYPTION_KEY`）で保存されます。

> ⚠️ リフレッシュトークンは**承認済みアプリにのみ発行**されます。アプリがリフレッシュ
> トークン非対応の場合、約60日ごとに手動で `LINKEDIN_ACCESS_TOKEN` を入れ直すか、
> DBの行を更新する必要があります（その場合 cron は `token-expired-needs-reauth` を記録）。

## コンテンツを編集したら（TSモジュールの再生成）

`marketing/linkedin-posts.json` を編集したら、実行時モジュールを再生成します：

```bash
node -e '
const fs=require("fs");
const {posts}=JSON.parse(fs.readFileSync("marketing/linkedin-posts.json","utf8"));
const items=posts.map(p=>"  {\n    day: "+p.day+",\n    theme: "+JSON.stringify(p.theme)+",\n    title: "+JSON.stringify(p.title)+",\n    text: "+JSON.stringify(p.text)+",\n  },").join("\n");
let s=fs.readFileSync("src/lib/marketing/linkedinPosts.ts","utf8");
s=s.replace(/export const LINKEDIN_POSTS[\s\S]*?\n\];/,"export const LINKEDIN_POSTS: readonly LinkedInPost[] = [\n"+items+"\n];");
fs.writeFileSync("src/lib/marketing/linkedinPosts.ts",s);
'
npx prettier --write src/lib/marketing/linkedinPosts.ts
```

（`linkedinPosts.ts` を直接編集してもOKです。その場合は JSON も合わせて更新してください。）

## 手動テスト（cronを待たずに確認）

承認直後の動作確認用に、運営管理者限定のエンドポイントを用意しています。
**プラットフォーム管理者（Ledra運営テナントの owner/admin、または super_admin）**として
ログインした状態で叩いてください。

```bash
# 1) 投稿せず「いま投稿できる状態か」を確認（トークン解決のドライラン＋直近ログ）
curl -s https://<your-domain>/api/admin/marketing/linkedin/test \
  -H "Cookie: <ログイン済みセッション>"
#   → { ready: true/false, enabled, next: {...}, recent: [...] }

# 2) いますぐ「次の1本」を本番投稿（動作確認）
curl -s -X POST https://<your-domain>/api/admin/marketing/linkedin/test \
  -H "Cookie: <ログイン済みセッション>"

# 3) ローテーションを無視して特定の day を投稿
curl -s -X POST "https://<your-domain>/api/admin/marketing/linkedin/test?day=1" ...

# 4) 投稿せずトークン解決だけ確認（POSTのドライラン）
curl -s -X POST "https://<your-domain>/api/admin/marketing/linkedin/test?dryRun=1" ...
```

`ready: false` のときは `next.reason` に理由が入ります（`disabled` / `not-configured`
/ `refresh-failed` / `token-expired-needs-reauth`）。まず GET でドライランし、
`ready: true` を確認してから POST で本番投稿するのがおすすめです。

## マイグレーション適用

```bash
supabase db push   # もしくはプロジェクトのマイグレーション運用手順に従う
```

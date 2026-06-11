# Ledra マーケティング自動投稿

LinkedIn へ **毎朝1本** 自動投稿する仕組みです。Ledra のメリット・デメリット・利用想定を1ヶ月（30本）でひと巡りし、その後は先頭に戻ってループします。

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `marketing/linkedin-posts.md` | 人が読む用の30日分ストック（コピペ手動投稿にも使える） |
| `marketing/linkedin-posts.json` | 投稿コンテンツの編集用ソース（人が編集しやすい形） |
| `src/lib/marketing/linkedinPosts.ts` | **実行時のソース・オブ・トゥルース**。cron がここを読む |
| `src/lib/marketing/linkedin.ts` | LinkedIn REST Posts API クライアント |
| `src/app/api/cron/linkedin-posting/route.ts` | 毎日のcronエンドポイント |
| `supabase/migrations/20260611000000_marketing_linkedin_log.sql` | 投稿ログ＆ローテーション管理テーブル |

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
LINKEDIN_ACCESS_TOKEN=<OAuth2 アクセストークン>
LINKEDIN_AUTHOR_URN=urn:li:organization:12345678   # 個人なら urn:li:person:xxxx
LINKEDIN_API_VERSION=202405                          # 任意（未設定なら既定値）
```

> 注: LinkedIn のアクセストークンには有効期限があります。長期運用ではリフレッシュ
> トークンによる更新が必要です（本実装はトークンを環境変数から読むのみ）。

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

## マイグレーション適用

```bash
supabase db push   # もしくはプロジェクトのマイグレーション運用手順に従う
```

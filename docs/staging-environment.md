# ステージング環境ガイド

## 概要

ステージング環境は本番デプロイ前の最終検証に使用します。

## セットアップ

### 1. Vercel でステージング環境を設定

1. Vercel ダッシュボード → Settings → Git
2. Production Branch: `main`
3. Preview Branches に `staging` を追加
4. Environment Variables で「Preview」スコープにステージング用の値を設定:
   - `NEXT_PUBLIC_SUPABASE_URL` → ステージング用Supabaseプロジェクト
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → ステージング用キー
   - `SUPABASE_SERVICE_ROLE_KEY` → ステージング用サービスキー
   - `STRIPE_SECRET_KEY` → Stripeテストモードキー（`sk_test_...`）
   - `STRIPE_WEBHOOK_SECRET` → ステージング用Webhook Secret
   - その他の環境変数はテスト用の値を設定

### 2. Supabase ステージング用プロジェクト

1. Supabase ダッシュボードで新規プロジェクトを作成（例: `cartrust-staging`）
2. マイグレーションを適用:
   ```bash
   npx supabase db push --project-ref <staging-project-ref>
   ```
3. RLS ポリシーが本番と同一であることを確認

#### 注意（2026-10-05 に staging を作ったときの実測）

- **`db push` は最新の `main` のクローンで流す。** 古いクローン（#1025 = 2026-09-05 より前）だと、最初の
  `20260312000000_tenants_contact_fields.sql` で `relation "tenants" does not exist` になる。今の `main` ではこのファイルに
  「tenants が無ければ skip」のガードが入っている。落ちたら、エラーに出た SQL を `main` のファイルと見比べる。
- 空 DB にファイル名順・1パスで通ることは、手元の `node scripts/replay-migrations.mjs` で確かめられる（2026-10-05 時点 520/520）。
- `npx supabase db dump` は内部で Docker を使う。Docker が無い PC では動かない。
- 直接接続のホスト `db.<ref>.supabase.co` は、IPv6 の無い回線では名前解決できない（`ENOTFOUND`）。外から psql 等でつなぐときは、
  ダッシュボードの Connect →「Session pooler」の文字列をそのまま使う（ユーザー名は `postgres.<ref>` 形式）。
- PowerShell で環境変数にパスワードを入れるときは**シングルクォート**で囲む。ダブルクォートだと `$` 以降が変数として展開され、
  パスワードが黙って途中で切れる。
- 写真の保存先 `assets` バケットはマイグレーションに無い（本番では手作業で作られた）。本番と同じ設定（公開・10MB・
  jpeg/png/webp/gif/avif）で作る:
  ```sql
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('assets', 'assets', true, 10485760, array['image/jpeg','image/png','image/webp','image/gif','image/avif'])
  on conflict (id) do nothing;
  ```
- 現在の staging は `Ledra-staging`。スキーマはダンプから入れたため、マイグレーションの適用履歴が空になっている。
  ここに `db push` する前に履歴を合わせる必要がある（`docs/context/OPEN_QUESTIONS.md`「staging（Ledra-staging）の残作業」）。

#### Vercel 側の注意（2026-10-10 に staging をつないだときの実測）

- 環境変数は「**Preview・ブランチ `staging`**」だけに入れる。Production / Development を選んだまま保存すると、
  既存の同名の変数とぶつかって保存できない。Preview 全体に入れると、**他の PR のプレビューまで staging の DB を見る**。
  上書きが要るのは `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` /
  `APP_URL` / `NEXT_PUBLIC_APP_URL`（URL は `https://ledra-git-staging-yusuke-horikoshis-projects.vercel.app`）。
- **本番と同じコミットを `staging` に置くと、Vercel が本番のビルドを使い回し、staging 用の環境変数が効かない**
  （ログインは通るのにアプリ側で 401 になり、staging の Supabase に問い合わせが1件も来ない）。staging には本番に無い
  コミットを1つ以上載せる（空コミットでよい）。そのため `staging` は `main` から早送りではなくマージで更新する。
- プレビューは Vercel の保護（Vercel ログイン必須）が掛かっている。保護は外さず、**Settings → Deployment Protection →
  Protection Bypass for Automation** の合言葉を `x-vercel-protection-bypass` ヘッダで付けてアクセスする。合言葉は秘密。
- staging の写真アップロードは、`CF_ORIGIN_SECRET` が入った環境に `*.vercel.app` 直で送ると 403 になる作り
  （TLS 1.3 のエッジ経由の強制）。2026-10-10 時点の Preview では 403 にならなかった。
- E2E の手順と結果は `docs/operations/certificate-photo-e2e-checklist.md`（B は 2026-10-10 に 9/9 合格）。

### 3. Stripe テストモード

ステージング環境では Stripe の **テストモード** を使用します。
- `STRIPE_SECRET_KEY` = `sk_test_...`
- テストカード: `4242 4242 4242 4242`
- Webhook をステージングURLに向ける

## デプロイフロー

```
feature-branch → staging → main
        ↓            ↓         ↓
      PR作成   ステージング検証  本番デプロイ
```

### ステージングへのデプロイ

```bash
# feature ブランチから staging にマージ
git checkout staging
git pull origin staging
git merge feature/your-branch
git push origin staging
```

Vercel が自動的にプレビューデプロイを実行します。

### 本番へのデプロイ

```bash
# staging の検証完了後、main にマージ
git checkout main
git pull origin main
git merge staging
git push origin main
```

## CI パイプライン

`staging` ブランチへの push/PR で以下が自動実行されます:

1. **Lint + TypeCheck + Unit Tests**
2. **E2E Tests** (ステージング環境変数を使用)
3. **Vercel Preview Deploy** (自動)

## 検証チェックリスト

ステージングで以下を確認してから本番デプロイ:

- [ ] ログイン・ログアウトが正常に動作する
- [ ] 証明書の発行・PDF出力が動作する
- [ ] Stripe 決済フロー（テストカード）が完了する
- [ ] Cron ジョブが正常実行される（手動トリガー）
- [ ] メール送信が正常に動作する
- [ ] 新機能の動作確認
- [ ] モバイル表示の確認
- [ ] パフォーマンス（ページロード3秒以内）

## トラブルシューティング

### ステージングのマイグレーションが古い

```bash
npx supabase db push --project-ref <staging-project-ref>
```

### 環境変数が反映されない

Vercel ダッシュボードで Environment Variables の **スコープ** が「Preview」に設定されているか確認。
変更後は再デプロイが必要:

```bash
git commit --allow-empty -m "trigger redeploy"
git push origin staging
```

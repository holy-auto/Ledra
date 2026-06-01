# マイグレーション履歴のズレと復旧手順（供給パートナー基盤）

> 作成: 2026-06-01
> 対象: 本番プロジェクト `cahybswpduchptvyvdkk`（WEB施工証明書 = Ledra 本番）

## 背景 / 観測された事実

供給パートナー基盤（Phase 0〜）の実装中に、**本番DBのマイグレーション適用状態がリポジトリの履歴と一致しない**ことが判明した。`list_migrations`（`supabase_migrations.schema_migrations`）に基づく観測:

| 対象 | 本番の実体 (`list_tables`/`pg_proc`) | `schema_migrations` の記録 |
|---|---|---|
| `supply_partners` / `_credentials` / `_products` / `tenant_supply_links` | ✅ 存在（私が書いた COMMENT 文ごと） | ❌ `20260601000000` 未記録 |
| `purchase_orders.transport` / `supply_partner_id` 等の列 | ✅ 存在 | ❌ 未記録 |
| `is_supply_partner_active` / `trg_supply_partners_guard` | ✅ 存在 | ❌ 未記録 |
| `my_supply_partner_ids`（agentベース化, 2本目） | ✅ 適用済み（`apply_migration` 経由） | ✅ `20260601054455` 記録 |

つまり **1本目 `20260601000000_supply_partners.sql` の DDL は本番に適用済みだが `schema_migrations` には未記録**。生SQL (`execute_sql` 等) で適用された形跡。2本目以降は `apply_migration` で適用したため記録されている。

### 含意
- リポジトリの migration ファイルと本番の `schema_migrations` の versions が一致しない。
- 将来 CI/CD やローカルからリポジトリの migration を流す際、未記録の versions（例 `20260601000000`）が「未適用」と見なされ **再実行される可能性**がある。
- 幸い、本基盤の migration はすべて **冪等**（`CREATE TABLE IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` / `CREATE OR REPLACE FUNCTION` / `DROP POLICY IF EXISTS → CREATE POLICY` / 部分 UNIQUE INDEX も `IF NOT EXISTS`）なので、**再実行されても安全**（データ破壊・エラーにならない）。

## 推奨対応

### 方針A（推奨）: デプロイ経路を1本化し、記録を後追いで揃える
1. 本番への migration 適用を **1つの経路**（CI の `supabase db push` か `apply_migration`）に統一する。
2. 既に適用済みだが未記録の version を `schema_migrations` に **後追い登録**する（下記スクリプト）。これにより、以後の `db push` が冪等migrationを無駄に再実行しなくなる。

### 方針B: 何もしない（冪等なので動作上は問題なし）
- migration はすべて冪等のため、記録のズレを放置しても**機能・データには影響しない**。再実行されても `IF NOT EXISTS` 等で素通りする。
- ただし `db push` のたびに冪等migrationが再実行されるノイズと、履歴の不透明さは残る。

## 後追い登録スクリプト（レビュー前提・要人手確認）

> ⚠️ **本番の `supabase_migrations.schema_migrations` への書き込み**。実行前に必ず内容を確認し、
> 本番への適用は運営の判断で行うこと（このリポジトリからは自動実行しない）。
> 各 version の DDL が**実際に本番へ適用済みであること**を確認してから登録する
> （未適用の version を登録すると、本当に未適用なまま「適用済み」と誤認される）。

```sql
-- 既に本番へ適用済みだが schema_migrations に未記録の supply 系 migration を後追い登録する。
-- name は supabase の慣例に合わせ、ファイル名の説明部分を入れる。
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES
  ('20260601000000', 'supply_partners'),
  ('20260601000002', 'supply_webhook_secret'),
  ('20260601000003', 'supply_auto_send')
ON CONFLICT (version) DO NOTHING;
-- 注: 20260601000001 (agent integration) は apply_migration 経由で記録済み (version 20260601054455)。
--     リポジトリのファイル名版 20260601000001 が未記録なら、本番に同等の関数定義が
--     既にある (冪等) ため、必要に応じて同様に登録する:
--   INSERT INTO supabase_migrations.schema_migrations (version, name)
--   VALUES ('20260601000001', 'supply_partners_agent_integration') ON CONFLICT DO NOTHING;
```

### 適用前チェックリスト
- [ ] `20260601000002_supply_webhook_secret.sql`（`webhook_secret_ciphertext` 列）が本番に適用済みか確認
  （未適用なら先に `apply_migration` で適用してから登録）。
- [ ] `20260601000003_supply_auto_send.sql`（`is_trusted` 列 + `tenant_supply_auto_send_settings`）が本番に適用済みか確認。
- [ ] 上記2本は **2026-06-01 時点で本番未適用**（このセッションでは適用していない）。本番反映は運営の判断で。

## 本セッションで本番に対して行ったこと（記録）
- ✅ `20260601000001`（`my_supply_partner_ids` の agentベース化）のみ `apply_migration` で適用（ユーザー承認済み）。
- ❌ それ以外の本番書き込みは行っていない（Phase 0 / webhook / auto-send の DDL 適用は運営判断に委ねる）。
- 別プロジェクト `autodetailepro`（`urcennhrpanojvjyiqwu`）は **Ledra とは別アプリ**（`pro_profiles` / `scheduled_bookings` 等）であり、供給パートナー migration は適用対象外。

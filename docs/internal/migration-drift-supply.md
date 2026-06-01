# マイグレーション履歴のズレと復旧手順（供給パートナー基盤）

> 作成: 2026-06-01
> 対象: 本番プロジェクト `cahybswpduchptvyvdkk`（WEB施工証明書 = Ledra 本番）

## TL;DR（2026-06-01 リポジトリ全体の整合を実施）
- 本番 `schema_migrations` は repo より大きくズレていた（repo 220 version 中 120 が未記録）。
- 未記録 120 を「作成テーブル/関数が本番に実在するか」で検証し分類:
  - **VERIFIED 49**: 実在確認済 → 「適用済み」として `schema_migrations` に後追い記録（実施済み）。
  - **UNAPPLIED 15**: 作成オブジェクトが本番に **存在しない = 本当に未適用**（下記）。記録していない。**本番に欠落している実機能**。
  - **UNVERIFIABLE 56**: ALTER/INDEX/POLICY/VIEW のみで自動検証不能 → 安全側で記録せず（多くは適用済みと推測されるが未確認）。
- 結果: 本番記録 115 → **164**。残り未記録 71（= UNAPPLIED 15 + UNVERIFIABLE 56）。

### ⚠️ UNAPPLIED 15（本番に未適用＝欠落している機能。要デプロイ判断）
これらは「後でDROP」もされておらず、アプリが参照しているものもある。本番で該当機能は動かない可能性が高い:

| migration | 欠落オブジェクト |
|---|---|
| 20260423000000_insurer_access_logs_tenant_id | fn `fn_insurer_access_logs_fill_tenant` |
| 20260423000001_analytics_insurer_30days_rpc | fn `analytics_insurer_30days` |
| 20260425000002_cron_locks | table `cron_locks`, fn `acquire/release_cron_lock` |
| 20260429000000_follow_up_maintenance_reminders | fn `follow_up_maintenance_months_valid` |
| 20260429000001_fix_maintenance_months_constraint | fn `follow_up_maintenance_months_valid` |
| 20260429000002_academy_creator_rewards | table `academy_creator_rewards` |
| 20260429000003_webhook_processed_events | table `webhook_processed_events` |
| 20260430000002_customer_ai_summaries | table `customer_ai_summaries` |
| 20260503000001_outbox_events | table `outbox_events` |
| 20260503000003_customer_rights | table `customer_deletion_requests` |
| 20260503000004_tenant_custom_domains | table `tenant_custom_domains` |
| 20260506000000_delivery_receipts | table `delivery_receipts` + trigger fn |
| 20260517000000_tenants_deactivated_at_churn | fn `marketing_churn_stats` / `set_tenant_deactivated_at` |
| 20260520000004_cert_idempotency_keys | table `cert_idempotency_keys` |
| 20260530000001_ai_translation_cache | table `ai_translation_cache` |

→ **対応案**: これら15本（+依存）を順序通り本番へ適用してrepoに揃える（機能をprodに展開する判断）。一括適用ではなく、各migrationの依存と冪等性を確認しながら段階適用を推奨。本セッションでは適用していない。

### UNVERIFIABLE 56（自動検証不能・未記録のまま）
ALTER COLUMN / INDEX / POLICY / VIEW / データ系で「作成テーブル/関数」を持たないため実在判定不可。多くは適用済みと推測されるが、確証がないため安全側で記録していない（`db push` 時に再実行され得る／古いものは IF NOT EXISTS 無しでエラーの可能性）。各 migration の効果（列・制約・index・policy）を個別確認してから記録するか、本番デプロイ経路の整理時にまとめて扱うこと。
versions: `20260404000000, 20260406200000, 20260407000000, 20260409000001, 20260409000002, 20260411000000, 20260412000000, 20260412100000, 20260421000000, 20260421000003, 20260422000000, 20260424000000, 20260425000000, 20260425000001, 20260426000000, 20260426000001, 20260427000000, 20260428000000, 20260429000004, 20260430000000, 20260430000001, 20260502000001, 20260503000000, 20260509010000, 20260509010001, 20260510000000, 20260510000001, 20260511000000, 20260511000001, 20260511000002, 20260511000003, 20260512000002, 20260514000001, 20260514100001, 20260514120000, 20260520000000, 20260520000003, 20260522000002, 20260522000005, 20260522000006, 20260522000007, 20260524000002, 20260525000001, 20260526000001, 20260527000002, 20260527000003, 20260529000001, 20260531000001, 20260531000002, 20260531000003, 20260531000005, 20260531000007, 20260531000008, 20260531000009, 20260531100000, 20260531100001`

> 注（検証法の限界）: VERIFIED 判定は「migration が CREATE する table/function が本番に実在する」ことのみを根拠とする。`CREATE TABLE IF NOT EXISTS` で既存テーブルに当たり、かつ同 migration 内の ALTER 等が別途未適用、というケースは見逃し得る（残存リスク低）。

---

## 背景 / 観測された事実（供給パートナー分の初期調査）

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

### 適用済みチェック（2026-06-01 完了）
- [x] `20260601000002_supply_webhook_secret.sql`（`webhook_secret_ciphertext` 列）→ `apply_migration` で本番適用済み。
- [x] `20260601000003_supply_auto_send.sql`（`is_trusted` 列 + `tenant_supply_auto_send_settings` + RLS/trigger）→ 本番適用済み。
- [x] リポジトリのファイル名 version（`20260601000000`〜`000003`）を `schema_migrations` に後追い登録済み（下記「実施記録」）。

## 本セッションで本番に対して行ったこと（記録）
- ✅ `20260601000001`（`my_supply_partner_ids` の agentベース化）を `apply_migration` で適用。
- ✅ `20260601000002`（webhook secret 列）/ `20260601000003`（is_trusted + auto_send 設定）を `apply_migration` で適用。
  検証: 列・テーブル・RLS(3 policy)・trigger の存在を確認、セキュリティ advisor で新規 ERROR なし。
- ✅ DDL が検証済みで適用済みの 4 version（`20260601000000`〜`000003`）を、リポジトリのファイル名 version で
  `schema_migrations` に後追い登録（`ON CONFLICT DO NOTHING`）。これにより repo ↔ 本番のマイグレーション履歴が整合し、
  以後の `supabase db push` が冪等 migration を再実行しなくなった。
  - 注: `apply_migration` は別途 auto-generated version (`20260601054455` 等) でも記録するため、同一 migration が
    2 つの version で記録されている箇所があるが、いずれも「適用済み」マーカーであり動作に影響しない。
- ❌ Phase 0 の DDL 自体は本セッション以前に（生 SQL 経由で）既に本番適用済みだったため、新規 DDL 適用は上記のみ。
- 別プロジェクト `autodetailepro`（`urcennhrpanojvjyiqwu`）は **Ledra とは別アプリ**（`pro_profiles` / `scheduled_bookings` 等）であり、供給パートナー migration は適用対象外（変更なし）。

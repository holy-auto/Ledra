# マイグレーション履歴のズレと復旧手順（供給パートナー基盤）

> 作成: 2026-06-01
> 対象: 本番プロジェクト `cahybswpduchptvyvdkk`（WEB施工証明書 = Ledra 本番）

## TL;DR（2026-06-01 リポジトリ全体の整合を実施）
- 本番 `schema_migrations` は repo より大きくズレていた（repo 220 version 中 120 が未記録）。
- 未記録 120 を「作成テーブル/関数が本番に実在するか」で検証し分類:
  - **VERIFIED 49**: 実在確認済 → 「適用済み」として `schema_migrations` に後追い記録（実施済み）。
  - **UNAPPLIED 15**: 作成オブジェクトが本番に存在しなかった＝本当に未適用 → **2026-06-01 に本番へ適用済み**（下記）。10 table + 8 function を検証、advisor 新規 ERROR 0。
  - **UNVERIFIABLE 56**: ALTER/INDEX/POLICY/VIEW のみで自動検証不能 → 当時は安全側で記録せず。
- **第2弾（同 2026-06-01）で UNVERIFIABLE 56 を個別検証** → 列/index/制約/policy/view の実在を本番カタログで突合:
  - **41 本: 実在確認＝適用済み** → `schema_migrations` に記録。
  - **15 本: 対象オブジェクトが本番に欠落＝本当に未適用** → 本番へ適用（CONCURRENTLY index は `execute_sql` でトランザクション外実行）→ 再検証 → 記録。
  - 副産物: `notification_logs` の時刻列は `sent_at` なのに migration `20260429000004` と一部 cron コードが存在しない `created_at` を参照していた**バグを発見・修正**（下記）。
- **結果: repo 220 version すべて本番 `schema_migrations` に記録済み（未記録 0）。repo ↔ 本番のマイグレーション履歴が完全整合。** advisor 新規 ERROR 0。

### ✅ UNAPPLIED 15（本番に未適用だった機能 → 2026-06-01 適用済み）
これらは「後でDROP」もされておらず、アプリが参照しているものもあった（本番で該当機能が動かない状態だった）。version 順に1本ずつ「ファイル確認→本番現状確認→冪等性判断→適用→検証」して適用した。
- `20260429000002_academy_creator_rewards`: policy が存在しない `tenant_members` を参照していた**バグを修正**（→ `tenant_memberships`）した上で適用。repo のファイルも同様に修正済み。
- それ以外は概ね `CREATE TABLE IF NOT EXISTS` 等で冪等。`tenants_deactivated_at_churn` は `ADD COLUMN IF NOT EXISTS` + トリガ存在ガードで安全に再適用可能だった。
- ファイル名 version を `schema_migrations` に後追い記録済み。

対象一覧（適用済み）:

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

→ **2026-06-01 実施済み**: 上記15本を version 順に段階適用し、10 table + 8 function の実在を検証。`apply_migration`（auto-version 記録）＋ ファイル名 version を後追い記録。security advisor は新規 ERROR 0（`cron_locks`/`webhook_processed_events`/`ai_translation_cache` は RLS 有効・ポリシー無し＝service-role 専用の意図どおりで INFO `rls_enabled_no_policy` のみ、既存 `error_events` と同扱い）。

### ✅ UNVERIFIABLE 56 → 第2弾で全件解消（2026-06-01）
ALTER COLUMN / INDEX / POLICY / VIEW / データ系のため当初は「作成テーブル/関数」基準で判定不能だったが、**各 migration が生成する具体オブジェクト（列・index・制約・policy・view・seed 行）を本番カタログ（`information_schema` / `pg_indexes` / `pg_constraint` / `pg_policies` / `pg_proc`）で1本ずつ突合**して全件判定した。

- **適用済み 41 本（記録のみ）**: 列/index/制約/policy/view/関数 search_path/demo seed 行が本番に実在 → `schema_migrations` に後追い記録。
- **未適用 15 本（適用＋記録）**: 対象オブジェクトが本番に欠落していた＝本当に未適用。版順に適用し再検証して記録。
  - 内訳: `20260424000000`(customer_sessions.customer_id), `20260429000004`(perf indexes round3), `20260430000000`(maintenance列+index), `20260430000001`(notification_logs LINEチャネル), `20260503000000`(academy 動画列+index), `20260509010000`(cert画像注釈列), `20260509010001`(注釈index), `20260510000000`(shop_orders status 拡張＝**checkout 中間ステータスのバグ修正**), `20260510000001`(同 validate), `20260511000003`(tenants SSO index), `20260514000001`(demo tenant readonly policy 9本), `20260531000001`(**AI auto_actions 列**), `20260531000005`(doc_share 一意index), `20260531000007`(**AI monthly_cost_cap 列**), `20260531000008`(**ai_usage_logs.cost_jpy 列**)。
  - **CONCURRENTLY index 7本**は `apply_migration`（暗黙トランザクション）では実行不可のため `execute_sql` で単文・トランザクション外で作成した。
  - 注意: 太字の AI 系列（auto_actions / monthly_cost_cap / cost_jpy）が本番に欠落していたため、AI 自動化・供給 auto-send 機能はこれらを参照する経路で正しく動作していなかった可能性がある。今回の適用で解消。

#### 🐞 発見・修正したバグ: `notification_logs.created_at` は存在しない（正は `sent_at`）
`notification_logs` テーブルは元定義（`20260315000000`）で時刻列が **`sent_at`** だが、以下が存在しない `created_at` を参照していた:
- migration `20260429000004_perf_indexes_round3.sql`: index 定義（→ `sent_at` に修正、本番にも `sent_at` で作成）
- `src/app/api/cron/low-stock-alerts/route.ts`: low_stock_alert の日次冪等チェック `.gte("created_at", …)`（→ `sent_at`）。壊れていたため**重複アラート送信のリスク**があった（しかも供給 auto-send が乗る経路）。
- `src/app/api/cron/data-retention/route.ts`: notification_logs の 180 日 GC ルール column（→ `sent_at`）。壊れていたため**古いログが削除されていなかった**。

> 注（検証法の限界）: 列/index/制約は実在を直接突合できるが、`CREATE TABLE IF NOT EXISTS` で既存テーブルに当たりつつ同 migration 内の別 ALTER だけ未適用、といった複合ケースは代表オブジェクト1点突合では見逃し得る（残存リスク低）。今回 `shop_orders_status_check` は「制約は valid だが定義が旧値のまま（再定義未適用）」という偽陽性を `pg_get_constraintdef` の定義突合で検出できた。

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

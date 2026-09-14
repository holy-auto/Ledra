-- 【後から内容だけ修正】このファイルは本番へ適用済み（版番号は変えていない）。
-- **CONCURRENTLY を外した。** Supabase のブランチ機能はマイグレーションの複数文を
-- パイプラインで送るため、2文目以降の CONCURRENTLY が
-- `CREATE INDEX CONCURRENTLY cannot be executed within a pipeline (SQLSTATE 25001)`
-- で落ちる。CONCURRENTLY が要るのは「書き込みが走っている本番のテーブルをロックしない」
-- ためで、このファイルは本番では再適用されず、空 DB では対象テーブルが空なので
-- ロックの問題は起きない。
-- 新しいファイルで CONCURRENTLY を使うときは **1ファイル1文** にすること
-- （`npm run lint:migrations` の concurrently-in-multi-statement-file が見ている）。
-- Keep high-frequency storefront and fair cron scans index-backed without
-- blocking production writes while the indexes are built.

create index if not exists idx_reservations_tenant_date_status
  on public.reservations (tenant_id, scheduled_date, status);

create index if not exists idx_tenants_gcal_sync_fairness
  on public.tenants (gcal_last_synced_at nulls first)
  where is_active = true and gcal_sync_enabled = true;

create index if not exists idx_accounting_integrations_sync_fairness
  on public.accounting_integrations (last_synced_at nulls first)
  where status = 'active' and auto_sync_enabled = true;

create index if not exists idx_customers_tenant_email_normalized
  on public.customers (tenant_id, lower(email))
  where email is not null;

create index if not exists idx_customers_tenant_phone_normalized
  on public.customers (tenant_id, regexp_replace(phone, '[^0-9]', '', 'g'))
  where phone is not null;

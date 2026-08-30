-- Keep high-frequency storefront and fair cron scans index-backed without
-- blocking production writes while the indexes are built.

create index concurrently if not exists idx_reservations_tenant_date_status
  on public.reservations (tenant_id, scheduled_date, status);

create index concurrently if not exists idx_tenants_gcal_sync_fairness
  on public.tenants (gcal_last_synced_at nulls first)
  where is_active = true and gcal_sync_enabled = true;

create index concurrently if not exists idx_accounting_integrations_sync_fairness
  on public.accounting_integrations (last_synced_at nulls first)
  where status = 'active' and auto_sync_enabled = true;

create index concurrently if not exists idx_customers_tenant_email_normalized
  on public.customers (tenant_id, lower(email))
  where email is not null;

create index concurrently if not exists idx_customers_tenant_phone_normalized
  on public.customers (tenant_id, regexp_replace(phone, '[^0-9]', '', 'g'))
  where phone is not null;

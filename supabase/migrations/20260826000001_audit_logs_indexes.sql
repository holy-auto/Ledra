-- ============================================================
-- audit_logs の索引。CONCURRENTLY はトランザクション内で流せないため、
-- 20260823000000（列と制約の調整）とは別ファイルに分ける。
-- ============================================================

create index concurrently if not exists idx_audit_logs_tenant_performed
  on public.audit_logs (tenant_id, performed_at desc);

-- 顧客ポータルの閲覧履歴が target_public_id で引くため
create index concurrently if not exists idx_audit_logs_target_public_id
  on public.audit_logs (target_public_id)
  where target_public_id is not null;

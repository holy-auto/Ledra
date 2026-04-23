-- =============================================================
-- insurer_access_logs に tenant_id を追加
-- =============================================================
-- 背景:
--   insurer_access_logs は insurer_id / certificate_id しか持たないため、
--   「テナント単位で誰が何を見たか」を出力・保全するには certificates 経由の
--   JOIN が必須となり、analytics・audit・retention の各 API で full scan が
--   発生していた。また、RLS を tenant スコープで張れないため GDPR/PPC の
--   観点でも tenant_id カラムが必要。
--
-- 変更内容:
--   1) tenant_id uuid カラムを nullable で追加 (後方互換)
--   2) 既存行の backfill  (certificates 経由 → tenant 経由 → null のまま)
--   3) (tenant_id, created_at DESC) の複合インデックスを作成
--   4) INSERT 時に tenant_id が NULL の場合、certificate → tenant で自動補完
--      するトリガーを追加 (アプリ側の書き忘れに対するフェイルセーフ)
-- =============================================================

-- 1) カラム追加 (nullable)
alter table if exists insurer_access_logs
  add column if not exists tenant_id uuid;

-- 2) 既存データの backfill — certificate_id が紐づくもののみ
update insurer_access_logs ial
set tenant_id = c.tenant_id
from certificates c
where ial.certificate_id = c.id
  and ial.tenant_id is null;

-- 3) analytics 用の複合インデックス
create index if not exists idx_ial_tenant_created
  on insurer_access_logs (tenant_id, created_at desc);

-- 4) INSERT 時の自動補完トリガー
create or replace function fn_insurer_access_logs_fill_tenant()
returns trigger
language plpgsql
as $$
begin
  if new.tenant_id is null and new.certificate_id is not null then
    select c.tenant_id into new.tenant_id
    from certificates c
    where c.id = new.certificate_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_insurer_access_logs_fill_tenant on insurer_access_logs;
create trigger trg_insurer_access_logs_fill_tenant
  before insert on insurer_access_logs
  for each row
  execute function fn_insurer_access_logs_fill_tenant();

comment on column insurer_access_logs.tenant_id is
  'Tenant scope of the accessed resource. Auto-filled from certificates on INSERT if NULL.';

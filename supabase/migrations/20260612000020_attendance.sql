-- =============================================================
-- スタッフ勤怠管理 (Staff Attendance / Time Card) Migration
--
-- スタッフの日次の出勤(clock_in)/退勤(clock_out)を記録する。
-- 実働時間(work_minutes)は (clock_out - clock_in) - break_minutes を
-- 生成列(generated column)で算出して月次集計に利用する。
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する。
--      - SELECT: テナントメンバーは閲覧可
--      - INSERT/UPDATE: 各ユーザは自分のレコードのみ操作可。
--        管理者(admin/owner/super_admin)は任意レコードを更新可。
--      - DELETE: 管理者のみ。
-- =============================================================

create table if not exists attendance_records (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants (id) on delete cascade,
  user_id         uuid not null,        -- auth.users id
  staff_name      text,                 -- スナップショット
  work_date       date not null,
  clock_in        timestamptz,
  clock_out       timestamptz,
  break_minutes   integer not null default 0 check (break_minutes >= 0),
  -- 実働時間 (分) = (clock_out - clock_in) - break_minutes。NULL可 (未退勤)
  work_minutes    integer generated always as (
    case
      when clock_out is not null and clock_in is not null
      then greatest(0, extract(epoch from (clock_out - clock_in))::integer / 60 - break_minutes)
      else null
    end
  ) stored,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, user_id, work_date)
);

create index if not exists idx_ar_tenant_date on attendance_records (tenant_id, work_date);
create index if not exists idx_ar_user on attendance_records (tenant_id, user_id);

alter table attendance_records enable row level security;

-- SELECT: テナントメンバーは閲覧可 (個人/管理者の絞り込みは API 側で実施)
drop policy if exists "attendance_select" on attendance_records;
create policy "attendance_select" on attendance_records
  for select using (tenant_id in (select my_tenant_ids()));

-- INSERT: 自テナント かつ 自分のレコードのみ
drop policy if exists "attendance_insert_own" on attendance_records;
create policy "attendance_insert_own" on attendance_records
  for insert with check (
    tenant_id in (select my_tenant_ids())
    and user_id = auth.uid()
  );

-- UPDATE: 自テナント かつ 自分のレコードのみ
drop policy if exists "attendance_update_own" on attendance_records;
create policy "attendance_update_own" on attendance_records
  for update using (
    tenant_id in (select my_tenant_ids())
    and user_id = auth.uid()
  )
  with check (
    tenant_id in (select my_tenant_ids())
    and user_id = auth.uid()
  );

-- UPDATE: 管理者(admin/owner/super_admin)は同テナントの任意レコードを更新可
drop policy if exists "attendance_update_admin" on attendance_records;
create policy "attendance_update_admin" on attendance_records
  for update using (
    tenant_id in (select my_tenant_ids())
    and exists (
      select 1 from tenant_memberships tm
      where tm.tenant_id = attendance_records.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'owner', 'super_admin')
    )
  )
  with check (
    tenant_id in (select my_tenant_ids())
    and exists (
      select 1 from tenant_memberships tm
      where tm.tenant_id = attendance_records.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'owner', 'super_admin')
    )
  );

-- INSERT: 管理者は同テナントの任意レコードを作成可 (代理打刻 / 手動登録)
drop policy if exists "attendance_insert_admin" on attendance_records;
create policy "attendance_insert_admin" on attendance_records
  for insert with check (
    tenant_id in (select my_tenant_ids())
    and exists (
      select 1 from tenant_memberships tm
      where tm.tenant_id = attendance_records.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'owner', 'super_admin')
    )
  );

-- DELETE: 管理者(admin/owner/super_admin)のみ
drop policy if exists "attendance_delete_admin" on attendance_records;
create policy "attendance_delete_admin" on attendance_records
  for delete using (
    tenant_id in (select my_tenant_ids())
    and exists (
      select 1 from tenant_memberships tm
      where tm.tenant_id = attendance_records.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'owner', 'super_admin')
    )
  );

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists set_attendance_records_updated_at on attendance_records;
create trigger set_attendance_records_updated_at
  before update on attendance_records
  for each row execute function set_updated_at();

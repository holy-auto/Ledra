-- =============================================================
-- スタッフシフト管理 (Staff Shift Scheduling) Migration
--
-- 週次のシフト枠 (shift slot) をスタッフ単位で記録する。
-- 勤怠 (attendance_records) と shift_date で突き合わせ、
-- 「予定 (planned) vs 実績 (actual)」を比較表示する。
--
-- RLS: attendance_records と同じ方針 (my_tenant_ids() でテナント分離)。
--      - SELECT: テナントメンバーは閲覧可
--      - INSERT/UPDATE: 各ユーザは自分のレコード (user_id = auth.uid()) のみ。
--        管理者 (admin/owner/super_admin) は同テナントの任意レコードを操作可。
--      - DELETE: 自分のレコード または 管理者。
-- =============================================================

create table if not exists staff_shifts (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants (id) on delete cascade,
  user_id       uuid not null,        -- auth.users id
  staff_name    text,                 -- スナップショット
  shift_date    date not null,
  start_time    time not null,        -- 例: 09:00
  end_time      time not null,        -- 例: 18:00
  break_minutes integer not null default 60 check (break_minutes >= 0),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, user_id, shift_date)
);

create index if not exists idx_ss_tenant_date on staff_shifts (tenant_id, shift_date);
create index if not exists idx_ss_user on staff_shifts (tenant_id, user_id);

alter table staff_shifts enable row level security;

-- SELECT: テナントメンバーは閲覧可
drop policy if exists "staff_shifts_select" on staff_shifts;
create policy "staff_shifts_select" on staff_shifts
  for select using (tenant_id in (select my_tenant_ids()));

-- INSERT: 自テナント かつ 自分のレコードのみ
drop policy if exists "staff_shifts_insert_own" on staff_shifts;
create policy "staff_shifts_insert_own" on staff_shifts
  for insert with check (
    tenant_id in (select my_tenant_ids())
    and user_id = auth.uid()
  );

-- UPDATE: 自テナント かつ 自分のレコードのみ
drop policy if exists "staff_shifts_update_own" on staff_shifts;
create policy "staff_shifts_update_own" on staff_shifts
  for update using (
    tenant_id in (select my_tenant_ids())
    and user_id = auth.uid()
  )
  with check (
    tenant_id in (select my_tenant_ids())
    and user_id = auth.uid()
  );

-- INSERT: 管理者は同テナントの任意レコードを作成可 (シフト作成)
drop policy if exists "staff_shifts_insert_admin" on staff_shifts;
create policy "staff_shifts_insert_admin" on staff_shifts
  for insert with check (
    tenant_id in (select my_tenant_ids())
    and exists (
      select 1 from tenant_memberships tm
      where tm.tenant_id = staff_shifts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'owner', 'super_admin')
    )
  );

-- UPDATE: 管理者は同テナントの任意レコードを更新可
drop policy if exists "staff_shifts_update_admin" on staff_shifts;
create policy "staff_shifts_update_admin" on staff_shifts
  for update using (
    tenant_id in (select my_tenant_ids())
    and exists (
      select 1 from tenant_memberships tm
      where tm.tenant_id = staff_shifts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'owner', 'super_admin')
    )
  )
  with check (
    tenant_id in (select my_tenant_ids())
    and exists (
      select 1 from tenant_memberships tm
      where tm.tenant_id = staff_shifts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'owner', 'super_admin')
    )
  );

-- DELETE: 自分のレコード または 管理者
drop policy if exists "staff_shifts_delete_own" on staff_shifts;
create policy "staff_shifts_delete_own" on staff_shifts
  for delete using (
    tenant_id in (select my_tenant_ids())
    and user_id = auth.uid()
  );

drop policy if exists "staff_shifts_delete_admin" on staff_shifts;
create policy "staff_shifts_delete_admin" on staff_shifts
  for delete using (
    tenant_id in (select my_tenant_ids())
    and exists (
      select 1 from tenant_memberships tm
      where tm.tenant_id = staff_shifts.tenant_id
        and tm.user_id = auth.uid()
        and tm.role in ('admin', 'owner', 'super_admin')
    )
  );

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists set_staff_shifts_updated_at on staff_shifts;
create trigger set_staff_shifts_updated_at
  before update on staff_shifts
  for each row execute function set_updated_at();

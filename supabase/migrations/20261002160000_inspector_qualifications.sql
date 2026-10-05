-- G1: 法定資格に基づく操作の強制＋資格番号/有効期限の保持＋完成検査実施者の構造化。
--
-- 背景（docs/e-maintenance-record-compliance.md 第２ ３（１）①）:
--   点検整備記録簿の電子的方法の基準は利用者を「権限別」に登録・管理することを求め、その例として
--   「自動車検査員」等の法定資格を挙げる。自動車検査員に係る権限は **指定整備事業者に限る**。
--   2026-10-02（#1208）で保有の有無の軸（staff_members.qualifications）は追加済み。残っていたのが
--   (1) 資格に基づく操作の強制、(2) 資格番号・有効期限の保持、(3) 記録簿への実施者資格の紐付け。
--
-- 設計（追加のみ・非破壊）:
--   - (A) #2 資格の番号・有効期限は別表 staff_qualifications に任意で持つ。「保有の有無」は
--         引き続き staff_members.qualifications（text[]）が源泉。別表は保有資格の属性を足すだけ。
--   - (B) #3 完成検査（inspection_type='completion'＝指定整備記録簿）の実施者を staff に構造化して
--         紐付け（inspector_staff_id）、実施時点の資格をスナップショットで残す。既存の自由入力
--         inspector_name は外注（アカウント無し）用に併存。
--   - (C) #1 強制はテナント opt-in（tenants.require_inspector_qualification、既定 false）。
--         true の指定整備事業者でのみ、完成検査の実施者が有効な自動車検査員資格を持つことを必須化。
--         値の統制・有効期限判定はアプリ層（src/lib/staff/qualifications.ts・inspectorQualification.ts）。

-- (A) 資格の番号・有効期限（任意）。保有の有無は staff_members.qualifications が源泉。
create table if not exists staff_qualifications (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) on delete cascade,
  staff_member_id uuid not null references staff_members(id) on delete cascade,
  -- src/lib/staff/qualifications.ts のキー（vehicle_inspector 等）。値統制はアプリ層。
  qualification   text not null,
  -- 自動車検査員番号・整備主任者の選任番号など（任意）。
  number          text,
  -- 有効期限（任意。無ければ無期限扱い。判定はアプリ層が Asia/Tokyo の当日で行う）。
  expires_on      date,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, staff_member_id, qualification)
);
-- ponytail: staff_member_id 単独の索引は張らない。参照は unique(tenant_id, staff_member_id, qualification)
--   の先頭2列で足り、staff_members 削除時の cascade は tenant あたり数行の明細表の走査で済む。
--   明細が大規模化して削除が重くなったら staff_qualifications(staff_member_id) を足す。

alter table staff_qualifications enable row level security;

-- 直叩き対策。API は service role の tenant scoped admin で読み書きし RLS をバイパスするが、
-- 直接の Supabase クライアントからの参照・改ざんをテナントの管理ロールに限定する。
drop policy if exists "staff_qualifications_rw" on staff_qualifications;
create policy "staff_qualifications_rw" on staff_qualifications
  for all using (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']))
  with check (public.tenant_caller_has_role(tenant_id, array['super_admin', 'owner', 'admin']));

drop trigger if exists trg_staff_qualifications_updated_at on staff_qualifications;
create trigger trg_staff_qualifications_updated_at
  before update on staff_qualifications
  for each row execute function set_updated_at();

comment on table staff_qualifications is
  '法定資格の番号・有効期限（任意）。保有の有無は staff_members.qualifications が源泉。キー定義源: src/lib/staff/qualifications.ts（G1/#2）。';

-- (B) 完成検査の実施者を staff に構造化して紐付け、実施時点の資格をスナップショットで残す。
alter table inspection_records
  add column if not exists inspector_staff_id uuid references staff_members(id) on delete set null,
  add column if not exists inspector_qualification_snapshot jsonb;

comment on column inspection_records.inspector_staff_id is
  '完成検査の実施者（staff_members）。自由入力 inspector_name と併存（外注は ID 無しで氏名のみ）。G1/#3。';
comment on column inspection_records.inspector_qualification_snapshot is
  '実施時点の実施者の法定資格スナップショット（[{qualification,number,expires_on}]）。後の資格変更に影響されない記録。G1/#3。';

-- (C) 資格に基づく操作強制のテナント opt-in。既定 false（非破壊）。自動車検査員要件は指定整備事業者に限るため true は該当事業者のみ。
alter table tenants
  add column if not exists require_inspector_qualification boolean not null default false;

comment on column tenants.require_inspector_qualification is
  'true で完成検査（指定整備記録簿）の作成/更新時に実施者が有効な自動車検査員資格を持つことを必須化（第２ ３（１）①・指定整備事業者）。既定 false=非破壊。G1/#1。';

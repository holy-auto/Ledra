-- =============================================================
-- LINE一斉配信強化 (Segmented LINE Broadcast) Migration
-- セグメント条件で絞った顧客へ LINE 一斉配信を行い、配信状態と
-- 統計 (対象数・成功数・失敗数) を追跡する。
--
-- segment_json: { segment_type, filters }
--   - segment_type "all"          : line_user_id を持つ全顧客
--   - segment_type "no_visit_days" : filters.days で最終来店からの経過日で絞る
--   - segment_type "vehicle_type"  : filters.maker で車種(メーカー)指定
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する。INSERT / UPDATE は WITH CHECK で必ず自
--      テナントへスコープ限定する。
-- =============================================================

create table if not exists line_broadcasts (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants (id) on delete cascade,
  name            text not null,
  message_text    text not null check (char_length(message_text) <= 500),
  -- セグメント条件 (JSONB: { segment_type, filters })
  segment_json    jsonb not null default '{"segment_type":"all"}'::jsonb,
  -- 配信状態
  status          text not null default 'draft'
                    check (status in ('draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled')),
  scheduled_at    timestamptz,
  sent_at         timestamptz,
  -- 統計
  target_count    integer,
  sent_count      integer default 0,
  failed_count    integer default 0,
  -- 担当者 (auth.users id。cross-schema の複雑さを避けるため FK は張らない)
  created_by      uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_lb_tenant on line_broadcasts (tenant_id);
create index if not exists idx_lb_status on line_broadcasts (tenant_id, status);

alter table line_broadcasts enable row level security;

-- テナント分離 (SELECT / INSERT / UPDATE / DELETE を個別に付与)
drop policy if exists line_broadcasts_tenant_select on line_broadcasts;
create policy line_broadcasts_tenant_select on line_broadcasts
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists line_broadcasts_tenant_insert on line_broadcasts;
create policy line_broadcasts_tenant_insert on line_broadcasts
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists line_broadcasts_tenant_update on line_broadcasts;
create policy line_broadcasts_tenant_update on line_broadcasts
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists line_broadcasts_tenant_delete on line_broadcasts;
create policy line_broadcasts_tenant_delete on line_broadcasts
  for delete using (tenant_id in (select my_tenant_ids()));

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists set_line_broadcasts_updated_at on line_broadcasts;
create trigger set_line_broadcasts_updated_at
  before update on line_broadcasts
  for each row execute function set_updated_at();

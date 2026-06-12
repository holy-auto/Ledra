-- =============================================================
-- 顧客ランク管理 (Customer Loyalty Ranks) Migration
-- 来店回数・累計売上に基づいて顧客をランク分けする。
--   - customer_rank_rules : テナントごとのランク定義 (閾値カスタマイズ可能)
--   - customers に rank_id / total_spend / visit_count を追加し、定期バッチで更新
--
-- RLS: コア各テーブルと同じく security-definer ヘルパ my_tenant_ids() を
--      用いてテナント分離する (payment_entries / coupons 等と同方針)。
--      INSERT / UPDATE は WITH CHECK で必ず自テナントへスコープ限定する。
--      アプリ層では staff 以上のみ書込可、それ以外は読取のみ。
-- =============================================================

-- =============================================================
-- 1) customer_rank_rules : ランク定義
-- =============================================================
create table if not exists customer_rank_rules (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants (id) on delete cascade,
  rank_name       text not null,                   -- 例: "プラチナ", "ゴールド", "シルバー", "レギュラー"
  rank_order      integer not null,                -- 1 = 最高ランク
  min_visits      integer default 0,
  min_total_spend numeric(12, 0) default 0,
  badge_color     text default 'gray',             -- tailwind color name: gray/yellow/blue/purple
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, rank_order)
);

alter table customer_rank_rules enable row level security;

drop policy if exists customer_rank_rules_tenant_select on customer_rank_rules;
create policy customer_rank_rules_tenant_select on customer_rank_rules
  for select using (tenant_id in (select my_tenant_ids()));

drop policy if exists customer_rank_rules_tenant_insert on customer_rank_rules;
create policy customer_rank_rules_tenant_insert on customer_rank_rules
  for insert with check (tenant_id in (select my_tenant_ids()));

drop policy if exists customer_rank_rules_tenant_update on customer_rank_rules;
create policy customer_rank_rules_tenant_update on customer_rank_rules
  for update using (tenant_id in (select my_tenant_ids()))
  with check (tenant_id in (select my_tenant_ids()));

drop policy if exists customer_rank_rules_tenant_delete on customer_rank_rules;
create policy customer_rank_rules_tenant_delete on customer_rank_rules
  for delete using (tenant_id in (select my_tenant_ids()));

-- customer_rank_rules は同一マイグレーション内で CREATE TABLE 済み (空テーブル)
-- のため CONCURRENTLY 不要 (lint-migrations: create-index-without-concurrently)。
create index if not exists idx_crr_tenant on customer_rank_rules (tenant_id);

-- updated_at 自動更新 (core_tables の set_updated_at() を再利用)
drop trigger if exists trg_customer_rank_rules_updated_at on customer_rank_rules;
create trigger trg_customer_rank_rules_updated_at
  before update on customer_rank_rules
  for each row execute function set_updated_at();

-- =============================================================
-- 2) customers : 現在ランク / 集計値カラム追加
--    すべて nullable / DEFAULT 付きのため既存行を書き換えない
--    (lint-migrations: add-column-not-null-without-default 非該当)。
--    rank_id は inline column FK (ADD CONSTRAINT ではない) のため
--    add-foreign-key-without-not-valid 非該当。
-- =============================================================
alter table customers add column if not exists rank_id uuid references customer_rank_rules (id) on delete set null;
alter table customers add column if not exists total_spend numeric(12, 0) default 0;
alter table customers add column if not exists visit_count integer default 0;

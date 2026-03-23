-- ヒアリングチェックシートテーブル
create table if not exists hearings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  customer_id uuid references customers(id) on delete set null,
  vehicle_id uuid references vehicles(id) on delete set null,
  status text not null default 'draft' check (status in ('draft', 'completed', 'linked')),

  -- 基本情報
  customer_name text not null default '',
  customer_phone text default '',
  customer_email text default '',

  -- 車両情報
  vehicle_maker text default '',
  vehicle_model text default '',
  vehicle_year int,
  vehicle_plate text default '',
  vehicle_color text default '',
  vehicle_vin text default '',

  -- ヒアリング内容
  service_type text default '' check (service_type in ('', 'coating', 'ppf', 'maintenance', 'body_repair', 'wrapping', 'window_film', 'other')),
  vehicle_size text default '' check (vehicle_size in ('', 'SS', 'S', 'M', 'L', 'LL', 'XL')),
  coating_history text default '',
  desired_menu text default '',
  budget_range text default '',
  concern_areas text default '',
  scratches_dents text default '',
  parking_environment text default '',
  usage_frequency text default '',
  additional_requests text default '',

  -- JSON拡張フィールド
  hearing_json jsonb default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table hearings enable row level security;

create policy "hearings_tenant_select" on hearings for select using (
  tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid())
);
create policy "hearings_tenant_insert" on hearings for insert with check (
  tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid())
);
create policy "hearings_tenant_update" on hearings for update using (
  tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid())
);
create policy "hearings_tenant_delete" on hearings for delete using (
  tenant_id in (select tenant_id from tenant_memberships where user_id = auth.uid())
);

-- Index
create index if not exists idx_hearings_tenant on hearings(tenant_id);
create index if not exists idx_hearings_customer on hearings(customer_id);

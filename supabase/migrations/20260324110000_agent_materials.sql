-- =============================================================
-- Agent Materials (営業資料) Migration
-- Shared documents/materials from HQ to agents
-- =============================================================

-- =============================================================
-- 1) agent_material_categories — 資料カテゴリ
-- =============================================================
create table if not exists agent_material_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text unique not null,
  sort_order  integer not null default 0,
  description text,
  created_at  timestamptz not null default now()
);

-- Default categories
insert into agent_material_categories (name, slug, sort_order, description) values
  ('営業資料',     'sales',       1, '提案書・パンフレット・料金表など'),
  ('契約書類',     'contracts',   2, '契約書テンプレート・申込書など'),
  ('マニュアル',   'manuals',     3, '操作マニュアル・導入ガイドなど'),
  ('販促素材',     'promotional', 4, 'チラシ・バナー・SNS用素材など'),
  ('研修資料',     'training',    5, '研修動画・プレゼン資料など'),
  ('その他',       'other',       99, 'その他の資料')
on conflict (slug) do nothing;

-- =============================================================
-- 2) agent_materials — 営業資料ファイル
-- =============================================================
create table if not exists agent_materials (
  id            uuid primary key default gen_random_uuid(),
  category_id   uuid not null references agent_material_categories (id) on delete cascade,
  title         text not null,
  description   text,
  file_name     text not null,
  file_size     bigint not null default 0,
  file_type     text not null default 'application/pdf',
  storage_path  text not null,
  version       text,
  is_published  boolean not null default true,
  is_pinned     boolean not null default false,
  download_count integer not null default 0,
  uploaded_by   uuid references auth.users (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_am_category on agent_materials (category_id);
create index if not exists idx_am_published on agent_materials (is_published, created_at desc);

-- =============================================================
-- 3) agent_material_downloads — ダウンロード記録
-- =============================================================
create table if not exists agent_material_downloads (
  id            uuid primary key default gen_random_uuid(),
  material_id   uuid not null references agent_materials (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  agent_id      uuid not null references agents (id) on delete cascade,
  downloaded_at timestamptz not null default now()
);

create index if not exists idx_amd_material on agent_material_downloads (material_id);
create index if not exists idx_amd_agent on agent_material_downloads (agent_id);

-- =============================================================
-- 4) RLS Policies
-- =============================================================
alter table agent_material_categories enable row level security;
alter table agent_materials enable row level security;
alter table agent_material_downloads enable row level security;

-- Categories: all agent users can read
create policy "amc_select" on agent_material_categories
  for select using (exists (select 1 from my_agent_ids()));

-- Materials: agent users can read published materials
create policy "am_select" on agent_materials
  for select using (
    is_published = true
    and exists (select 1 from my_agent_ids())
  );

-- Downloads: users can see their own downloads
create policy "amd_select" on agent_material_downloads
  for select using (user_id = auth.uid());

-- Downloads: users can insert their own download records
create policy "amd_insert" on agent_material_downloads
  for insert with check (user_id = auth.uid());

-- =============================================================
-- 5) updated_at trigger
-- =============================================================
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_agent_materials_updated_at') then
    create trigger trg_agent_materials_updated_at
      before update on agent_materials
      for each row execute function set_updated_at();
  end if;
end $$;

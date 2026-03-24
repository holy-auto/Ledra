-- =============================================================
-- Agent (代理店) Portal Migration
-- Creates tables, RLS policies, RPC functions for the
-- agent/dealer portal — referral-based commission model.
-- =============================================================

-- =============================================================
-- 1) agents — 代理店エンティティ
-- =============================================================
create table if not exists agents (
  id                     uuid primary key default gen_random_uuid(),
  name                   text not null,
  slug                   text unique,
  status                 text not null default 'active_pending_review'
                           check (status in ('active_pending_review', 'active', 'suspended')),
  contact_name           text,
  contact_email          text,
  contact_phone          text,
  address                text,
  line_official_id       text,

  -- Stripe Connect for payouts
  stripe_account_id      text,
  stripe_onboarding_done boolean not null default false,

  -- Commission defaults (can be overridden per referral)
  default_commission_rate numeric(5,2) not null default 10.00,
  commission_type        text not null default 'percentage'
                           check (commission_type in ('percentage', 'fixed')),
  default_commission_fixed integer not null default 0,

  -- Metadata
  logo_asset_path        text,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create index if not exists idx_agents_slug on agents (slug);
create index if not exists idx_agents_stripe on agents (stripe_account_id) where stripe_account_id is not null;
create index if not exists idx_agents_status on agents (status);

-- =============================================================
-- 2) agent_users — 代理店ユーザー（スタッフ）
-- =============================================================
create table if not exists agent_users (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references agents (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'viewer'
                 check (role in ('admin', 'staff', 'viewer')),
  display_name text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (agent_id, user_id)
);

create index if not exists idx_au_user on agent_users (user_id);
create index if not exists idx_au_agent on agent_users (agent_id);

-- =============================================================
-- 3) agent_referrals — 代理店紹介実績
--    Tracks tenants referred by agents
-- =============================================================
create table if not exists agent_referrals (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references agents (id) on delete cascade,
  tenant_id       uuid references tenants (id) on delete set null,

  -- Referral info
  referral_code   text unique not null default 'REF-' || upper(substr(gen_random_uuid()::text, 1, 8)),
  shop_name       text not null,
  contact_name    text,
  contact_email   text,
  contact_phone   text,
  notes           text,

  -- Status tracking
  status          text not null default 'pending'
                    check (status in (
                      'pending',           -- 紹介登録済み（審査前）
                      'contacted',         -- 連絡済み
                      'in_negotiation',    -- 商談中
                      'trial',             -- トライアル中
                      'contracted',        -- 契約成立
                      'cancelled',         -- キャンセル
                      'churned'            -- 解約
                    )),

  -- Commission override for this specific referral
  commission_rate  numeric(5,2),
  commission_type  text check (commission_type in ('percentage', 'fixed')),
  commission_fixed integer,

  contracted_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_ar_agent on agent_referrals (agent_id);
create index if not exists idx_ar_tenant on agent_referrals (tenant_id) where tenant_id is not null;
create index if not exists idx_ar_status on agent_referrals (status);
create index if not exists idx_ar_code on agent_referrals (referral_code);

-- =============================================================
-- 4) agent_commissions — コミッション発生レコード
-- =============================================================
create table if not exists agent_commissions (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references agents (id) on delete cascade,
  referral_id     uuid not null references agent_referrals (id) on delete cascade,
  tenant_id       uuid references tenants (id) on delete set null,

  -- Commission details
  period_start    date not null,
  period_end      date not null,
  base_amount     integer not null default 0,
  commission_rate numeric(5,2) not null,
  commission_type text not null default 'percentage',
  amount          integer not null default 0,
  currency        text not null default 'jpy',

  -- Payout tracking
  status          text not null default 'pending'
                    check (status in (
                      'pending',      -- 計算済み未払い
                      'approved',     -- 承認済み
                      'paid',         -- 支払い済み
                      'failed',       -- 支払い失敗
                      'cancelled'     -- キャンセル
                    )),
  stripe_transfer_id text,
  paid_at         timestamptz,

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_ac_agent on agent_commissions (agent_id);
create index if not exists idx_ac_referral on agent_commissions (referral_id);
create index if not exists idx_ac_status on agent_commissions (status);
create index if not exists idx_ac_period on agent_commissions (period_start, period_end);

-- =============================================================
-- 5) agent_announcements — 本部→代理店 お知らせ
-- =============================================================
create table if not exists agent_announcements (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  body        text not null,
  category    text not null default 'general'
                check (category in ('general', 'campaign', 'system', 'important')),
  is_pinned   boolean not null default false,
  published_at timestamptz,
  created_by  uuid references auth.users (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_aa_published on agent_announcements (published_at desc)
  where published_at is not null;

-- =============================================================
-- 6) agent_announcement_reads — 既読管理
-- =============================================================
create table if not exists agent_announcement_reads (
  id              uuid primary key default gen_random_uuid(),
  announcement_id uuid not null references agent_announcements (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  read_at         timestamptz not null default now(),
  unique (announcement_id, user_id)
);

-- =============================================================
-- 7) RLS Policies
-- =============================================================
alter table agents enable row level security;
alter table agent_users enable row level security;
alter table agent_referrals enable row level security;
alter table agent_commissions enable row level security;
alter table agent_announcements enable row level security;
alter table agent_announcement_reads enable row level security;

-- Helper: get agent_ids the current user belongs to
create or replace function my_agent_ids()
returns setof uuid
language sql stable security definer
as $$
  select agent_id
  from agent_users
  where user_id = auth.uid()
    and is_active = true;
$$;

-- agents: read own agent
create policy "agents_select" on agents
  for select using (id in (select my_agent_ids()));

-- agent_users: read own agent's members
create policy "au_select" on agent_users
  for select using (agent_id in (select my_agent_ids()));

-- agent_users: admin can manage within own agent
create policy "au_insert" on agent_users
  for insert with check (
    agent_id in (select my_agent_ids())
    and exists (
      select 1 from agent_users au
      where au.user_id = auth.uid()
        and au.agent_id = agent_users.agent_id
        and au.role = 'admin'
        and au.is_active = true
    )
  );

create policy "au_update" on agent_users
  for update using (
    agent_id in (select my_agent_ids())
    and exists (
      select 1 from agent_users au
      where au.user_id = auth.uid()
        and au.agent_id = agent_users.agent_id
        and au.role = 'admin'
        and au.is_active = true
    )
  );

-- agent_referrals: agents can see their own referrals
create policy "ar_select" on agent_referrals
  for select using (agent_id in (select my_agent_ids()));

-- agent_referrals: admin/staff can create referrals
create policy "ar_insert" on agent_referrals
  for insert with check (
    agent_id in (select my_agent_ids())
    and exists (
      select 1 from agent_users au
      where au.user_id = auth.uid()
        and au.agent_id = agent_referrals.agent_id
        and au.role in ('admin', 'staff')
        and au.is_active = true
    )
  );

-- agent_referrals: admin/staff can update referrals
create policy "ar_update" on agent_referrals
  for update using (
    agent_id in (select my_agent_ids())
    and exists (
      select 1 from agent_users au
      where au.user_id = auth.uid()
        and au.agent_id = agent_referrals.agent_id
        and au.role in ('admin', 'staff')
        and au.is_active = true
    )
  );

-- agent_commissions: agents can view their own commissions
create policy "ac_select" on agent_commissions
  for select using (agent_id in (select my_agent_ids()));

-- agent_announcements: all authenticated agents can read published announcements
create policy "aa_select" on agent_announcements
  for select using (
    published_at is not null
    and published_at <= now()
    and exists (select 1 from my_agent_ids())
  );

-- agent_announcement_reads: users manage their own reads
create policy "aar_select" on agent_announcement_reads
  for select using (user_id = auth.uid());

create policy "aar_insert" on agent_announcement_reads
  for insert with check (user_id = auth.uid());

-- =============================================================
-- 8) RPC: is_agent_admin()
-- =============================================================
create or replace function is_agent_admin()
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from agent_users
    where user_id = auth.uid()
      and role = 'admin'
      and is_active = true
  );
$$;

-- =============================================================
-- 9) RPC: get_my_agent_status()
-- =============================================================
create or replace function get_my_agent_status()
returns table (
  agent_id uuid,
  status   text,
  role     text,
  agent_name text
)
language sql stable security definer
as $$
  select
    a.id as agent_id,
    a.status,
    au.role,
    a.name as agent_name
  from agent_users au
  join agents a on a.id = au.agent_id
  where au.user_id = auth.uid()
    and au.is_active = true
  limit 1;
$$;

-- =============================================================
-- 10) RPC: agent_dashboard_stats()
-- =============================================================
create or replace function agent_dashboard_stats(p_agent_id uuid)
returns jsonb
language plpgsql stable security definer
as $$
declare
  v_result jsonb;
begin
  -- Verify caller is an active agent user for this agent
  if not exists (
    select 1 from agent_users
    where user_id = auth.uid()
      and agent_id = p_agent_id
      and is_active = true
  ) then
    raise exception 'Not an active agent user';
  end if;

  select jsonb_build_object(
    'total_referrals', (
      select count(*) from agent_referrals where agent_id = p_agent_id
    ),
    'pending_referrals', (
      select count(*) from agent_referrals where agent_id = p_agent_id and status = 'pending'
    ),
    'contracted_referrals', (
      select count(*) from agent_referrals where agent_id = p_agent_id and status = 'contracted'
    ),
    'in_negotiation_referrals', (
      select count(*) from agent_referrals where agent_id = p_agent_id and status = 'in_negotiation'
    ),
    'trial_referrals', (
      select count(*) from agent_referrals where agent_id = p_agent_id and status = 'trial'
    ),
    'total_commission_amount', (
      select coalesce(sum(amount), 0) from agent_commissions where agent_id = p_agent_id and status in ('approved', 'paid')
    ),
    'pending_commission_amount', (
      select coalesce(sum(amount), 0) from agent_commissions where agent_id = p_agent_id and status = 'pending'
    ),
    'paid_commission_amount', (
      select coalesce(sum(amount), 0) from agent_commissions where agent_id = p_agent_id and status = 'paid'
    ),
    'this_month_commissions', (
      select coalesce(sum(amount), 0) from agent_commissions
      where agent_id = p_agent_id
        and status in ('pending', 'approved', 'paid')
        and period_start >= date_trunc('month', current_date)
    ),
    'conversion_rate', (
      select case
        when count(*) = 0 then 0
        else round(count(*) filter (where status = 'contracted')::numeric / count(*)::numeric * 100, 1)
      end
      from agent_referrals where agent_id = p_agent_id
    ),
    'recent_referrals', (
      select coalesce(jsonb_agg(row_to_json(r)::jsonb order by r.created_at desc), '[]'::jsonb)
      from (
        select shop_name, status, created_at
        from agent_referrals
        where agent_id = p_agent_id
        order by created_at desc
        limit 5
      ) r
    ),
    'monthly_commissions', (
      select coalesce(jsonb_agg(row_to_json(m)::jsonb order by m.month), '[]'::jsonb)
      from (
        select
          to_char(period_start, 'YYYY-MM') as month,
          sum(amount) as total
        from agent_commissions
        where agent_id = p_agent_id
          and status in ('approved', 'paid')
          and period_start >= current_date - interval '6 months'
        group by to_char(period_start, 'YYYY-MM')
      ) m
    ),
    'unread_announcements', (
      select count(*)
      from agent_announcements aa
      where aa.published_at is not null
        and aa.published_at <= now()
        and not exists (
          select 1 from agent_announcement_reads aar
          where aar.announcement_id = aa.id
            and aar.user_id = auth.uid()
        )
    )
  ) into v_result;

  return v_result;
end;
$$;

-- =============================================================
-- 11) RPC: upsert_agent_user
-- =============================================================
create or replace function upsert_agent_user(
  p_agent_id     uuid,
  p_email        text,
  p_role         text default 'viewer',
  p_display_name text default null
)
returns uuid
language plpgsql security definer
as $$
declare
  v_user_id uuid;
  v_au_id uuid;
begin
  select au.id into v_user_id
  from auth.users au
  where lower(au.email) = lower(p_email)
  limit 1;

  if v_user_id is null then
    raise exception 'Auth user not found for email: %', p_email;
  end if;

  insert into agent_users (agent_id, user_id, role, display_name, is_active)
  values (p_agent_id, v_user_id, p_role, p_display_name, true)
  on conflict (agent_id, user_id)
  do update set
    role = excluded.role,
    display_name = coalesce(excluded.display_name, agent_users.display_name),
    is_active = true,
    updated_at = now()
  returning id into v_au_id;

  return v_au_id;
end;
$$;

-- =============================================================
-- 12) Platform helper: agent count
-- =============================================================
create or replace function platform_agent_count()
returns bigint
language sql stable security definer
as $$
  select count(*) from agents;
$$;

-- =============================================================
-- 13) updated_at triggers
-- =============================================================
do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_agents_updated_at') then
    create trigger trg_agents_updated_at
      before update on agents
      for each row execute function set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_agent_users_updated_at') then
    create trigger trg_agent_users_updated_at
      before update on agent_users
      for each row execute function set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_agent_referrals_updated_at') then
    create trigger trg_agent_referrals_updated_at
      before update on agent_referrals
      for each row execute function set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_agent_commissions_updated_at') then
    create trigger trg_agent_commissions_updated_at
      before update on agent_commissions
      for each row execute function set_updated_at();
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'trg_agent_announcements_updated_at') then
    create trigger trg_agent_announcements_updated_at
      before update on agent_announcements
      for each row execute function set_updated_at();
  end if;
end $$;

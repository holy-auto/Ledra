-- =============================================================
-- Agent Portal Additional Features Migration
-- 1) Notifications  2) Referral Links  3) FAQ
-- 4) Support Tickets  5) Campaigns  6) Rankings
-- 7) Training/e-Learning  8) Invoices
-- =============================================================

-- =============================================================
-- 1) agent_notifications — 通知センター
-- =============================================================
create table if not exists agent_notifications (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references agents (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  type         text not null default 'info'
                 check (type in ('info','referral_status','commission','campaign','system')),
  title        text not null,
  body         text,
  link         text,
  is_read      boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists idx_an_agent on agent_notifications (agent_id, is_read, created_at desc);
create index if not exists idx_an_user on agent_notifications (user_id);

alter table agent_notifications enable row level security;
create policy "an_select" on agent_notifications for select
  using (agent_id in (select my_agent_ids()));
create policy "an_update" on agent_notifications for update
  using (agent_id in (select my_agent_ids()));

-- =============================================================
-- 2) agent_referral_links — 紹介リンク・QRコード
-- =============================================================
create table if not exists agent_referral_links (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references agents (id) on delete cascade,
  code         text unique not null default 'AL-' || upper(substr(gen_random_uuid()::text, 1, 8)),
  label        text,
  url          text not null,
  click_count  integer not null default 0,
  is_active    boolean not null default true,
  created_by   uuid references auth.users (id),
  created_at   timestamptz not null default now()
);
create index if not exists idx_arl_agent on agent_referral_links (agent_id);
create index if not exists idx_arl_code on agent_referral_links (code);

alter table agent_referral_links enable row level security;
create policy "arl_select" on agent_referral_links for select
  using (agent_id in (select my_agent_ids()));
create policy "arl_insert" on agent_referral_links for insert
  with check (agent_id in (select my_agent_ids()));

-- =============================================================
-- 3) agent_faq_categories + agent_faqs — FAQ・ナレッジベース
-- =============================================================
create table if not exists agent_faq_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text unique not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into agent_faq_categories (name, slug, sort_order) values
  ('サービス概要', 'service',     1),
  ('料金・プラン', 'pricing',     2),
  ('契約・手続き', 'contracts',   3),
  ('営業ノウハウ', 'sales-tips',  4),
  ('技術・操作',   'technical',   5),
  ('その他',       'other',       99)
on conflict (slug) do nothing;

create table if not exists agent_faqs (
  id           uuid primary key default gen_random_uuid(),
  category_id  uuid not null references agent_faq_categories (id) on delete cascade,
  question     text not null,
  answer       text not null,
  sort_order   integer not null default 0,
  is_published boolean not null default true,
  view_count   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_afaq_cat on agent_faqs (category_id);

alter table agent_faq_categories enable row level security;
alter table agent_faqs enable row level security;
create policy "afaqc_select" on agent_faq_categories for select
  using (exists (select 1 from my_agent_ids()));
create policy "afaq_select" on agent_faqs for select
  using (is_published = true and exists (select 1 from my_agent_ids()));

-- =============================================================
-- 4) agent_support_tickets + agent_ticket_messages — サポートチケット
-- =============================================================
create table if not exists agent_support_tickets (
  id           uuid primary key default gen_random_uuid(),
  agent_id     uuid not null references agents (id) on delete cascade,
  user_id      uuid not null references auth.users (id),
  subject      text not null,
  category     text not null default 'general'
                 check (category in ('general','billing','technical','contract','other')),
  status       text not null default 'open'
                 check (status in ('open','in_progress','awaiting_reply','resolved','closed')),
  priority     text not null default 'normal'
                 check (priority in ('low','normal','high','urgent')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_ast_agent on agent_support_tickets (agent_id, status);

create table if not exists agent_ticket_messages (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references agent_support_tickets (id) on delete cascade,
  sender_id  uuid not null references auth.users (id),
  is_admin   boolean not null default false,
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_atm_ticket on agent_ticket_messages (ticket_id, created_at);

alter table agent_support_tickets enable row level security;
alter table agent_ticket_messages enable row level security;
create policy "ast_select" on agent_support_tickets for select
  using (agent_id in (select my_agent_ids()));
create policy "ast_insert" on agent_support_tickets for insert
  with check (agent_id in (select my_agent_ids()));
create policy "ast_update" on agent_support_tickets for update
  using (agent_id in (select my_agent_ids()));
create policy "atm_select" on agent_ticket_messages for select
  using (ticket_id in (select id from agent_support_tickets where agent_id in (select my_agent_ids())));
create policy "atm_insert" on agent_ticket_messages for insert
  with check (ticket_id in (select id from agent_support_tickets where agent_id in (select my_agent_ids())));

-- =============================================================
-- 5) agent_campaigns — キャンペーン管理
-- =============================================================
create table if not exists agent_campaigns (
  id               uuid primary key default gen_random_uuid(),
  title            text not null,
  description      text,
  campaign_type    text not null default 'commission_boost'
                     check (campaign_type in ('commission_boost','bonus','referral_bonus','other')),
  bonus_rate       numeric(5,2),
  bonus_fixed      integer,
  start_date       date not null,
  end_date         date not null,
  is_active        boolean not null default true,
  target_agents    text not null default 'all'
                     check (target_agents in ('all','selected')),
  banner_text      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists agent_campaign_agents (
  campaign_id uuid not null references agent_campaigns (id) on delete cascade,
  agent_id    uuid not null references agents (id) on delete cascade,
  primary key (campaign_id, agent_id)
);

alter table agent_campaigns enable row level security;
alter table agent_campaign_agents enable row level security;
create policy "ac_select" on agent_campaigns for select
  using (
    is_active = true
    and exists (select 1 from my_agent_ids())
    and (
      target_agents = 'all'
      or id in (
        select campaign_id from agent_campaign_agents
        where agent_id in (select my_agent_ids())
      )
    )
  );
create policy "aca_select" on agent_campaign_agents for select
  using (agent_id in (select my_agent_ids()));

-- =============================================================
-- 6) Rankings — via RPC (no extra table needed, computed from referrals/commissions)
-- =============================================================
create or replace function agent_rankings(p_period text default 'month')
returns jsonb language plpgsql security definer as $$
declare
  v_start date;
  v_result jsonb;
begin
  if p_period = 'month' then
    v_start := date_trunc('month', now())::date;
  elsif p_period = 'quarter' then
    v_start := date_trunc('quarter', now())::date;
  elsif p_period = 'year' then
    v_start := date_trunc('year', now())::date;
  else
    v_start := date_trunc('month', now())::date;
  end if;

  select jsonb_agg(row_to_json(t)::jsonb order by t.referral_count desc)
  into v_result
  from (
    select
      a.id as agent_id,
      a.name as agent_name,
      count(r.id) as referral_count,
      count(r.id) filter (where r.status = 'contracted') as contracted_count,
      case when count(r.id) > 0
        then round(count(r.id) filter (where r.status = 'contracted')::numeric / count(r.id) * 100, 1)
        else 0 end as conversion_rate,
      coalesce(sum(c.amount) filter (where c.status in ('approved','paid')), 0) as total_commission
    from agents a
    left join agent_referrals r on r.agent_id = a.id and r.created_at >= v_start
    left join agent_commissions c on c.agent_id = a.id and c.period_start >= v_start::text
    where a.status = 'active'
    group by a.id, a.name
  ) t;

  return coalesce(v_result, '[]'::jsonb);
end;
$$;

-- =============================================================
-- 7) agent_training_courses + agent_training_progress — 研修・eラーニング
-- =============================================================
create table if not exists agent_training_courses (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  description   text,
  category      text not null default 'basic'
                  check (category in ('basic','advanced','product','sales','compliance')),
  content_type  text not null default 'video'
                  check (content_type in ('video','document','quiz','mixed')),
  content_url   text,
  thumbnail_url text,
  duration_min  integer,
  sort_order    integer not null default 0,
  is_required   boolean not null default false,
  is_published  boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists agent_training_progress (
  id          uuid primary key default gen_random_uuid(),
  course_id   uuid not null references agent_training_courses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  agent_id    uuid not null references agents (id) on delete cascade,
  status      text not null default 'not_started'
                check (status in ('not_started','in_progress','completed')),
  progress    integer not null default 0 check (progress >= 0 and progress <= 100),
  started_at  timestamptz,
  completed_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (course_id, user_id)
);
create index if not exists idx_atp_user on agent_training_progress (user_id);
create index if not exists idx_atp_agent on agent_training_progress (agent_id);

alter table agent_training_courses enable row level security;
alter table agent_training_progress enable row level security;
create policy "atc_select" on agent_training_courses for select
  using (is_published = true and exists (select 1 from my_agent_ids()));
create policy "atp_select" on agent_training_progress for select
  using (user_id = auth.uid());
create policy "atp_upsert" on agent_training_progress for insert
  with check (user_id = auth.uid());
create policy "atp_update" on agent_training_progress for update
  using (user_id = auth.uid());

-- =============================================================
-- 8) agent_invoices — 請求書発行
-- =============================================================
create table if not exists agent_invoices (
  id              uuid primary key default gen_random_uuid(),
  agent_id        uuid not null references agents (id) on delete cascade,
  invoice_number  text unique not null default 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(gen_random_uuid()::text, 1, 6)),
  period_start    date not null,
  period_end      date not null,
  subtotal        integer not null default 0,
  tax_rate        numeric(5,2) not null default 10.00,
  tax_amount      integer not null default 0,
  total           integer not null default 0,
  status          text not null default 'draft'
                    check (status in ('draft','issued','paid','cancelled')),
  issued_at       timestamptz,
  paid_at         timestamptz,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_ainv_agent on agent_invoices (agent_id, status);

create table if not exists agent_invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  invoice_id  uuid not null references agent_invoices (id) on delete cascade,
  description text not null,
  quantity    integer not null default 1,
  unit_price  integer not null default 0,
  amount      integer not null default 0,
  referral_id uuid references agent_referrals (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index if not exists idx_ail_invoice on agent_invoice_lines (invoice_id);

alter table agent_invoices enable row level security;
alter table agent_invoice_lines enable row level security;
create policy "ainv_select" on agent_invoices for select
  using (agent_id in (select my_agent_ids()));
create policy "ail_select" on agent_invoice_lines for select
  using (invoice_id in (select id from agent_invoices where agent_id in (select my_agent_ids())));

-- =============================================================
-- updated_at triggers for new tables
-- =============================================================
do $$
declare
  tbl text;
begin
  for tbl in
    select unnest(array[
      'agent_support_tickets',
      'agent_campaigns',
      'agent_faqs',
      'agent_training_courses',
      'agent_training_progress',
      'agent_invoices'
    ])
  loop
    if not exists (select 1 from pg_trigger where tgname = 'trg_' || tbl || '_updated_at') then
      execute format(
        'create trigger trg_%s_updated_at before update on %s for each row execute function set_updated_at()',
        tbl, tbl
      );
    end if;
  end loop;
end $$;

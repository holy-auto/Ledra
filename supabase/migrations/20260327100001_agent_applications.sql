-- =============================================================
-- Agent Applications — 代理店申請フロー
-- Self-service agent application, admin review, approval/rejection
-- =============================================================

-- =============================================================
-- 1) agent_applications — 代理店申請テーブル
-- =============================================================
create table if not exists agent_applications (
  id                  uuid primary key default gen_random_uuid(),
  application_number  text unique not null,     -- AGT-YYYYMMDD-XXXX

  -- Company info
  company_name        text not null,
  contact_name        text not null,
  email               text not null,
  phone               text not null,
  address             text not null,
  industry            text not null default '',

  -- Qualifications & track record
  qualifications      text not null default '',
  track_record        text not null default '',

  -- Document uploads (stored as JSONB array of storage paths)
  -- Format: [{ "name": "filename.pdf", "storage_path": "pending/...", "content_type": "application/pdf", "file_size": 12345 }]
  documents           jsonb not null default '[]'::jsonb,

  -- Application status
  status              text not null default 'submitted'
                        check (status in ('submitted', 'under_review', 'approved', 'rejected')),

  -- Review info
  reviewed_by         uuid references auth.users(id),
  reviewed_at         timestamptz,
  rejection_reason    text,

  -- Resulting agent (set when approved)
  agent_id            uuid references agents(id),

  -- Audit
  ip_address          text,
  user_agent          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_agent_app_number on agent_applications (application_number);
create index if not exists idx_agent_app_status on agent_applications (status);
create index if not exists idx_agent_app_email  on agent_applications (email);

-- =============================================================
-- 2) RPC: approve_agent_application
--    Atomically: create agent + agent_users + update application
-- =============================================================
create or replace function approve_agent_application(
  p_application_id  uuid,
  p_user_id         uuid,
  p_reviewer_id     uuid
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_app           record;
  v_agent_id      uuid;
  v_slug          text;
begin
  -- Lock and fetch application
  select * into v_app
    from agent_applications
   where id = p_application_id
     and status in ('submitted', 'under_review')
     for update;

  if v_app is null then
    raise exception 'Application not found or already processed';
  end if;

  -- Generate unique slug from company name
  v_slug := lower(regexp_replace(v_app.company_name, '[^a-zA-Z0-9\u3040-\u309f\u30a0-\u30ff\u4e00-\u9faf]+', '-', 'g'));
  v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 4);

  -- Create agent
  insert into agents (
    name, slug, status,
    contact_name, contact_email, contact_phone, address
  ) values (
    v_app.company_name,
    v_slug,
    'active_pending_review',
    v_app.contact_name,
    v_app.email,
    v_app.phone,
    v_app.address
  )
  returning id into v_agent_id;

  -- Create agent_users link
  insert into agent_users (agent_id, user_id, role, display_name)
  values (v_agent_id, p_user_id, 'admin', v_app.contact_name);

  -- Update application
  update agent_applications
     set status      = 'approved',
         agent_id    = v_agent_id,
         reviewed_by = p_reviewer_id,
         reviewed_at = now(),
         updated_at  = now()
   where id = p_application_id;

  return v_agent_id;
end;
$$;

-- =============================================================
-- 3) Storage bucket for application documents
-- =============================================================
insert into storage.buckets (id, name, public)
values ('agent-applications', 'agent-applications', false)
on conflict (id) do nothing;

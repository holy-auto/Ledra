create table if not exists insurer_saved_searches (
  id uuid primary key default gen_random_uuid(),
  insurer_id uuid not null references insurers(id) on delete cascade,
  name text not null,
  query text,
  status_filter text,
  date_from date,
  date_to date,
  created_at timestamptz not null default now()
);

alter table insurer_saved_searches enable row level security;

create policy "Insurers can manage own searches"
  on insurer_saved_searches for all
  using (insurer_id = (select id from insurers where auth_user_id = auth.uid()));

-- Atomic outbox claiming and indexes for the high-frequency storefront/cron paths.

create or replace function public.claim_outbox_events(p_batch_size integer default 200)
returns setof public.outbox_events
language sql
security definer
set search_path = ''
as $$
  with candidates as (
    select id
      from public.outbox_events
     where status = 'pending'
       and next_attempt_at <= now()
     order by next_attempt_at asc, id asc
     for update skip locked
     limit greatest(1, least(coalesce(p_batch_size, 200), 500))
  )
  update public.outbox_events e
     set status = 'in_flight', updated_at = now()
    from candidates c
   where e.id = c.id
  returning e.*;
$$;

revoke all on function public.claim_outbox_events(integer) from public, anon, authenticated;
grant execute on function public.claim_outbox_events(integer) to service_role;

create or replace function public.monitor_heavy_insurer_access(
  p_since timestamptz,
  p_threshold integer default 500
)
returns table(insurer_id uuid, access_count bigint)
language sql
security definer
set search_path = ''
as $$
  select l.insurer_id, count(*)::bigint
    from public.insurer_access_logs l
   where l.created_at >= p_since
   group by l.insurer_id
  having count(*) > greatest(0, coalesce(p_threshold, 500))
   order by count(*) desc;
$$;

revoke all on function public.monitor_heavy_insurer_access(timestamptz, integer) from public, anon, authenticated;
grant execute on function public.monitor_heavy_insurer_access(timestamptz, integer) to service_role;

create or replace function public.match_customer_import_candidates(
  p_tenant_id uuid,
  p_emails text[],
  p_phones text[]
)
returns table(id uuid, name text, name_kana text, phone text, email text)
language sql
security definer
set search_path = ''
as $$
  select c.id, c.name, c.name_kana, c.phone, c.email
    from public.customers c
   where c.tenant_id = p_tenant_id
     and (
       lower(coalesce(c.email, '')) = any(coalesce(p_emails, array[]::text[]))
       or regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g') = any(coalesce(p_phones, array[]::text[]))
     );
$$;

revoke all on function public.match_customer_import_candidates(uuid, text[], text[]) from public, anon, authenticated;
grant execute on function public.match_customer_import_candidates(uuid, text[], text[]) to service_role;

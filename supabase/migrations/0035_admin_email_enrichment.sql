-- 0035: platform admins can find missing work emails for a filtered set of leads through treg
-- (lead-enrich function, treg.people.email.find with verification). Only emails the mailbox check
-- rates valid or catch-all are saved, and only into leads that have no work email yet. Every lookup
-- is logged with its verdict, provider, cost and treg call id.

create table if not exists public.lead_enrichments (
  id            bigserial primary key,
  contact_id    uuid not null,
  user_id       uuid references auth.users(id) on delete set null,
  email         text,
  verdict       text,          -- valid | catch_all | invalid | risky | unknown | miss
  saved         boolean not null default false,
  served_by     text,
  cost_micro    integer not null default 0,
  treg_call_id  text,
  created_at    timestamptz not null default now()
);
create index if not exists lead_enrichments_contact_idx on public.lead_enrichments (contact_id);
create index if not exists lead_enrichments_created_idx on public.lead_enrichments (created_at desc);
alter table public.lead_enrichments enable row level security;
revoke all on public.lead_enrichments from anon, authenticated;

-- what the finder needs for up to 100 leads (one row per lead)
create or replace function public.admin_enrich_inputs(p_ids uuid[])
returns table (contact_id uuid, first_name text, last_name text, full_name text, domain text, linkedin_url text, work_email text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if cardinality(p_ids) > 100 then raise exception 'too_many_ids'; end if;
  return query
  select distinct on (d.contact_id) d.contact_id, nullif(d.first_name, ''), nullif(d.last_name, ''), nullif(d.full_name, ''),
         nullif(regexp_replace(lower(coalesce(nullif(d.company_domain, ''), d.current_employer_website, '')), '^(https?://)?(www\.)?([^/]+).*$', '\3'), ''),
         nullif(d.linkedin_url, ''), nullif(d.work_email, '')
    from public.data_list d
   where d.contact_id = any (p_ids)
   order by d.contact_id;
end $$;
revoke execute on function public.admin_enrich_inputs(uuid[]) from public, anon;
grant  execute on function public.admin_enrich_inputs(uuid[]) to authenticated;

-- records one lookup; saves a valid or catch-all email into leads that have none
create or replace function public.admin_save_enrichment(p_contact_id uuid, p_email text, p_verdict text, p_served_by text, p_cost_micro integer, p_call_id text)
returns boolean
language plpgsql volatile security definer
set search_path = public
as $$
declare n integer := 0;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_email is not null and p_verdict in ('valid', 'catch_all') and p_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    update public.data_list
       set work_email = lower(p_email), email_status = case p_verdict when 'valid' then 'VALID' else 'CATCH_ALL' end
     where contact_id = p_contact_id and coalesce(work_email, '') = '';
    get diagnostics n = row_count;
  end if;
  insert into public.lead_enrichments (contact_id, user_id, email, verdict, saved, served_by, cost_micro, treg_call_id)
  values (p_contact_id, auth.uid(), p_email, coalesce(p_verdict, 'miss'), n > 0, p_served_by, coalesce(p_cost_micro, 0), p_call_id);
  return n > 0;
end $$;
revoke execute on function public.admin_save_enrichment(uuid, text, text, text, integer, text) from public, anon;
grant  execute on function public.admin_save_enrichment(uuid, text, text, text, integer, text) to authenticated;

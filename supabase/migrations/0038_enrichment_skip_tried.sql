-- 0038: a new email/mobile run leaves out leads already looked up at the same cap or higher. Each lookup now
-- records the per-lead cap it ran with; admin_untried filters a batch of ids down to the ones not tried yet.
-- (A higher cap asks more providers, so leads that missed at $0.005 are still tried again at $0.03.)

alter table public.lead_enrichments add column if not exists max_cost numeric;
create index if not exists lead_enrichments_contact_kind_idx on public.lead_enrichments (contact_id, kind);

-- earlier lookups: mobiles ran at $0.005 until the $0.03 default (2026-10-15 00:33 UTC); emails at the $0.03 default
update public.lead_enrichments
   set max_cost = case when kind = 'mobile' and created_at < '2026-10-15 00:33:00+00' then 0.005 else 0.03 end
 where max_cost is null;

-- the ids (up to 1,000) that have not been looked up for this kind at this cap or higher in the last 90 days;
-- lookups that errored or timed out do not count
create or replace function public.admin_untried(p_ids uuid[], p_kind text, p_cap numeric)
returns setof uuid
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if cardinality(p_ids) > 1000 then raise exception 'too_many_ids'; end if;
  return query
  select i.id
    from unnest(p_ids) with ordinality as i(id, ord)
   where not exists (
     select 1 from public.lead_enrichments e
      where e.contact_id = i.id and e.kind = p_kind
        and coalesce(e.max_cost, 0) >= p_cap - 0.0000001
        and e.verdict not in ('error', 'timeout')
        and e.created_at > now() - interval '90 days')
   order by i.ord;
end $$;
revoke execute on function public.admin_untried(uuid[], text, numeric) from public, anon;
grant  execute on function public.admin_untried(uuid[], text, numeric) to authenticated;

-- the save functions record the cap (a new trailing argument; the old signatures are replaced)
drop function if exists public.admin_save_mobile(uuid, text, text, text, text, integer, text);
create or replace function public.admin_save_mobile(p_contact_id uuid, p_phone text, p_line_type text, p_verdict text,
                                                    p_served_by text, p_cost_micro integer, p_call_id text,
                                                    p_max_cost numeric default null)
returns text
language plpgsql volatile security definer
set search_path = public
as $$
declare
  v text := coalesce(p_verdict, case when p_phone is null then 'miss' else 'found' end);
  e text;
  saved_as text;
  ok boolean;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if p_phone is not null and v = 'found' then
    select f.e164, f.saved_as, f.is_mobile into e, saved_as, ok from public.store_found_mobile(p_contact_id, p_phone, p_line_type) f;
    if not ok then v := 'not_mobile'; end if;
  end if;
  insert into public.lead_enrichments (contact_id, user_id, kind, phone, verdict, saved, served_by, cost_micro, treg_call_id, max_cost)
  values (p_contact_id, auth.uid(), 'mobile', coalesce(e, p_phone), v, saved_as is not null, p_served_by,
          coalesce(p_cost_micro, 0), p_call_id, p_max_cost);
  return saved_as;
end $$;
revoke execute on function public.admin_save_mobile(uuid, text, text, text, text, integer, text, numeric) from public, anon;
grant  execute on function public.admin_save_mobile(uuid, text, text, text, text, integer, text, numeric) to authenticated;

drop function if exists public.admin_save_enrichment(uuid, text, text, text, integer, text);
create or replace function public.admin_save_enrichment(p_contact_id uuid, p_email text, p_verdict text, p_served_by text,
                                                        p_cost_micro integer, p_call_id text, p_max_cost numeric default null)
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
  insert into public.lead_enrichments (contact_id, user_id, email, verdict, saved, served_by, cost_micro, treg_call_id, max_cost)
  values (p_contact_id, auth.uid(), p_email, coalesce(p_verdict, 'miss'), n > 0, p_served_by, coalesce(p_cost_micro, 0), p_call_id, p_max_cost);
  return n > 0;
end $$;
revoke execute on function public.admin_save_enrichment(uuid, text, text, text, integer, text, numeric) from public, anon;
grant  execute on function public.admin_save_enrichment(uuid, text, text, text, integer, text, numeric) to authenticated;

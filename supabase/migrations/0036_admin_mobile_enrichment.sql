-- 0036: platform admins can find missing mobiles for a filtered set of leads through treg
-- (lead-enrich function with kind 'mobile', treg.people.phone.find). The per-lead cap picks the providers:
-- $0.005 is QuickEnrich alone. Only numbers that look like mobiles are saved, and only into leads with no
-- mobile yet. Every lookup is logged in lead_enrichments with kind 'mobile'.

alter table public.lead_enrichments add column if not exists kind text not null default 'email';
alter table public.lead_enrichments add column if not exists phone text;

-- what the finder needs for up to 100 leads (one row per lead)
create or replace function public.admin_mobile_inputs(p_ids uuid[])
returns table (contact_id uuid, first_name text, last_name text, full_name text, domain text, linkedin_url text, work_email text, mobile_phone text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if cardinality(p_ids) > 100 then raise exception 'too_many_ids'; end if;
  return query
  select distinct on (d.contact_id) d.contact_id, nullif(d.first_name, ''), nullif(d.last_name, ''), nullif(d.full_name, ''),
         nullif(regexp_replace(lower(coalesce(nullif(d.company_domain, ''), d.current_employer_website, '')), '^(https?://)?(www\.)?([^/]+).*$', '\3'), ''),
         nullif(d.linkedin_url, ''), nullif(d.work_email, ''), nullif(d.mobile_phone, '')
    from public.data_list d
   where d.contact_id = any (p_ids)
   order by d.contact_id;
end $$;
revoke execute on function public.admin_mobile_inputs(uuid[]) from public, anon;
grant  execute on function public.admin_mobile_inputs(uuid[]) to authenticated;

-- records one lookup; saves a mobile into a lead that has none. Returns the saved number, or null.
-- A number is kept when it is a valid international number, the provider did not call it a landline,
-- and (for the UK) it starts +447. UK numbers are stored like the imported ones: "+44 7xxx xxxxxx".
create or replace function public.admin_save_mobile(p_contact_id uuid, p_phone text, p_line_type text, p_verdict text,
                                                    p_served_by text, p_cost_micro integer, p_call_id text)
returns text
language plpgsql volatile security definer
set search_path = public
as $$
declare
  e text := public.lead_e164(p_phone);
  v text := coalesce(p_verdict, case when p_phone is null then 'miss' else 'found' end);
  phone text;
  n integer := 0;
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if e is not null and v = 'found' then
    if upper(coalesce(p_line_type, '')) in ('LANDLINE', 'FIXED', 'FIXED_LINE', 'TOLL_FREE', 'VOIP') or (e like '+44%' and e not like '+447%') then
      v := 'not_mobile';
    else
      phone := case when e ~ '^\+447[0-9]{9}$' then '+44 ' || substr(e, 4, 4) || ' ' || substr(e, 8) else e end;
      update public.data_list set mobile_phone = phone
       where contact_id = p_contact_id and coalesce(mobile_phone, '') = '';
      get diagnostics n = row_count;
    end if;
  end if;
  insert into public.lead_enrichments (contact_id, user_id, kind, phone, verdict, saved, served_by, cost_micro, treg_call_id)
  values (p_contact_id, auth.uid(), 'mobile', coalesce(e, p_phone), v, n > 0, p_served_by, coalesce(p_cost_micro, 0), p_call_id);
  return case when n > 0 then phone end;
end $$;
revoke execute on function public.admin_save_mobile(uuid, text, text, text, text, integer, text) from public, anon;
grant  execute on function public.admin_save_mobile(uuid, text, text, text, text, integer, text) to authenticated;

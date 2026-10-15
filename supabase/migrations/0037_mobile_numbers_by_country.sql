-- 0037: found mobiles are read in the lead's own country. Providers often send a national number with no
-- country code (a UK mobile as "7554 123456"), and treg's routing sometimes puts a US +1 in front of one;
-- 0036 only accepted full international numbers, so most UK finds were dropped and a few were saved as +1.
-- This reads numbers by the lead's country, re-saves the dropped finds from the log and corrects the +1 ones.
-- Decibel only goes after UK decision makers for now: the mobile finder looks up UK leads that are C-level or
-- VP, and only UK mobiles (+447) are saved.

-- dialling code for the countries in data_list (others: only full international numbers are accepted)
create or replace function public.country_dial_code(p_country text)
returns text language sql immutable as $$
  select case lower(trim(coalesce(p_country, '')))
    when 'united kingdom' then '44' when 'uk' then '44' when 'england' then '44' when 'scotland' then '44'
    when 'wales' then '44' when 'northern ireland' then '44' when 'ireland' then '353'
    when 'united states' then '1' when 'canada' then '1' when 'germany' then '49' when 'france' then '33'
    when 'netherlands' then '31' when 'spain' then '34' when 'italy' then '39' when 'belgium' then '32'
    when 'sweden' then '46' when 'denmark' then '45' when 'norway' then '47' when 'finland' then '358'
    when 'switzerland' then '41' when 'austria' then '43' when 'portugal' then '351' when 'poland' then '48'
    when 'luxembourg' then '352' when 'czech republic' then '420' when 'czechia' then '420' when 'greece' then '30'
    when 'australia' then '61' when 'new zealand' then '64' when 'india' then '91' when 'singapore' then '65'
    when 'united arab emirates' then '971' when 'south africa' then '27'
  end
$$;

-- a phone number as E.164, reading national numbers in the given country
create or replace function public.phone_to_e164(p text, p_country text)
returns text language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
  cc text := public.country_dial_code(p_country);
begin
  if d like '00%' then d := '+' || substr(d, 3); end if;
  if d like '+%' then
    -- "+44 07…": the trunk 0 kept after the country code
    if d ~ '^\+440' then d := '+44' || substr(d, 5); end if;
    -- a UK mobile sent as national digits with a US +1 in front
    if cc = '44' and d ~ '^\+17[1-9][0-9]{8}$' then d := '+44' || substr(d, 3); end if;
    return public.lead_e164(d);
  end if;
  if cc is null or d = '' then return null; end if;
  if d like cc || '%' and length(d) - length(cc) >= 9 then return public.lead_e164('+' || d); end if;
  return public.lead_e164('+' || cc || regexp_replace(d, '^0+', ''));
end $$;

-- stores a found number on a lead with no mobile; internal (called by the admin functions below)
create or replace function public.store_found_mobile(p_contact_id uuid, p_phone text, p_line_type text,
                                                     out e164 text, out saved_as text, out is_mobile boolean)
language plpgsql volatile security definer
set search_path = public
as $$
declare country text;
begin
  select d.contact_country into country from public.data_list d where d.contact_id = p_contact_id limit 1;
  e164 := public.phone_to_e164(p_phone, country);
  -- UK mobiles only, stored like the imported ones: "+44 7xxx xxxxxx"
  is_mobile := coalesce(e164 ~ '^\+447[0-9]{9}$', false)
    and upper(coalesce(p_line_type, '')) not in ('LANDLINE', 'FIXED', 'FIXED_LINE', 'TOLL_FREE', 'VOIP');
  if is_mobile then
    saved_as := '+44 ' || substr(e164, 4, 4) || ' ' || substr(e164, 8);
    update public.data_list set mobile_phone = saved_as
     where contact_id = p_contact_id and coalesce(mobile_phone, '') = '';
    if not found then saved_as := null; end if;
  end if;
end $$;
revoke execute on function public.store_found_mobile(uuid, text, text) from public, anon, authenticated;

create or replace function public.admin_save_mobile(p_contact_id uuid, p_phone text, p_line_type text, p_verdict text,
                                                    p_served_by text, p_cost_micro integer, p_call_id text)
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
  insert into public.lead_enrichments (contact_id, user_id, kind, phone, verdict, saved, served_by, cost_micro, treg_call_id)
  values (p_contact_id, auth.uid(), 'mobile', coalesce(e, p_phone), v, saved_as is not null, p_served_by,
          coalesce(p_cost_micro, 0), p_call_id);
  return saved_as;
end $$;

-- the finder looks up UK leads that are C-level or VP (anything else in the batch is skipped, unbilled)
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
     and d.contact_country = 'United Kingdom'
     and d.seniority_level in ('c-level', 'vp')
   order by d.contact_id;
end $$;

-- repair the finds 0036 dropped or saved with +1
do $$
declare r record; s record;
begin
  -- the +1 ones: take them off the lead (only if it still holds exactly what was saved), then store again
  for r in select e.id, e.contact_id, e.phone from public.lead_enrichments e
            where e.kind = 'mobile' and e.saved and e.phone like '+1%' loop
    update public.data_list set mobile_phone = null where contact_id = r.contact_id and mobile_phone = r.phone;
    select f.* into s from public.store_found_mobile(r.contact_id, r.phone, null) f;
    update public.lead_enrichments set phone = coalesce(s.e164, phone), saved = s.saved_as is not null,
           verdict = case when s.is_mobile then 'found' else 'not_mobile' end where id = r.id;
  end loop;
  -- the dropped ones
  for r in select e.id, e.contact_id, e.phone from public.lead_enrichments e
            where e.kind = 'mobile' and not e.saved and e.verdict = 'found' and e.phone is not null loop
    select f.* into s from public.store_found_mobile(r.contact_id, r.phone, null) f;
    update public.lead_enrichments set phone = coalesce(s.e164, phone), saved = s.saved_as is not null,
           verdict = case when s.is_mobile then 'found' else 'not_mobile' end where id = r.id;
  end loop;
end $$;

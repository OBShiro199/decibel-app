-- 0040: the mobile finder also looks up Director-level UK leads (was C-level and VP only, 0037).

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
     and d.seniority_level in ('c-level', 'vp', 'director')
   order by d.contact_id;
end $$;

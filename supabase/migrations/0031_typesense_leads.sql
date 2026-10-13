-- 0031: Leads search moves to Typesense (search/typesense/README.md).
--
-- Typesense finds the matching lead ids and counts; this function returns the full rows for one
-- page of ids, in the order given, with exactly what search_leads returned (contact details masked
-- until revealed into People, the DNC flag). The read-only export view the search server loads from
-- is recorded here too (it was first created by hand on 2026-10-13; the reader login's password is
-- set outside migrations and stored only on the search server).

create or replace function public.leads_by_ids(p_workspace_id uuid, p_ids uuid[])
returns table (lead_id uuid, full_name text, first_name text, last_name text, current_title text, seniority_level text, department text,
               role_start_date date, company_name text, company_domain text, company_industry text, main_industry text,
               employee_count_range text, employee_count integer, revenue_range text, company_founded integer, company_hq_country text,
               contact_country text, contact_city text, contact_location text, linkedin_url text, has_mobile boolean, mobile text,
               has_email boolean, email text, email_status text, has_personal_email boolean, open_to_work boolean, is_hiring boolean,
               last_funding_type text, total_funding_amount text, smart_tags text, person_id uuid, on_dnc boolean)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  if cardinality(p_ids) > 500 then raise exception 'too_many_ids'; end if;
  return query
  select d.contact_id, d.full_name, d.first_name, d.last_name, d.current_title, d.seniority_level, d.department,
         d.role_start_date, coalesce(nullif(d.company_name, ''), d.current_employer), d.company_domain, d.company_industry, d.main_industry,
         d.employee_count_range, d.linkedin_employee_count_exact, d.revenue_range, extract(year from d.company_founded_year)::integer, d.company_hq_country,
         d.contact_country, d.contact_city, d.contact_location, d.linkedin_url,
         coalesce(d.mobile_phone, '') <> '',
         case when p.id is not null then p.mobile_e164 else public.mask_phone(public.lead_e164(d.mobile_phone)) end,
         coalesce(d.work_email, '') <> '',
         case when p.id is not null then p.email::text
              when coalesce(d.work_email, '') <> '' then '•••@' || split_part(d.work_email, '@', 2) end,
         d.email_status, coalesce(d.personal_emails, '') <> '',
         coalesce(d.open_to_work, false), coalesce(d.is_hiring, false), d.last_funding_type, d.total_funding_amount, d.smart_tags,
         p.id,
         exists (select 1 from public.dnc_entries e where e.workspace_id = p_workspace_id and e.e164 = public.lead_e164(d.mobile_phone))
    from unnest(p_ids) with ordinality as i(id, ord)
    cross join lateral (select * from public.data_list x where x.contact_id = i.id limit 1) d
    left join public.people p on p.workspace_id = p_workspace_id and p.source_lead_id = d.contact_id
   order by i.ord;
end $$;

revoke execute on function public.leads_by_ids(uuid, uuid[]) from public, anon;
grant  execute on function public.leads_by_ids(uuid, uuid[]) to authenticated;

-- the export view (search fields only: no phone numbers or emails)
create schema if not exists search_export;
revoke all on schema search_export from public, anon, authenticated;

create or replace view search_export.leads as
select d.contact_id,
       d.full_name,
       d.current_title,
       coalesce(nullif(d.company_name, ''), d.current_employer) as company,
       d.company_domain,
       d.current_employer_website as website,
       nullif(d.seniority_level, '') as seniority,
       nullif(d.department, '') as department,
       nullif(d.company_industry, '') as company_industry,
       nullif(d.main_industry, '') as main_industry,
       nullif(d.employee_count_range, '') as size,
       d.linkedin_employee_count_exact as employees,
       nullif(d.revenue_range, '') as revenue,
       extract(year from d.company_founded_year)::integer as founded,
       nullif(d.company_hq_country, '') as hq_country,
       nullif(d.contact_country, '') as country,
       d.contact_city as city,
       d.contact_state as state,
       d.contact_location as location,
       coalesce(d.mobile_phone, '') <> '' as has_mobile,
       left(nullif(regexp_replace(coalesce(d.mobile_phone, ''), '[^0-9+]', '', 'g'), ''), 5) as mobile_prefix,
       coalesce(d.work_email, '') <> '' as has_email,
       nullif(d.email_status, '') as email_status,
       coalesce(d.personal_emails, '') <> '' as has_personal_email,
       coalesce(d.linkedin_url, '') <> '' as has_linkedin,
       coalesce(d.open_to_work, false) as open_to_work,
       coalesce(d.is_hiring, false) as is_hiring,
       d.role_start_date as role_start,
       nullif(d.last_funding_type, '') as funding,
       d.smart_tags,
       nullif(d.skills, '') as skills,
       nullif(d.languages, '') as languages,
       nullif(d.company_tech_stack, '') as tech
  from public.data_list d
 where d.contact_id is not null;
revoke all on search_export.leads from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'decibel_search_reader') then
    create role decibel_search_reader login connection limit 2;
  end if;
end $$;
alter role decibel_search_reader set default_transaction_read_only = on;
alter role decibel_search_reader set statement_timeout = '6h';
alter role decibel_search_reader set idle_in_transaction_session_timeout = '10min';
grant usage on schema search_export to decibel_search_reader;
grant select on search_export.leads to decibel_search_reader;

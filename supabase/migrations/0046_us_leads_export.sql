-- 0046: an export view of the US leads (us_data_list), for a separate project's search collection.
--
-- The US leads are not part of Decibel: Decibel's search, page rows and reveals keep reading data_list only.
-- This view is the same shape as search_export.leads (search fields only: no phone numbers or emails), so the
-- loader can build a Typesense collection of its own from it (alias us_leads; see search/typesense/README.md).

create or replace view search_export.leads_us as
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
  from public.us_data_list d
 where d.contact_id is not null;
revoke all on search_export.leads_us from public, anon, authenticated;
grant select on search_export.leads_us to decibel_search_reader;

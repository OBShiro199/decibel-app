-- 0018: build each lead/local search from only the filters that are set.
--
-- 0017 used one static query with "filter IS NULL OR condition" for every filter. Inside
-- PL/pgSQL that gets a generic plan that cannot drop the unused conditions, so Postgres
-- misjudged selectivity and scanned the whole table. Here the WHERE clause is assembled
-- from fixed SQL fragments for the active filters only; user values are never spliced into
-- the SQL, they are read from the typed record passed as $1 (EXECUTE ... USING), so this is
-- injection-safe and the planner sees the real conditions (index walks for broad searches,
-- index scans for selective ones).

create or replace function public.lead_where(f public.lead_query)
returns text language plpgsql immutable as $$
declare c text[] := '{}';
begin
  if f.q is not null then c := array_append(c, '(d.full_name ilike $1.q or d.current_title ilike $1.q or d.company_name ilike $1.q or d.current_employer ilike $1.q)'::text); end if;
  if f.titles is not null then c := array_append(c, 'd.current_title ilike any ($1.titles)'::text); end if;
  if f.titles_not is not null then c := array_append(c, 'not coalesce(d.current_title, '''') ilike any ($1.titles_not)'::text); end if;
  if f.seniorities is not null then c := array_append(c, 'd.seniority_level = any ($1.seniorities)'::text); end if;
  if f.departments is not null then c := array_append(c, 'd.department = any ($1.departments)'::text); end if;
  if f.industries is not null then c := array_append(c, '(d.company_industry = any ($1.industries) or d.main_industry = any ($1.industries))'::text); end if;
  if f.industries_not is not null then c := array_append(c, 'not (coalesce(d.company_industry, '''') = any ($1.industries_not) or coalesce(d.main_industry, '''') = any ($1.industries_not))'::text); end if;
  if f.sizes is not null then c := array_append(c, 'd.employee_count_range = any ($1.sizes)'::text); end if;
  if f.emp_min is not null then c := array_append(c, 'd.linkedin_employee_count_exact >= $1.emp_min'::text); end if;
  if f.emp_max is not null then c := array_append(c, 'd.linkedin_employee_count_exact <= $1.emp_max'::text); end if;
  if f.revenues is not null then c := array_append(c, 'd.revenue_range = any ($1.revenues)'::text); end if;
  if f.countries is not null then c := array_append(c, 'd.contact_country = any ($1.countries)'::text); end if;
  if f.hq_countries is not null then c := array_append(c, 'd.company_hq_country = any ($1.hq_countries)'::text); end if;
  if f.cities is not null then c := array_append(c, '(d.contact_city ilike any ($1.cities) or d.contact_state ilike any ($1.cities) or d.contact_location ilike any ($1.cities))'::text); end if;
  if f.companies is not null then c := array_append(c, '(d.company_name ilike any ($1.companies) or d.current_employer ilike any ($1.companies))'::text); end if;
  if f.companies_not is not null then c := array_append(c, 'not (coalesce(d.company_name, '''') ilike any ($1.companies_not) or coalesce(d.current_employer, '''') ilike any ($1.companies_not))'::text); end if;
  if f.domains is not null then c := array_append(c, '(d.company_domain ilike any ($1.domains) or d.current_employer_website ilike any ($1.domains))'::text); end if;
  if f.has_mobile is not null then c := array_append(c, case when f.has_mobile then 'coalesce(d.mobile_phone, '''') <> ''''' else 'coalesce(d.mobile_phone, '''') = ''''' end::text); end if;
  if f.mobile_codes is not null then c := array_append(c, 'replace(d.mobile_phone, '' '', '''') like any ($1.mobile_codes)'::text); end if;
  if f.has_email is not null then c := array_append(c, case when f.has_email then 'coalesce(d.work_email, '''') <> ''''' else 'coalesce(d.work_email, '''') = ''''' end::text); end if;
  if f.email_status is not null then c := array_append(c, 'd.email_status = any ($1.email_status)'::text); end if;
  if f.has_personal_email is not null then c := array_append(c, case when f.has_personal_email then 'coalesce(d.personal_emails, '''') <> ''''' else 'coalesce(d.personal_emails, '''') = ''''' end::text); end if;
  if f.has_linkedin is not null then c := array_append(c, case when f.has_linkedin then 'coalesce(d.linkedin_url, '''') <> ''''' else 'coalesce(d.linkedin_url, '''') = ''''' end::text); end if;
  if f.open_to_work is not null then c := array_append(c, 'coalesce(d.open_to_work, false) = $1.open_to_work'::text); end if;
  if f.is_hiring is not null then c := array_append(c, 'coalesce(d.is_hiring, false) = $1.is_hiring'::text); end if;
  if f.tenure_min is not null then c := array_append(c, 'd.role_start_date <= (current_date - make_interval(months => $1.tenure_min))'::text); end if;
  if f.tenure_max is not null then c := array_append(c, 'd.role_start_date >= (current_date - make_interval(months => $1.tenure_max))'::text); end if;
  if f.founded_min is not null then c := array_append(c, 'extract(year from d.company_founded_year) >= $1.founded_min'::text); end if;
  if f.founded_max is not null then c := array_append(c, 'extract(year from d.company_founded_year) <= $1.founded_max'::text); end if;
  if f.funding is not null then c := array_append(c, 'd.last_funding_type = any ($1.funding)'::text); end if;
  if f.has_funding is not null then c := array_append(c, case when f.has_funding then 'coalesce(d.last_funding_type, '''') <> ''''' else 'coalesce(d.last_funding_type, '''') = ''''' end::text); end if;
  if f.skills is not null then c := array_append(c, 'd.skills ilike any ($1.skills)'::text); end if;
  if f.languages is not null then c := array_append(c, 'd.languages ilike any ($1.languages)'::text); end if;
  if f.tech is not null then c := array_append(c, 'd.company_tech_stack ilike any ($1.tech)'::text); end if;
  if f.tags is not null then c := array_append(c, 'd.smart_tags ilike any ($1.tags)'::text); end if;
  return case when cardinality(c) = 0 then 'true' else array_to_string(c, ' and ') end;
end $$;
revoke all on function public.lead_where(public.lead_query) from public, anon, authenticated;

create or replace function public.search_leads(p_workspace_id uuid, p_filters jsonb default '{}', p_limit integer default 100, p_offset integer default 0)
returns table (
  lead_id uuid, full_name text, first_name text, last_name text, current_title text, seniority_level text, department text,
  role_start_date date, company_name text, company_domain text, company_industry text, main_industry text,
  employee_count_range text, employee_count integer, revenue_range text, company_founded integer, company_hq_country text,
  contact_country text, contact_city text, contact_location text, linkedin_url text,
  has_mobile boolean, mobile text, has_email boolean, email text, email_status text, has_personal_email boolean,
  open_to_work boolean, is_hiring boolean, last_funding_type text, total_funding_amount text, smart_tags text,
  person_id uuid
)
language plpgsql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare f public.lead_query := public.lead_query_from(coalesce(p_filters, '{}'));
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  return query execute
  'select d.contact_id, d.full_name, d.first_name, d.last_name, d.current_title, d.seniority_level, d.department,
          d.role_start_date, coalesce(d.company_name, d.current_employer), d.company_domain, d.company_industry, d.main_industry,
          d.employee_count_range, d.linkedin_employee_count_exact, d.revenue_range, extract(year from d.company_founded_year)::integer, d.company_hq_country,
          d.contact_country, d.contact_city, d.contact_location, d.linkedin_url,
          coalesce(d.mobile_phone, '''') <> '''',
          case when p.id is not null then p.mobile_e164 else public.mask_phone(public.lead_e164(d.mobile_phone)) end,
          coalesce(d.work_email, '''') <> '''',
          case when p.id is not null then p.email::text
               when coalesce(d.work_email, '''') <> '''' then ''•••@'' || split_part(d.work_email, ''@'', 2) end,
          d.email_status, coalesce(d.personal_emails, '''') <> '''',
          coalesce(d.open_to_work, false), coalesce(d.is_hiring, false), d.last_funding_type, d.total_funding_amount, d.smart_tags,
          p.id
     from (select * from public.data_list d where ' || public.lead_where(f) || '
            order by d.contact_id limit $3 offset $4) d
     left join public.people p on p.workspace_id = $2 and p.source_lead_id = d.contact_id
    order by d.contact_id'
  using f, p_workspace_id, least(greatest(coalesce(p_limit, 100), 1), 500), least(greatest(coalesce(p_offset, 0), 0), 10000);
end $$;

create or replace function public.count_leads(p_workspace_id uuid, p_filters jsonb default '{}')
returns integer
language plpgsql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare f public.lead_query := public.lead_query_from(coalesce(p_filters, '{}')); n integer;
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  execute 'select count(*) from (select 1 from public.data_list d where ' || public.lead_where(f) || ' limit 10001) s' into n using f;
  return n;
end $$;

create or replace function public.local_where(f public.local_query)
returns text language plpgsql immutable as $$
declare c text[] := '{}';
begin
  if f.q is not null then c := array_append(c, '(g."Name" ilike $1.q or g."Category" ilike $1.q or g."Domain" ilike $1.q)'::text); end if;
  if f.keywords is not null then c := array_append(c, 'g."Keyword" = any ($1.keywords)'::text); end if;
  if f.categories is not null then c := array_append(c, '(g."Category" ilike any ($1.categories) or g."All Categories" ilike any ($1.categories))'::text); end if;
  if f.cities is not null then c := array_append(c, '(g."City" ilike any ($1.cities) or g."Municipality" ilike any ($1.cities) or g."Neighborhood" ilike any ($1.cities))'::text); end if;
  if f.postcodes is not null then c := array_append(c, 'upper(replace(coalesce(g."Zip", ''''), '' '', '''')) like any ($1.postcodes)'::text); end if;
  if f.countries is not null then c := array_append(c, 'g."Country" = any ($1.countries)'::text); end if;
  if f.min_rating is not null then c := array_append(c, 'g."Average Rating" >= $1.min_rating'::text); end if;
  if f.max_rating is not null then c := array_append(c, 'g."Average Rating" <= $1.max_rating'::text); end if;
  if f.has_rating is not null then c := array_append(c, case when f.has_rating then 'g."Average Rating" is not null' else 'g."Average Rating" is null' end::text); end if;
  if f.has_phone is not null then c := array_append(c, case when f.has_phone then 'coalesce(g."Phone Standard Format", '''') <> ''''' else 'coalesce(g."Phone Standard Format", '''') = ''''' end::text); end if;
  if f.mobile_only is not null then c := array_append(c, case when f.mobile_only then 'g."Phone Standard Format" like ''+44 7%''' else 'coalesce(g."Phone Standard Format", '''') not like ''+44 7%''' end::text); end if;
  if f.has_email is not null then c := array_append(c, case when f.has_email then 'coalesce(g."Email 1", '''') <> ''''' else 'coalesce(g."Email 1", '''') = ''''' end::text); end if;
  if f.has_website is not null then c := array_append(c, case when f.has_website then 'coalesce(g."Website", '''') <> ''''' else 'coalesce(g."Website", '''') = ''''' end::text); end if;
  if f.has_whatsapp is not null then c := array_append(c, case when f.has_whatsapp then 'coalesce(g."WhatsApp", '''') <> ''''' else 'coalesce(g."WhatsApp", '''') = ''''' end::text); end if;
  if f.has_facebook is not null then c := array_append(c, case when f.has_facebook then 'coalesce(g."Facebook", '''') <> ''''' else 'coalesce(g."Facebook", '''') = ''''' end::text); end if;
  if f.has_instagram is not null then c := array_append(c, case when f.has_instagram then 'coalesce(g."Instagram", '''') <> ''''' else 'coalesce(g."Instagram", '''') = ''''' end::text); end if;
  if f.has_linkedin is not null then c := array_append(c, case when f.has_linkedin then 'coalesce(g."LinkedIn", '''') <> ''''' else 'coalesce(g."LinkedIn", '''') = ''''' end::text); end if;
  if f.open_saturday is not null then c := array_append(c, case when f.open_saturday then '(g."Hours" ilike ''%Saturday:%'' and g."Hours" not ilike ''%Saturday: Closed%'')' else '(g."Hours" is null or g."Hours" not ilike ''%Saturday:%'' or g."Hours" ilike ''%Saturday: Closed%'')' end::text); end if;
  if f.open_sunday is not null then c := array_append(c, case when f.open_sunday then '(g."Hours" ilike ''%Sunday:%'' and g."Hours" not ilike ''%Sunday: Closed%'')' else '(g."Hours" is null or g."Hours" not ilike ''%Sunday:%'' or g."Hours" ilike ''%Sunday: Closed%'')' end::text); end if;
  if f.domains is not null then c := array_append(c, 'g."Domain" ilike any ($1.domains)'::text); end if;
  return case when cardinality(c) = 0 then 'true' else array_to_string(c, ' and ') end;
end $$;
revoke all on function public.local_where(public.local_query) from public, anon, authenticated;

create or replace function public.search_local(p_workspace_id uuid, p_filters jsonb default '{}', p_limit integer default 100, p_offset integer default 0)
returns table (
  place_id text, name text, category text, all_categories text, keyword text, phone text, has_mobile boolean, whatsapp text,
  email text, all_emails text, website text, domain text, facebook text, instagram text, linkedin text,
  address text, street text, neighbourhood text, city text, postcode text, country text,
  rating numeric, review_url text, hours text, maps_url text, logo_url text
)
language plpgsql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare f public.local_query := public.local_query_from(coalesce(p_filters, '{}'));
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  return query execute
  'select g."Place ID", g."Name", g."Category", g."All Categories", g."Keyword", g."Phone Standard Format",
          coalesce(g."Phone Standard Format", '''') like ''+44 7%'', g."WhatsApp",
          g."Email 1", g."All Emails", coalesce(g."Clean Website URL", g."Website"), g."Domain", g."Facebook", g."Instagram", g."LinkedIn",
          g."Full Address", g."Street Address", g."Neighborhood", g."City", g."Zip", g."Country",
          g."Average Rating", g."Review URL", g."Hours", g."GMB URL", g."Logo URL"
     from public.google_businesses g where ' || public.local_where(f) || '
    order by g."Place ID" limit $2 offset $3'
  using f, least(greatest(coalesce(p_limit, 100), 1), 500), least(greatest(coalesce(p_offset, 0), 0), 10000);
end $$;

create or replace function public.count_local(p_workspace_id uuid, p_filters jsonb default '{}')
returns integer
language plpgsql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare f public.local_query := public.local_query_from(coalesce(p_filters, '{}')); n integer;
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  execute 'select count(*) from (select 1 from public.google_businesses g where ' || public.local_where(f) || ' limit 10001) s' into n using f;
  return n;
end $$;

-- the static filter functions from 0017 are no longer used
drop function if exists public.lead_filter(public.lead_query);
drop function if exists public.local_filter(public.local_query);

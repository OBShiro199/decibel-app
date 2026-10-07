-- 0020: faster lead and local searches.
--   - Multi-value text filters become OR'd ILIKEs on single values, which trigram indexes can
--     serve (ILIKE ANY(array) cannot use them).
--   - Partial and btree indexes for the remaining filters (rare flags especially).
--   - Skills, languages and tech stack move into lead_text with trigram indexes, instead of being
--     read from the wide data_list row for each candidate.
--   - Counts give up after a few seconds and return null (shown as "unknown") rather than failing.

set statement_timeout = 0;

-- ---- lead_text: long text filters --------------------------------------------------
create table public.lead_text (
  contact_id  uuid primary key,
  skills      text,
  languages   text,
  tech        text
);
alter table public.lead_text enable row level security;
revoke all on public.lead_text from anon, authenticated;

insert into public.lead_text
select distinct on (contact_id) contact_id, nullif(skills, ''), nullif(languages, ''), nullif(company_tech_stack, '')
  from public.data_list
 where contact_id is not null and (coalesce(skills, '') <> '' or coalesce(languages, '') <> '' or coalesce(company_tech_stack, '') <> '')
 order by contact_id;

create index lead_text_skills_trgm    on public.lead_text using gin (skills gin_trgm_ops);
create index lead_text_languages_trgm on public.lead_text using gin (languages gin_trgm_ops);
create index lead_text_tech_trgm      on public.lead_text using gin (tech gin_trgm_ops);

-- ---- more indexes on the slim tables ----------------------------------------------
create index if not exists lead_search_location_trgm on public.lead_search using gin (location gin_trgm_ops);
create index if not exists lead_search_employees_idx on public.lead_search (employees);
create index if not exists lead_search_revenue_idx   on public.lead_search (revenue);
create index if not exists lead_search_hq_idx        on public.lead_search (hq_country);
create index if not exists lead_search_email_st_idx  on public.lead_search (email_status);
create index if not exists lead_search_funding_idx   on public.lead_search (funding);
create index if not exists lead_search_otw_idx       on public.lead_search (contact_id) where open_to_work;
create index if not exists lead_search_hiring_idx    on public.lead_search (contact_id) where is_hiring;
create index if not exists lead_search_pemail_idx    on public.lead_search (contact_id) where has_personal_email;
create index if not exists lead_search_role_idx      on public.lead_search (role_start);
create index if not exists lead_search_founded_idx   on public.lead_search (founded);

-- local: one indexed "area" text (town, municipality, neighbourhood); categories always filled
alter table public.local_search add column if not exists area text;
update public.local_search set area = nullif(concat_ws(' · ', city, municipality, neighbourhood), ''),
                               all_categories = coalesce(nullif(all_categories, ''), category);
create index if not exists local_search_area_trgm   on public.local_search using gin (area gin_trgm_ops);
create index if not exists local_search_rating_idx  on public.local_search (rating);
create index if not exists local_search_country_idx on public.local_search (country);
create index if not exists local_search_email_idx   on public.local_search (place_id) where has_email;
create index if not exists local_search_wa_idx      on public.local_search (place_id) where has_whatsapp;
analyze public.lead_search;
analyze public.local_search;
analyze public.lead_text;

-- ---- builders ------------------------------------------------------------------------
-- "(col ilike ($1.field)[1] or col ilike ($1.field)[2] ...)" for an array of n patterns
create or replace function public.ilike_or(col text, field text, n integer)
returns text language sql immutable as $$
  select '(' || string_agg(format('%s ilike ($1.%s)[%s]', col, field, i), ' or ') || ')' from generate_series(1, n) i
$$;
revoke all on function public.ilike_or(text, text, integer) from public, anon, authenticated;

create or replace function public.lead_where(f public.lead_query)
returns text language plpgsql immutable as $$
declare c text[] := '{}'; t text[] := '{}';
begin
  if f.q is not null then c := array_append(c, '(s.full_name ilike $1.q or s.current_title ilike $1.q or s.company ilike $1.q)'::text); end if;
  if f.titles is not null then c := array_append(c, public.ilike_or('s.current_title', 'titles', cardinality(f.titles))); end if;
  if f.titles_not is not null then c := array_append(c, 'not coalesce(s.current_title, '''') ilike any ($1.titles_not)'::text); end if;
  if f.seniorities is not null then c := array_append(c, 's.seniority = any ($1.seniorities)'::text); end if;
  if f.departments is not null then c := array_append(c, 's.department = any ($1.departments)'::text); end if;
  if f.industries is not null then c := array_append(c, '(s.main_industry = any ($1.industries) or s.company_industry = any ($1.industries))'::text); end if;
  if f.industries_not is not null then c := array_append(c, 'not (coalesce(s.company_industry, '''') = any ($1.industries_not) or coalesce(s.main_industry, '''') = any ($1.industries_not))'::text); end if;
  if f.sizes is not null then c := array_append(c, 's.size = any ($1.sizes)'::text); end if;
  if f.emp_min is not null then c := array_append(c, 's.employees >= $1.emp_min'::text); end if;
  if f.emp_max is not null then c := array_append(c, 's.employees <= $1.emp_max'::text); end if;
  if f.revenues is not null then c := array_append(c, 's.revenue = any ($1.revenues)'::text); end if;
  if f.countries is not null then c := array_append(c, 's.country = any ($1.countries)'::text); end if;
  if f.hq_countries is not null then c := array_append(c, 's.hq_country = any ($1.hq_countries)'::text); end if;
  if f.cities is not null then c := array_append(c, public.ilike_or('s.location', 'cities', cardinality(f.cities))); end if;
  if f.companies is not null then c := array_append(c, public.ilike_or('s.company', 'companies', cardinality(f.companies))); end if;
  if f.companies_not is not null then c := array_append(c, 'not coalesce(s.company, '''') ilike any ($1.companies_not)'::text); end if;
  if f.domains is not null then c := array_append(c, '(s.company_domain ilike any ($1.domains) or s.website ilike any ($1.domains))'::text); end if;
  if f.has_mobile is not null then c := array_append(c, 's.has_mobile = $1.has_mobile'::text); end if;
  if f.mobile_codes is not null then c := array_append(c, 's.mobile_prefix like any ($1.mobile_codes)'::text); end if;
  if f.has_email is not null then c := array_append(c, 's.has_email = $1.has_email'::text); end if;
  if f.email_status is not null then c := array_append(c, 's.email_status = any ($1.email_status)'::text); end if;
  if f.has_personal_email is not null then c := array_append(c, case when f.has_personal_email then 's.has_personal_email' else 'not s.has_personal_email' end); end if;
  if f.has_linkedin is not null then c := array_append(c, 's.has_linkedin = $1.has_linkedin'::text); end if;
  if f.open_to_work is not null then c := array_append(c, case when f.open_to_work then 's.open_to_work' else 'not s.open_to_work' end); end if;
  if f.is_hiring is not null then c := array_append(c, case when f.is_hiring then 's.is_hiring' else 'not s.is_hiring' end); end if;
  if f.tenure_min is not null then c := array_append(c, 's.role_start <= (current_date - make_interval(months => $1.tenure_min))'::text); end if;
  if f.tenure_max is not null then c := array_append(c, 's.role_start >= (current_date - make_interval(months => $1.tenure_max))'::text); end if;
  if f.founded_min is not null then c := array_append(c, 's.founded >= $1.founded_min'::text); end if;
  if f.founded_max is not null then c := array_append(c, 's.founded <= $1.founded_max'::text); end if;
  if f.funding is not null then c := array_append(c, 's.funding = any ($1.funding)'::text); end if;
  if f.has_funding is not null then c := array_append(c, case when f.has_funding then 's.funding is not null' else 's.funding is null' end); end if;
  if f.tags is not null then c := array_append(c, 's.smart_tags ilike any ($1.tags)'::text); end if;
  -- long text: one indexed lookup in lead_text
  if f.skills is not null then t := array_append(t, public.ilike_or('t.skills', 'skills', cardinality(f.skills))); end if;
  if f.languages is not null then t := array_append(t, public.ilike_or('t.languages', 'languages', cardinality(f.languages))); end if;
  if f.tech is not null then t := array_append(t, public.ilike_or('t.tech', 'tech', cardinality(f.tech))); end if;
  if cardinality(t) > 0 then
    c := array_append(c, 's.contact_id in (select t.contact_id from public.lead_text t where ' || array_to_string(t, ' and ') || ')');
  end if;
  return case when cardinality(c) = 0 then 'true' else array_to_string(c, ' and ') end;
end $$;
revoke all on function public.lead_where(public.lead_query) from public, anon, authenticated;

create or replace function public.local_where(f public.local_query)
returns text language plpgsql immutable as $$
declare c text[] := '{}';
begin
  if f.q is not null then c := array_append(c, '(l.name ilike $1.q or l.all_categories ilike $1.q or l.domain ilike $1.q)'::text); end if;
  if f.keywords is not null then c := array_append(c, 'l.keyword = any ($1.keywords)'::text); end if;
  if f.categories is not null then c := array_append(c, public.ilike_or('l.all_categories', 'categories', cardinality(f.categories))); end if;
  if f.cities is not null then c := array_append(c, public.ilike_or('l.area', 'cities', cardinality(f.cities))); end if;
  if f.postcodes is not null then c := array_append(c, 'l.postcode like any ($1.postcodes)'::text); end if;
  if f.countries is not null then c := array_append(c, 'l.country = any ($1.countries)'::text); end if;
  if f.min_rating is not null then c := array_append(c, 'l.rating >= $1.min_rating'::text); end if;
  if f.max_rating is not null then c := array_append(c, 'l.rating <= $1.max_rating'::text); end if;
  if f.has_rating is not null then c := array_append(c, case when f.has_rating then 'l.rating is not null' else 'l.rating is null' end); end if;
  if f.has_phone is not null then c := array_append(c, 'l.has_phone = $1.has_phone'::text); end if;
  if f.mobile_only is not null then c := array_append(c, case when f.mobile_only then 'l.has_mobile' else 'not l.has_mobile' end); end if;
  if f.has_email is not null then c := array_append(c, case when f.has_email then 'l.has_email' else 'not l.has_email' end); end if;
  if f.has_website is not null then c := array_append(c, 'l.has_website = $1.has_website'::text); end if;
  if f.has_whatsapp is not null then c := array_append(c, case when f.has_whatsapp then 'l.has_whatsapp' else 'not l.has_whatsapp' end); end if;
  if f.has_facebook is not null then c := array_append(c, 'l.has_facebook = $1.has_facebook'::text); end if;
  if f.has_instagram is not null then c := array_append(c, 'l.has_instagram = $1.has_instagram'::text); end if;
  if f.has_linkedin is not null then c := array_append(c, 'l.has_linkedin = $1.has_linkedin'::text); end if;
  if f.open_saturday is not null then c := array_append(c, 'l.open_saturday = $1.open_saturday'::text); end if;
  if f.open_sunday is not null then c := array_append(c, 'l.open_sunday = $1.open_sunday'::text); end if;
  if f.domains is not null then c := array_append(c, 'l.domain ilike any ($1.domains)'::text); end if;
  return case when cardinality(c) = 0 then 'true' else array_to_string(c, ' and ') end;
end $$;
revoke all on function public.local_where(public.local_query) from public, anon, authenticated;

-- counts: exact up to 10,000, or null if that takes more than a few seconds
create or replace function public.count_leads(p_workspace_id uuid, p_filters jsonb default '{}')
returns integer
language plpgsql stable security definer
set search_path = public
set statement_timeout = '6s'
as $$
declare f public.lead_query := public.lead_query_from(coalesce(p_filters, '{}')); n integer;
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  begin
    execute 'select count(*) from (select 1 from public.lead_search s where ' || public.lead_where(f) || ' limit 10001) c' into n using f;
  exception when query_canceled then
    return null;
  end;
  return n;
end $$;

create or replace function public.count_local(p_workspace_id uuid, p_filters jsonb default '{}')
returns integer
language plpgsql stable security definer
set search_path = public
set statement_timeout = '6s'
as $$
declare f public.local_query := public.local_query_from(coalesce(p_filters, '{}')); n integer;
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  begin
    execute 'select count(*) from (select 1 from public.local_search l where ' || public.local_where(f) || ' limit 10001) c' into n using f;
  exception when query_canceled then
    return null;
  end;
  return n;
end $$;

-- refresh keeps lead_text and the derived local columns in step
create or replace function public.refresh_search_tables()
returns void language plpgsql security definer set search_path = public set statement_timeout = 0 as $$
begin
  truncate public.lead_search;
  insert into public.lead_search (contact_id, full_name, current_title, company, company_domain, website, seniority, department,
                                  company_industry, main_industry, size, employees, revenue, founded, hq_country, country, city, state, location,
                                  has_mobile, mobile_prefix, has_email, email_status, has_personal_email, has_linkedin, open_to_work, is_hiring,
                                  role_start, funding, smart_tags)
  select distinct on (d.contact_id)
         d.contact_id, d.full_name, d.current_title, coalesce(nullif(d.company_name, ''), d.current_employer), d.company_domain,
         d.current_employer_website, nullif(d.seniority_level, ''), nullif(d.department, ''), nullif(d.company_industry, ''),
         nullif(d.main_industry, ''), nullif(d.employee_count_range, ''), d.linkedin_employee_count_exact, nullif(d.revenue_range, ''),
         extract(year from d.company_founded_year)::integer, nullif(d.company_hq_country, ''), nullif(d.contact_country, ''),
         d.contact_city, d.contact_state, d.contact_location,
         coalesce(d.mobile_phone, '') <> '', left(nullif(regexp_replace(coalesce(d.mobile_phone, ''), '[^0-9+]', '', 'g'), ''), 6),
         coalesce(d.work_email, '') <> '', nullif(d.email_status, ''), coalesce(d.personal_emails, '') <> '',
         coalesce(d.linkedin_url, '') <> '', coalesce(d.open_to_work, false), coalesce(d.is_hiring, false),
         d.role_start_date, nullif(d.last_funding_type, ''), d.smart_tags
    from public.data_list d
   where d.contact_id is not null
   order by d.contact_id;

  truncate public.lead_text;
  insert into public.lead_text
  select distinct on (contact_id) contact_id, nullif(skills, ''), nullif(languages, ''), nullif(company_tech_stack, '')
    from public.data_list
   where contact_id is not null and (coalesce(skills, '') <> '' or coalesce(languages, '') <> '' or coalesce(company_tech_stack, '') <> '')
   order by contact_id;

  truncate public.local_search;
  insert into public.local_search (place_id, name, category, all_categories, keyword, city, municipality, neighbourhood, postcode, country,
                                   rating, domain, has_phone, has_mobile, has_email, has_website, has_whatsapp, has_facebook, has_instagram,
                                   has_linkedin, open_saturday, open_sunday, area)
  select distinct on (g."Place ID")
         g."Place ID", g."Name", g."Category", coalesce(nullif(g."All Categories", ''), g."Category"), g."Keyword", g."City", g."Municipality",
         g."Neighborhood", nullif(upper(replace(coalesce(g."Zip", ''), ' ', '')), ''), g."Country", g."Average Rating", g."Domain",
         coalesce(g."Phone Standard Format", '') <> '', coalesce(g."Phone Standard Format", '') like '+44 7%',
         coalesce(g."Email 1", '') <> '', coalesce(g."Website", '') <> '', coalesce(g."WhatsApp", '') <> '',
         coalesce(g."Facebook", '') <> '', coalesce(g."Instagram", '') <> '', coalesce(g."LinkedIn", '') <> '',
         coalesce(g."Hours", '') ilike '%Saturday:%' and coalesce(g."Hours", '') not ilike '%Saturday: Closed%',
         coalesce(g."Hours", '') ilike '%Sunday:%' and coalesce(g."Hours", '') not ilike '%Sunday: Closed%',
         nullif(concat_ws(' · ', g."City", g."Municipality", g."Neighborhood"), '')
    from public.google_businesses g
   where g."Place ID" is not null
   order by g."Place ID";

  analyze public.lead_search;
  analyze public.lead_text;
  analyze public.local_search;
  perform public.refresh_search_facets();
end $$;
revoke all on function public.refresh_search_tables() from public, anon, authenticated;

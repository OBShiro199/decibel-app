-- 0019: slim search tables so filtering stays in memory.
--
-- data_list rows average ~2 KB (bios, skills, tech stacks, JSON) and google_businesses ~2 KB,
-- so on this instance (~384 MB cache) scans read mostly from disk. lead_search and
-- local_search hold only the columns filters need (~a quarter of the size, fully indexed);
-- searches pick the page of ids there, then fetch full rows for those ids only.
-- Skills, languages and tech stack stay in data_list and are checked per candidate.
--
-- After loading new rows into data_list or google_businesses, run:
--   select public.refresh_search_tables();

set statement_timeout = 0;

create table public.lead_search (
  contact_id          uuid primary key,
  full_name           text,
  current_title       text,
  company             text,
  company_domain      text,
  website             text,
  seniority           text,
  department          text,
  company_industry    text,
  main_industry       text,
  size                text,
  employees           integer,
  revenue             text,
  founded             integer,
  hq_country          text,
  country             text,
  city                text,
  state               text,
  location            text,
  has_mobile          boolean not null default false,
  mobile_prefix       text,       -- e.g. +4479..., for dial-code filters
  has_email           boolean not null default false,
  email_status        text,
  has_personal_email  boolean not null default false,
  has_linkedin        boolean not null default false,
  open_to_work        boolean not null default false,
  is_hiring           boolean not null default false,
  role_start          date,
  funding             text,
  smart_tags          text
);
alter table public.lead_search enable row level security;
revoke all on public.lead_search from anon, authenticated;

create table public.local_search (
  place_id        text primary key,
  name            text,
  category        text,
  all_categories  text,
  keyword         text,
  city            text,
  municipality    text,
  neighbourhood   text,
  postcode        text,        -- upper case, no spaces
  country         text,
  rating          numeric,
  domain          text,
  has_phone       boolean not null default false,
  has_mobile      boolean not null default false,
  has_email       boolean not null default false,
  has_website     boolean not null default false,
  has_whatsapp    boolean not null default false,
  has_facebook    boolean not null default false,
  has_instagram   boolean not null default false,
  has_linkedin    boolean not null default false,
  open_saturday   boolean not null default false,
  open_sunday     boolean not null default false
);
alter table public.local_search enable row level security;
revoke all on public.local_search from anon, authenticated;

create or replace function public.refresh_search_tables()
returns void language plpgsql security definer set search_path = public set statement_timeout = 0 as $$
begin
  truncate public.lead_search;
  insert into public.lead_search
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

  truncate public.local_search;
  insert into public.local_search
  select distinct on (g."Place ID")
         g."Place ID", g."Name", g."Category", g."All Categories", g."Keyword", g."City", g."Municipality", g."Neighborhood",
         nullif(upper(replace(coalesce(g."Zip", ''), ' ', '')), ''), g."Country", g."Average Rating", g."Domain",
         coalesce(g."Phone Standard Format", '') <> '', coalesce(g."Phone Standard Format", '') like '+44 7%',
         coalesce(g."Email 1", '') <> '', coalesce(g."Website", '') <> '', coalesce(g."WhatsApp", '') <> '',
         coalesce(g."Facebook", '') <> '', coalesce(g."Instagram", '') <> '', coalesce(g."LinkedIn", '') <> '',
         coalesce(g."Hours", '') ilike '%Saturday:%' and coalesce(g."Hours", '') not ilike '%Saturday: Closed%',
         coalesce(g."Hours", '') ilike '%Sunday:%' and coalesce(g."Hours", '') not ilike '%Sunday: Closed%'
    from public.google_businesses g
   where g."Place ID" is not null
   order by g."Place ID";

  analyze public.lead_search;
  analyze public.local_search;
  perform public.refresh_search_facets();
end $$;
revoke all on function public.refresh_search_tables() from public, anon, authenticated;

-- the wide-table indexes from 0017 are replaced by these (contact_id and Place ID stay for row fetches)
drop index if exists public.data_list_seniority_idx;
drop index if exists public.data_list_size_idx;
drop index if exists public.data_list_country_idx;
drop index if exists public.data_list_industry_idx;
drop index if exists public.data_list_main_ind_idx;
drop index if exists public.data_list_department_idx;
drop index if exists public.data_list_title_trgm_idx;
drop index if exists public.data_list_company_trgm_idx;
drop index if exists public.data_list_name_trgm_idx;
drop index if exists public.gb_category_idx;
drop index if exists public.gb_city_idx;
drop index if exists public.gb_keyword_idx;
drop index if exists public.gb_name_trgm_idx;

-- ---------------------------------------------------------------------------
-- Filters, now over the slim tables (fixed SQL fragments; values come from $1)
-- ---------------------------------------------------------------------------
create or replace function public.lead_where(f public.lead_query)
returns text language plpgsql immutable as $$
declare c text[] := '{}';
begin
  if f.q is not null then c := array_append(c, '(s.full_name ilike $1.q or s.current_title ilike $1.q or s.company ilike $1.q)'::text); end if;
  if f.titles is not null then c := array_append(c, 's.current_title ilike any ($1.titles)'::text); end if;
  if f.titles_not is not null then c := array_append(c, 'not coalesce(s.current_title, '''') ilike any ($1.titles_not)'::text); end if;
  if f.seniorities is not null then c := array_append(c, 's.seniority = any ($1.seniorities)'::text); end if;
  if f.departments is not null then c := array_append(c, 's.department = any ($1.departments)'::text); end if;
  if f.industries is not null then c := array_append(c, '(s.company_industry = any ($1.industries) or s.main_industry = any ($1.industries))'::text); end if;
  if f.industries_not is not null then c := array_append(c, 'not (coalesce(s.company_industry, '''') = any ($1.industries_not) or coalesce(s.main_industry, '''') = any ($1.industries_not))'::text); end if;
  if f.sizes is not null then c := array_append(c, 's.size = any ($1.sizes)'::text); end if;
  if f.emp_min is not null then c := array_append(c, 's.employees >= $1.emp_min'::text); end if;
  if f.emp_max is not null then c := array_append(c, 's.employees <= $1.emp_max'::text); end if;
  if f.revenues is not null then c := array_append(c, 's.revenue = any ($1.revenues)'::text); end if;
  if f.countries is not null then c := array_append(c, 's.country = any ($1.countries)'::text); end if;
  if f.hq_countries is not null then c := array_append(c, 's.hq_country = any ($1.hq_countries)'::text); end if;
  if f.cities is not null then c := array_append(c, '(s.city ilike any ($1.cities) or s.state ilike any ($1.cities) or s.location ilike any ($1.cities))'::text); end if;
  if f.companies is not null then c := array_append(c, 's.company ilike any ($1.companies)'::text); end if;
  if f.companies_not is not null then c := array_append(c, 'not coalesce(s.company, '''') ilike any ($1.companies_not)'::text); end if;
  if f.domains is not null then c := array_append(c, '(s.company_domain ilike any ($1.domains) or s.website ilike any ($1.domains))'::text); end if;
  if f.has_mobile is not null then c := array_append(c, 's.has_mobile = $1.has_mobile'::text); end if;
  if f.mobile_codes is not null then c := array_append(c, 's.mobile_prefix like any ($1.mobile_codes)'::text); end if;
  if f.has_email is not null then c := array_append(c, 's.has_email = $1.has_email'::text); end if;
  if f.email_status is not null then c := array_append(c, 's.email_status = any ($1.email_status)'::text); end if;
  if f.has_personal_email is not null then c := array_append(c, 's.has_personal_email = $1.has_personal_email'::text); end if;
  if f.has_linkedin is not null then c := array_append(c, 's.has_linkedin = $1.has_linkedin'::text); end if;
  if f.open_to_work is not null then c := array_append(c, 's.open_to_work = $1.open_to_work'::text); end if;
  if f.is_hiring is not null then c := array_append(c, 's.is_hiring = $1.is_hiring'::text); end if;
  if f.tenure_min is not null then c := array_append(c, 's.role_start <= (current_date - make_interval(months => $1.tenure_min))'::text); end if;
  if f.tenure_max is not null then c := array_append(c, 's.role_start >= (current_date - make_interval(months => $1.tenure_max))'::text); end if;
  if f.founded_min is not null then c := array_append(c, 's.founded >= $1.founded_min'::text); end if;
  if f.founded_max is not null then c := array_append(c, 's.founded <= $1.founded_max'::text); end if;
  if f.funding is not null then c := array_append(c, 's.funding = any ($1.funding)'::text); end if;
  if f.has_funding is not null then c := array_append(c, '(s.funding is not null) = $1.has_funding'::text); end if;
  if f.tags is not null then c := array_append(c, 's.smart_tags ilike any ($1.tags)'::text); end if;
  -- long text lives in data_list: checked for each candidate
  if f.skills is not null then c := array_append(c, 'exists (select 1 from public.data_list x where x.contact_id = s.contact_id and x.skills ilike any ($1.skills))'::text); end if;
  if f.languages is not null then c := array_append(c, 'exists (select 1 from public.data_list x where x.contact_id = s.contact_id and x.languages ilike any ($1.languages))'::text); end if;
  if f.tech is not null then c := array_append(c, 'exists (select 1 from public.data_list x where x.contact_id = s.contact_id and x.company_tech_stack ilike any ($1.tech))'::text); end if;
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
          d.role_start_date, coalesce(nullif(d.company_name, ''''), d.current_employer), d.company_domain, d.company_industry, d.main_industry,
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
     from (select s.contact_id from public.lead_search s where ' || public.lead_where(f) || '
            order by s.contact_id limit $3 offset $4) c
     cross join lateral (select * from public.data_list x where x.contact_id = c.contact_id limit 1) d
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
  execute 'select count(*) from (select 1 from public.lead_search s where ' || public.lead_where(f) || ' limit 10001) c' into n using f;
  return n;
end $$;

create or replace function public.local_where(f public.local_query)
returns text language plpgsql immutable as $$
declare c text[] := '{}';
begin
  if f.q is not null then c := array_append(c, '(l.name ilike $1.q or l.category ilike $1.q or l.domain ilike $1.q)'::text); end if;
  if f.keywords is not null then c := array_append(c, 'l.keyword = any ($1.keywords)'::text); end if;
  if f.categories is not null then c := array_append(c, '(l.category ilike any ($1.categories) or l.all_categories ilike any ($1.categories))'::text); end if;
  if f.cities is not null then c := array_append(c, '(l.city ilike any ($1.cities) or l.municipality ilike any ($1.cities) or l.neighbourhood ilike any ($1.cities))'::text); end if;
  if f.postcodes is not null then c := array_append(c, 'l.postcode like any ($1.postcodes)'::text); end if;
  if f.countries is not null then c := array_append(c, 'l.country = any ($1.countries)'::text); end if;
  if f.min_rating is not null then c := array_append(c, 'l.rating >= $1.min_rating'::text); end if;
  if f.max_rating is not null then c := array_append(c, 'l.rating <= $1.max_rating'::text); end if;
  if f.has_rating is not null then c := array_append(c, '(l.rating is not null) = $1.has_rating'::text); end if;
  if f.has_phone is not null then c := array_append(c, 'l.has_phone = $1.has_phone'::text); end if;
  if f.mobile_only is not null then c := array_append(c, 'l.has_mobile = $1.mobile_only'::text); end if;
  if f.has_email is not null then c := array_append(c, 'l.has_email = $1.has_email'::text); end if;
  if f.has_website is not null then c := array_append(c, 'l.has_website = $1.has_website'::text); end if;
  if f.has_whatsapp is not null then c := array_append(c, 'l.has_whatsapp = $1.has_whatsapp'::text); end if;
  if f.has_facebook is not null then c := array_append(c, 'l.has_facebook = $1.has_facebook'::text); end if;
  if f.has_instagram is not null then c := array_append(c, 'l.has_instagram = $1.has_instagram'::text); end if;
  if f.has_linkedin is not null then c := array_append(c, 'l.has_linkedin = $1.has_linkedin'::text); end if;
  if f.open_saturday is not null then c := array_append(c, 'l.open_saturday = $1.open_saturday'::text); end if;
  if f.open_sunday is not null then c := array_append(c, 'l.open_sunday = $1.open_sunday'::text); end if;
  if f.domains is not null then c := array_append(c, 'l.domain ilike any ($1.domains)'::text); end if;
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
     from (select l.place_id from public.local_search l where ' || public.local_where(f) || '
            order by l.place_id limit $2 offset $3) c
     cross join lateral (select * from public.google_businesses x where x."Place ID" = c.place_id limit 1) g
    order by g."Place ID"'
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
  execute 'select count(*) from (select 1 from public.local_search l where ' || public.local_where(f) || ' limit 10001) c' into n using f;
  return n;
end $$;

-- facets now read the slim tables
create or replace function public.refresh_search_facets()
returns void language plpgsql security definer set search_path = public set statement_timeout = '10min' as $$
begin
  delete from public.search_facets;
  insert into public.search_facets (source, facet, value, n)
  select 'leads', f, v, n from (
    select 'seniority' f, seniority v, count(*) n from lead_search where seniority is not null group by 2
    union all select 'department', department, count(*) from lead_search where department is not null group by 2
    union all select 'size', size, count(*) from lead_search where size is not null group by 2
    union all select 'revenue', revenue, count(*) from lead_search where revenue is not null group by 2
    union all select 'country', country, count(*) from lead_search where country is not null group by 2
    union all select 'hq_country', hq_country, count(*) from lead_search where hq_country is not null group by 2
    union all select 'email_status', email_status, count(*) from lead_search where email_status is not null group by 2
    union all select 'funding', funding, count(*) from lead_search where funding is not null group by 2
    union all (select 'industry', i, count(*) from (select coalesce(main_industry, company_industry) i from lead_search) s
                where i is not null group by 1, 2 order by 3 desc limit 400)
    union all (select 'mobile_code', '+' || substring(mobile_prefix from '^\+(353|351|358|420|352|44|49|31|39|33|34|46|41|47|45|32|43|48|30|40|36|1)'), count(*)
                from lead_search where mobile_prefix like '+%' group by 2 having count(*) >= 20 order by 3 desc limit 40)
    union all (select 'tag', btrim(t), count(*) from lead_search, unnest(string_to_array(smart_tags, ',')) t
                where coalesce(smart_tags, '') <> '' group by 2 order by 3 desc limit 60)
  ) x where v is not null and v <> '+';

  insert into public.search_facets (source, facet, value, n)
  select 'local', f, v, n from (
    (select 'keyword' f, keyword v, count(*) n from local_search where coalesce(keyword, '') <> '' group by 2 order by 3 desc limit 1000)
    union all (select 'category', category, count(*) from local_search where coalesce(category, '') <> '' group by 2 order by 3 desc limit 500)
    union all (select 'city', city, count(*) from local_search where coalesce(city, '') <> '' group by 2 order by 3 desc limit 500)
    union all select 'country', country, count(*) from local_search where coalesce(country, '') <> '' group by 2
  ) x where v is not null;
end $$;
revoke all on function public.refresh_search_facets() from public, anon, authenticated;

select public.refresh_search_tables();

-- indexes on the slim tables (built after the load: faster than maintaining them during it)
create index lead_search_seniority_idx  on public.lead_search (seniority);
create index lead_search_size_idx       on public.lead_search (size);
create index lead_search_country_idx    on public.lead_search (country);
create index lead_search_industry_idx   on public.lead_search (main_industry);
create index lead_search_cindustry_idx  on public.lead_search (company_industry);
create index lead_search_department_idx on public.lead_search (department);
create index lead_search_mobile_idx     on public.lead_search (contact_id) where has_mobile;
create index lead_search_title_trgm     on public.lead_search using gin (current_title gin_trgm_ops);
create index lead_search_company_trgm   on public.lead_search using gin (company gin_trgm_ops);
create index lead_search_name_trgm      on public.lead_search using gin (full_name gin_trgm_ops);
create index local_search_keyword_idx   on public.local_search (keyword);
create index local_search_category_idx  on public.local_search (category);
create index local_search_city_idx      on public.local_search (city);
create index local_search_mobile_idx    on public.local_search (place_id) where has_mobile;
create index local_search_name_trgm     on public.local_search using gin (name gin_trgm_ops);
create index local_search_cats_trgm     on public.local_search using gin (all_categories gin_trgm_ops);
analyze public.lead_search;
analyze public.local_search;

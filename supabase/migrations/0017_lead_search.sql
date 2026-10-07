-- 0017: search the real lead tables (data_list: people at companies; google_businesses:
-- local business listings) with stackable filters, and reveal leads for credits.
--
-- Both tables keep RLS on with no policies: browsers never read them directly. Everything
-- goes through security-definer functions that check workspace membership, cap work with a
-- statement timeout, and (for data_list) mask mobiles and emails until the workspace has
-- revealed that lead. A revealed lead becomes a row in `people` (source_lead_id), charged
-- one credit through the same ledger, allowance and locking as reveal_contacts (0010).
--
-- Filters arrive as jsonb from the browser and are parsed into a typed record; every
-- condition is "filter absent OR condition", so any combination stacks with AND, and the
-- values inside one filter combine with OR (e.g. titles: CEO or Founder).

-- index builds on ~690k rows can outlast the session's default timeout
set statement_timeout = 0;

-- ---------------------------------------------------------------------------
-- 1. Indexes (ordering for paging, selective filters, fuzzy text)
-- ---------------------------------------------------------------------------
create index if not exists data_list_contact_id_idx   on public.data_list (contact_id);
create index if not exists data_list_seniority_idx    on public.data_list (seniority_level);
create index if not exists data_list_size_idx         on public.data_list (employee_count_range);
create index if not exists data_list_country_idx      on public.data_list (contact_country);
create index if not exists data_list_industry_idx     on public.data_list (company_industry);
create index if not exists data_list_main_ind_idx     on public.data_list (main_industry);
create index if not exists data_list_department_idx   on public.data_list (department);
create index if not exists data_list_title_trgm_idx   on public.data_list using gin (current_title gin_trgm_ops);
create index if not exists data_list_company_trgm_idx on public.data_list using gin (company_name gin_trgm_ops);
create index if not exists data_list_name_trgm_idx    on public.data_list using gin (full_name gin_trgm_ops);

create index if not exists gb_place_idx      on public.google_businesses ("Place ID");
create index if not exists gb_category_idx   on public.google_businesses ("Category");
create index if not exists gb_city_idx       on public.google_businesses ("City");
create index if not exists gb_keyword_idx    on public.google_businesses ("Keyword");
create index if not exists gb_name_trgm_idx  on public.google_businesses using gin ("Name" gin_trgm_ops);

-- ---------------------------------------------------------------------------
-- 2. Helpers
-- ---------------------------------------------------------------------------
-- jsonb array of strings -> trimmed text[] (null when absent or empty; at most 50 values)
create or replace function public.jtext(j jsonb, k text)
returns text[] language sql immutable as $$
  select case when jsonb_typeof(j -> k) = 'array' then
    nullif(array(select left(btrim(x), 120) from jsonb_array_elements_text(j -> k) with ordinality t(x, o)
                  where btrim(x) <> '' and o <= 50), '{}')
  end
$$;

-- same, as ILIKE "contains" patterns with %, _ and \ escaped
create or replace function public.jlike(j jsonb, k text)
returns text[] language sql immutable as $$
  select nullif(array(select '%' || replace(replace(replace(x, '\', '\\'), '%', '\%'), '_', '\_') || '%'
                        from unnest(public.jtext(j, k)) x), '{}')
$$;

create or replace function public.jbool(j jsonb, k text)
returns boolean language sql immutable as $$
  select case when jsonb_typeof(j -> k) = 'boolean' then (j ->> k)::boolean end
$$;

create or replace function public.jint(j jsonb, k text)
returns integer language sql immutable as $$
  select case when jsonb_typeof(j -> k) = 'number' then least(greatest((j ->> k)::numeric, -1e9), 1e9)::integer end
$$;

create or replace function public.jnum(j jsonb, k text)
returns numeric language sql immutable as $$
  select case when jsonb_typeof(j -> k) = 'number' then (j ->> k)::numeric end
$$;

create or replace function public.lead_country_iso(c text)
returns char(2) language sql immutable as $$
  select case lower(btrim(coalesce(c, '')))
    when 'united kingdom' then 'GB' when 'germany' then 'DE' when 'netherlands' then 'NL' when 'italy' then 'IT'
    when 'france' then 'FR' when 'spain' then 'ES' when 'ireland' then 'IE' when 'portugal' then 'PT'
    when 'sweden' then 'SE' when 'switzerland' then 'CH' when 'norway' then 'NO' when 'finland' then 'FI'
    when 'denmark' then 'DK' when 'belgium' then 'BE' when 'austria' then 'AT' when 'poland' then 'PL'
    when 'czechia' then 'CZ' when 'czech republic' then 'CZ' when 'luxembourg' then 'LU' when 'greece' then 'GR'
    when 'romania' then 'RO' when 'hungary' then 'HU' when 'united states' then 'US' when 'canada' then 'CA'
    when 'australia' then 'AU' when 'iceland' then 'IS' when 'estonia' then 'EE' when 'latvia' then 'LV'
    when 'lithuania' then 'LT' when 'slovakia' then 'SK' when 'slovenia' then 'SI' when 'croatia' then 'HR'
    when 'bulgaria' then 'BG' when 'malta' then 'MT' when 'cyprus' then 'CY'
    else null end
$$;

-- "+44 7958 023746" -> "+447958023746"; null when it is not a plausible E.164 number
create or replace function public.lead_e164(p text)
returns text language sql immutable as $$
  select case when x ~ '^\+[1-9][0-9]{6,14}$' then x end
    from (select regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g') as x) s
$$;

-- ---------------------------------------------------------------------------
-- 3. Lead search (data_list)
-- ---------------------------------------------------------------------------
create type public.lead_query as (
  q text,
  titles text[], titles_not text[], seniorities text[], departments text[],
  industries text[], industries_not text[], sizes text[], emp_min integer, emp_max integer, revenues text[],
  countries text[], hq_countries text[], cities text[],
  companies text[], companies_not text[], domains text[],
  has_mobile boolean, mobile_codes text[], has_email boolean, email_status text[], has_personal_email boolean, has_linkedin boolean,
  open_to_work boolean, is_hiring boolean, tenure_min integer, tenure_max integer, founded_min integer, founded_max integer,
  funding text[], has_funding boolean, skills text[], languages text[], tech text[], tags text[]
);

create or replace function public.lead_query_from(j jsonb)
returns public.lead_query language sql immutable as $$
  select row(
    nullif('%' || replace(replace(replace(left(btrim(coalesce(j ->> 'q', '')), 120), '\', '\\'), '%', '\%'), '_', '\_') || '%', '%%'),
    public.jlike(j, 'titles'), public.jlike(j, 'titlesNot'), public.jtext(j, 'seniorities'), public.jtext(j, 'departments'),
    public.jtext(j, 'industries'), public.jtext(j, 'industriesNot'), public.jtext(j, 'sizes'), public.jint(j, 'employeesMin'), public.jint(j, 'employeesMax'), public.jtext(j, 'revenues'),
    public.jtext(j, 'countries'), public.jtext(j, 'hqCountries'), public.jlike(j, 'cities'),
    public.jlike(j, 'companies'), public.jlike(j, 'companiesNot'), public.jlike(j, 'domains'),
    public.jbool(j, 'hasMobile'), (select nullif(array(select x || '%' from unnest(public.jtext(j, 'mobileCodes')) x where x ~ '^\+[0-9]{1,4}$'), '{}')),
    public.jbool(j, 'hasEmail'), public.jtext(j, 'emailStatus'), public.jbool(j, 'hasPersonalEmail'), public.jbool(j, 'hasLinkedin'),
    public.jbool(j, 'openToWork'), public.jbool(j, 'isHiring'), public.jint(j, 'tenureMin'), public.jint(j, 'tenureMax'),
    public.jint(j, 'foundedMin'), public.jint(j, 'foundedMax'),
    public.jtext(j, 'funding'), public.jbool(j, 'hasFunding'), public.jlike(j, 'skills'), public.jlike(j, 'languages'), public.jlike(j, 'tech'), public.jlike(j, 'tags')
  )::public.lead_query
$$;

-- every filter in one place; inlined by the planner into the queries below
create or replace function public.lead_filter(f public.lead_query)
returns setof public.data_list language sql stable as $$
  select d.* from public.data_list d
   where (f.q is null or d.full_name ilike f.q or d.current_title ilike f.q or d.company_name ilike f.q or d.current_employer ilike f.q)
     and (f.titles is null or d.current_title ilike any (f.titles))
     and (f.titles_not is null or not coalesce(d.current_title, '') ilike any (f.titles_not))
     and (f.seniorities is null or d.seniority_level = any (f.seniorities))
     and (f.departments is null or d.department = any (f.departments))
     and (f.industries is null or d.company_industry = any (f.industries) or d.main_industry = any (f.industries))
     and (f.industries_not is null or not (coalesce(d.company_industry, '') = any (f.industries_not) or coalesce(d.main_industry, '') = any (f.industries_not)))
     and (f.sizes is null or d.employee_count_range = any (f.sizes))
     and (f.emp_min is null or d.linkedin_employee_count_exact >= f.emp_min)
     and (f.emp_max is null or d.linkedin_employee_count_exact <= f.emp_max)
     and (f.revenues is null or d.revenue_range = any (f.revenues))
     and (f.countries is null or d.contact_country = any (f.countries))
     and (f.hq_countries is null or d.company_hq_country = any (f.hq_countries))
     and (f.cities is null or d.contact_city ilike any (f.cities) or d.contact_state ilike any (f.cities) or d.contact_location ilike any (f.cities))
     and (f.companies is null or d.company_name ilike any (f.companies) or d.current_employer ilike any (f.companies))
     and (f.companies_not is null or not (coalesce(d.company_name, '') ilike any (f.companies_not) or coalesce(d.current_employer, '') ilike any (f.companies_not)))
     and (f.domains is null or d.company_domain ilike any (f.domains) or d.current_employer_website ilike any (f.domains))
     and (f.has_mobile is null or (coalesce(d.mobile_phone, '') <> '') = f.has_mobile)
     and (f.mobile_codes is null or replace(d.mobile_phone, ' ', '') like any (f.mobile_codes))
     and (f.has_email is null or (coalesce(d.work_email, '') <> '') = f.has_email)
     and (f.email_status is null or d.email_status = any (f.email_status))
     and (f.has_personal_email is null or (coalesce(d.personal_emails, '') <> '') = f.has_personal_email)
     and (f.has_linkedin is null or (coalesce(d.linkedin_url, '') <> '') = f.has_linkedin)
     and (f.open_to_work is null or coalesce(d.open_to_work, false) = f.open_to_work)
     and (f.is_hiring is null or coalesce(d.is_hiring, false) = f.is_hiring)
     and (f.tenure_min is null or d.role_start_date <= (current_date - make_interval(months => f.tenure_min)))
     and (f.tenure_max is null or d.role_start_date >= (current_date - make_interval(months => f.tenure_max)))
     and (f.founded_min is null or extract(year from d.company_founded_year) >= f.founded_min)
     and (f.founded_max is null or extract(year from d.company_founded_year) <= f.founded_max)
     and (f.funding is null or d.last_funding_type = any (f.funding))
     and (f.has_funding is null or (coalesce(d.last_funding_type, '') <> '') = f.has_funding)
     and (f.skills is null or d.skills ilike any (f.skills))
     and (f.languages is null or d.languages ilike any (f.languages))
     and (f.tech is null or d.company_tech_stack ilike any (f.tech))
     and (f.tags is null or d.smart_tags ilike any (f.tags))
$$;
revoke all on function public.lead_filter(public.lead_query) from public, anon, authenticated;

-- One page of leads, masked unless this workspace has revealed them.
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
  return query
  select d.contact_id, d.full_name, d.first_name, d.last_name, d.current_title, d.seniority_level, d.department,
         d.role_start_date, coalesce(d.company_name, d.current_employer), d.company_domain, d.company_industry, d.main_industry,
         d.employee_count_range, d.linkedin_employee_count_exact, d.revenue_range, extract(year from d.company_founded_year)::integer, d.company_hq_country,
         d.contact_country, d.contact_city, d.contact_location, d.linkedin_url,
         coalesce(d.mobile_phone, '') <> '',
         -- revealed: the workspace's own copy; otherwise masked
         case when p.id is not null then p.mobile_e164 else public.mask_phone(public.lead_e164(d.mobile_phone)) end,
         coalesce(d.work_email, '') <> '',
         case when p.id is not null then p.email::text
              when coalesce(d.work_email, '') <> '' then '•••@' || split_part(d.work_email, '@', 2) end,
         d.email_status, coalesce(d.personal_emails, '') <> '',
         coalesce(d.open_to_work, false), coalesce(d.is_hiring, false), d.last_funding_type, d.total_funding_amount, d.smart_tags,
         p.id
    from public.lead_filter(f) d
    left join public.people p on p.workspace_id = p_workspace_id and p.source_lead_id = d.contact_id
   order by d.contact_id
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
  offset least(greatest(coalesce(p_offset, 0), 0), 10000);
end $$;

-- How many leads match, exactly up to 10,000 (the browser shows "10,000+" above that).
create or replace function public.count_leads(p_workspace_id uuid, p_filters jsonb default '{}')
returns integer
language plpgsql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare f public.lead_query := public.lead_query_from(coalesce(p_filters, '{}')); n integer;
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  select count(*) into n from (select 1 from public.lead_filter(f) limit 10001) s;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Local business search (google_businesses): public listing data, shown in full
-- ---------------------------------------------------------------------------
create type public.local_query as (
  q text, keywords text[], categories text[], cities text[], postcodes text[], countries text[],
  min_rating numeric, max_rating numeric, has_rating boolean, has_phone boolean, mobile_only boolean,
  has_email boolean, has_website boolean, has_whatsapp boolean, has_facebook boolean, has_instagram boolean,
  has_linkedin boolean, open_saturday boolean, open_sunday boolean, domains text[]
);

create or replace function public.local_query_from(j jsonb)
returns public.local_query language sql immutable as $$
  select row(
    nullif('%' || replace(replace(replace(left(btrim(coalesce(j ->> 'q', '')), 120), '\', '\\'), '%', '\%'), '_', '\_') || '%', '%%'),
    public.jtext(j, 'keywords'), public.jlike(j, 'categories'), public.jlike(j, 'cities'),
    (select nullif(array(select upper(replace(x, ' ', '')) || '%' from unnest(public.jtext(j, 'postcodes')) x where x ~* '^[a-z0-9 ]{1,8}$'), '{}')),
    public.jtext(j, 'countries'),
    public.jnum(j, 'minRating'), public.jnum(j, 'maxRating'), public.jbool(j, 'hasRating'), public.jbool(j, 'hasPhone'), public.jbool(j, 'mobileOnly'),
    public.jbool(j, 'hasEmail'), public.jbool(j, 'hasWebsite'), public.jbool(j, 'hasWhatsapp'), public.jbool(j, 'hasFacebook'), public.jbool(j, 'hasInstagram'),
    public.jbool(j, 'hasLinkedin'), public.jbool(j, 'openSaturday'), public.jbool(j, 'openSunday'), public.jlike(j, 'domains')
  )::public.local_query
$$;

create or replace function public.local_filter(f public.local_query)
returns setof public.google_businesses language sql stable as $$
  select g.* from public.google_businesses g
   where (f.q is null or g."Name" ilike f.q or g."Category" ilike f.q or g."Domain" ilike f.q)
     and (f.keywords is null or g."Keyword" = any (f.keywords))
     and (f.categories is null or g."Category" ilike any (f.categories) or g."All Categories" ilike any (f.categories))
     and (f.cities is null or g."City" ilike any (f.cities) or g."Municipality" ilike any (f.cities) or g."Neighborhood" ilike any (f.cities))
     and (f.postcodes is null or upper(replace(coalesce(g."Zip", ''), ' ', '')) like any (f.postcodes))
     and (f.countries is null or g."Country" = any (f.countries))
     and (f.min_rating is null or g."Average Rating" >= f.min_rating)
     and (f.max_rating is null or g."Average Rating" <= f.max_rating)
     and (f.has_rating is null or (g."Average Rating" is not null) = f.has_rating)
     and (f.has_phone is null or (coalesce(g."Phone Standard Format", '') <> '') = f.has_phone)
     and (f.mobile_only is null or (coalesce(g."Phone Standard Format", '') like '+44 7%') = f.mobile_only)
     and (f.has_email is null or (coalesce(g."Email 1", '') <> '') = f.has_email)
     and (f.has_website is null or (coalesce(g."Website", '') <> '') = f.has_website)
     and (f.has_whatsapp is null or (coalesce(g."WhatsApp", '') <> '') = f.has_whatsapp)
     and (f.has_facebook is null or (coalesce(g."Facebook", '') <> '') = f.has_facebook)
     and (f.has_instagram is null or (coalesce(g."Instagram", '') <> '') = f.has_instagram)
     and (f.has_linkedin is null or (coalesce(g."LinkedIn", '') <> '') = f.has_linkedin)
     and (f.open_saturday is null or ((g."Hours" ilike '%Saturday:%') and g."Hours" not ilike '%Saturday: Closed%') = f.open_saturday)
     and (f.open_sunday is null or ((g."Hours" ilike '%Sunday:%') and g."Hours" not ilike '%Sunday: Closed%') = f.open_sunday)
     and (f.domains is null or g."Domain" ilike any (f.domains))
$$;
revoke all on function public.local_filter(public.local_query) from public, anon, authenticated;

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
  return query
  select g."Place ID", g."Name", g."Category", g."All Categories", g."Keyword", g."Phone Standard Format",
         coalesce(g."Phone Standard Format", '') like '+44 7%', g."WhatsApp",
         g."Email 1", g."All Emails", coalesce(g."Clean Website URL", g."Website"), g."Domain", g."Facebook", g."Instagram", g."LinkedIn",
         g."Full Address", g."Street Address", g."Neighborhood", g."City", g."Zip", g."Country",
         g."Average Rating", g."Review URL", g."Hours", g."GMB URL", g."Logo URL"
    from public.local_filter(f) g
   order by g."Place ID"
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
  offset least(greatest(coalesce(p_offset, 0), 0), 10000);
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
  select count(*) into n from (select 1 from public.local_filter(f) limit 10001) s;
  return n;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Filter options with counts (refreshed on demand: refresh_search_facets())
-- ---------------------------------------------------------------------------
create table public.search_facets (
  source  text not null check (source in ('leads', 'local')),
  facet   text not null,
  value   text not null,
  n       bigint not null,
  primary key (source, facet, value)
);
alter table public.search_facets enable row level security;
revoke all on public.search_facets from anon, authenticated;

create or replace function public.refresh_search_facets()
returns void language plpgsql security definer set search_path = public set statement_timeout = '10min' as $$
begin
  delete from public.search_facets;
  insert into public.search_facets (source, facet, value, n)
  select 'leads', f, v, n from (
    select 'seniority' f, seniority_level v, count(*) n from data_list where coalesce(seniority_level, '') <> '' group by 2
    union all select 'department', department, count(*) from data_list where coalesce(department, '') <> '' group by 2
    union all select 'size', employee_count_range, count(*) from data_list where coalesce(employee_count_range, '') <> '' group by 2
    union all select 'revenue', revenue_range, count(*) from data_list where coalesce(revenue_range, '') <> '' group by 2
    union all select 'country', contact_country, count(*) from data_list where coalesce(contact_country, '') <> '' group by 2
    union all select 'hq_country', company_hq_country, count(*) from data_list where coalesce(company_hq_country, '') <> '' group by 2
    union all select 'email_status', email_status, count(*) from data_list where coalesce(email_status, '') <> '' group by 2
    union all select 'funding', last_funding_type, count(*) from data_list where coalesce(last_funding_type, '') <> '' group by 2
    union all (select 'industry', i, count(*) from (select coalesce(nullif(main_industry, ''), nullif(company_industry, '')) i from data_list) s
                where i is not null group by 1, 2 order by 3 desc limit 400)
    union all (select 'mobile_code', '+' || substring(replace(mobile_phone, ' ', '') from '^\+(353|351|358|420|352|44|49|31|39|33|34|46|41|47|45|32|43|48|30|40|36|1)'), count(*)
                from data_list where coalesce(mobile_phone, '') like '+%' group by 2 having count(*) >= 20 order by 3 desc limit 40)
    union all (select 'tag', btrim(t), count(*) from data_list, unnest(string_to_array(smart_tags, ',')) t
                where coalesce(smart_tags, '') <> '' group by 2 order by 3 desc limit 60)
  ) x where v is not null;

  insert into public.search_facets (source, facet, value, n)
  select 'local', f, v, n from (
    (select 'keyword' f, "Keyword" v, count(*) n from google_businesses where coalesce("Keyword", '') <> '' group by 2 order by 3 desc limit 1000)
    union all (select 'category', "Category", count(*) from google_businesses where coalesce("Category", '') <> '' group by 2 order by 3 desc limit 500)
    union all (select 'city', "City", count(*) from google_businesses where coalesce("City", '') <> '' group by 2 order by 3 desc limit 500)
    union all select 'country', "Country", count(*) from google_businesses where coalesce("Country", '') <> '' group by 2
  ) x where v is not null;
end $$;
revoke all on function public.refresh_search_facets() from public, anon, authenticated;

create or replace function public.search_facets_for(p_source text)
returns table (facet text, value text, n bigint)
language sql stable security definer set search_path = public as $$
  select facet, value, n from public.search_facets
   where source = p_source and auth.uid() is not null
   order by facet, n desc, value
$$;
revoke all on function public.search_facets_for(text) from public, anon;
grant execute on function public.search_facets_for(text) to authenticated;

select public.refresh_search_facets();

-- ---------------------------------------------------------------------------
-- 6. Revealing leads (credits)
-- ---------------------------------------------------------------------------
alter table public.people add column if not exists source_lead_id uuid;
create unique index if not exists people_source_lead_uq on public.people (workspace_id, source_lead_id) where source_lead_id is not null;

-- the reveal flag now guards source_lead_id too, so nobody can fake a "revealed" lead
create or replace function public.people_before_write()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('decibel.reveal', true), 'off') <> 'on' and coalesce(auth.role(), '') <> 'service_role' then
    if (tg_op = 'INSERT' and (new.source_contact_id is not null or new.source_lead_id is not null))
       or (tg_op = 'UPDATE' and new.source_contact_id is not null and new.source_contact_id is distinct from old.source_contact_id)
       or (tg_op = 'UPDATE' and new.source_lead_id is distinct from old.source_lead_id) then
      raise exception 'database contacts are added by revealing them' using errcode = '42501';
    end if;
  end if;
  new.mobile_e164      := public.normalize_phone(new.mobile_e164);
  new.direct_dial_e164 := public.normalize_phone(new.direct_dial_e164);
  if new.mobile_e164 is not null and exists (
       select 1 from public.dnc_entries d where d.workspace_id = new.workspace_id and d.e164 = new.mobile_e164)
  then new.do_not_call := true; end if;
  return new;
end $$;

create or replace function public.reveal_lead_one(p_workspace_id uuid, p_lead_id uuid, p_list_id uuid, p_user_id uuid)
returns public.people language plpgsql security definer set search_path = public as $$
declare d public.data_list; p public.people; tc uuid; dom text; band public.company_size_band; sen public.seniority;
begin
  select * into p from public.people where workspace_id = p_workspace_id and source_lead_id = p_lead_id;
  if not found then
    select * into d from public.data_list where contact_id = p_lead_id limit 1;
    if not found then raise exception 'lead not found'; end if;

    band := case d.employee_count_range
      when '1 to 10' then '1-10' when '11 to 50' then '11-50' when '51 to 200' then '51-200' when '201 to 500' then '201-500'
      when '501 to 1000' then '501-1000' when '1001 to 5000' then '1001-5000' when '5001 to 10000' then '5001+' when '10001+' then '5001+'
      else null end::public.company_size_band;
    sen := case d.seniority_level when 'c-level' then 'c_level' when 'vp' then 'vp' when 'director' then 'director'
      when 'manager' then 'manager' when 'senior' then 'ic' when 'junior' then 'ic' else null end::public.seniority;

    dom := nullif(lower(coalesce(d.company_domain, d.current_employer_website, '')), '');
    if coalesce(d.company_name, d.current_employer) is not null then
      if dom is not null then
        insert into public.tenant_companies (workspace_id, name, domain, industry, size_band, country_code, city, linkedin_url)
        values (p_workspace_id, coalesce(d.company_name, d.current_employer), dom, coalesce(d.main_industry, d.company_industry), band,
                public.lead_country_iso(d.company_hq_country), d.company_hq_city, d.current_employer_linkedin_url)
        on conflict (workspace_id, domain) do update set name = public.tenant_companies.name
        returning id into tc;
      else
        select id into tc from public.tenant_companies
         where workspace_id = p_workspace_id and lower(name) = lower(coalesce(d.company_name, d.current_employer)) limit 1;
        if tc is null then
          insert into public.tenant_companies (workspace_id, name, industry, size_band, country_code, city, linkedin_url)
          values (p_workspace_id, coalesce(d.company_name, d.current_employer), coalesce(d.main_industry, d.company_industry), band,
                  public.lead_country_iso(d.company_hq_country), d.company_hq_city, d.current_employer_linkedin_url)
          returning id into tc;
        end if;
      end if;
    end if;

    perform set_config('decibel.reveal', 'on', true);
    insert into public.people (workspace_id, source_lead_id, tenant_company_id, first_name, last_name, job_title, seniority,
                               email, mobile_e164, linkedin_url, country_code, city, tps_status, source, created_by, stage_id)
    values (p_workspace_id, d.contact_id, tc, coalesce(nullif(d.first_name, ''), split_part(coalesce(d.full_name, 'Unknown'), ' ', 1)),
            coalesce(d.last_name, ''), d.current_title, sen, nullif(d.work_email, ''), public.lead_e164(d.mobile_phone), d.linkedin_url,
            public.lead_country_iso(d.contact_country), d.contact_city, 'unchecked', 'database', p_user_id,
            (select id from public.pipeline_stages where workspace_id = p_workspace_id and position = 1))
    returning * into p;
    perform set_config('decibel.reveal', 'off', true);

    insert into public.credit_transactions (workspace_id, user_id, delta, reason, reference_id)
    values (p_workspace_id, p_user_id, -1, 'reveal', d.contact_id);

    insert into public.activities (workspace_id, person_id, actor_id, kind, payload)
    values (p_workspace_id, p.id, p_user_id, 'revealed', jsonb_build_object('lead_id', d.contact_id));
  end if;

  if p_list_id is not null then
    insert into public.list_members (list_id, person_id, workspace_id, added_by)
    values (p_list_id, p.id, p_workspace_id, p_user_id) on conflict do nothing;
  end if;
  return p;
end $$;
revoke all on function public.reveal_lead_one(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- Reveal up to 500 leads (optionally into a list): 1 credit each, free if already revealed.
create or replace function public.reveal_leads(p_workspace_id uuid, p_lead_ids uuid[], p_list_id uuid default null)
returns setof public.people language plpgsql security definer set search_path = public set statement_timeout = '60s' as $$
declare ids uuid[]; cost integer; known integer; lid uuid; p public.people;
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  if coalesce(cardinality(p_lead_ids), 0) = 0 then return; end if;
  if cardinality(p_lead_ids) > 500 then raise exception 'too_many: reveal at most 500 leads at a time'; end if;

  perform 1 from public.workspaces where id = p_workspace_id for update;
  if p_list_id is not null and not exists (select 1 from public.lists where id = p_list_id and workspace_id = p_workspace_id) then
    raise exception 'list not found';
  end if;

  select array_agg(x order by o) into ids
    from (select distinct on (x) x, o from unnest(p_lead_ids) with ordinality as t(x, o) order by x, o) s;

  select count(distinct contact_id) into known from public.data_list where contact_id = any(ids);
  if known <> cardinality(ids) then raise exception 'lead not found'; end if;

  select count(*) into cost from unnest(ids) as x
   where not exists (select 1 from public.people where workspace_id = p_workspace_id and source_lead_id = x);
  if cost > 0 then perform public.check_reveal_allowance(p_workspace_id, auth.uid(), cost); end if;

  foreach lid in array ids loop
    p := public.reveal_lead_one(p_workspace_id, lid, p_list_id, auth.uid());
    return next p;
  end loop;
end $$;

revoke all on function public.search_leads(uuid, jsonb, integer, integer) from public, anon;
revoke all on function public.count_leads(uuid, jsonb) from public, anon;
revoke all on function public.search_local(uuid, jsonb, integer, integer) from public, anon;
revoke all on function public.count_local(uuid, jsonb) from public, anon;
revoke all on function public.reveal_leads(uuid, uuid[], uuid) from public, anon;
grant execute on function public.search_leads(uuid, jsonb, integer, integer) to authenticated;
grant execute on function public.count_leads(uuid, jsonb) to authenticated;
grant execute on function public.search_local(uuid, jsonb, integer, integer) to authenticated;
grant execute on function public.count_local(uuid, jsonb) to authenticated;
grant execute on function public.reveal_leads(uuid, uuid[], uuid) to authenticated;

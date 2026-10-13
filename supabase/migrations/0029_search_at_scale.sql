-- 0029: search at 2.5M leads on a small database.
--
-- data_list grew to ~2.5M contacts but lead_search was last rebuilt with 698k, and counts over the
-- whole search table can't finish inside the 8s request limit on this compute size (UK + no mobile
-- took 21s), so the toolbar fell back to "100+" or "10,000+". This migration:
--
-- 1. Adds new leads to the search tables in the background, in small batches read from data_list in
--    physical order (a pg_cron job every 20 seconds). Search stays up throughout, there is never a
--    second copy of the table, and refresh_search_tables() now just starts another pass. A pass only
--    adds contacts that aren't in the search tables yet.
-- 2. Keeps pre-counted tables (one row per combination of the low-cardinality filter columns with a
--    count). A filter that only touches those columns is counted exactly from them in milliseconds,
--    whatever the size of the data. The existing lead_where()/local_where() SQL runs on them as is.
-- 3. Counts anything else (job titles, companies, towns, industries…) exactly in the background:
--    the request returns the planner's estimate at once and queues the filter; a pg_cron job counts
--    it with no time limit and saves it, so the page (which polls) switches to the exact number and
--    every later request for the same filter is instant.
--
-- count_leads()/count_local() now return {"n": <number>, "exact": <bool>} with no cap.

-- ---------------------------------------------------------------------------
-- 1. Pre-counted tables
-- ---------------------------------------------------------------------------
create table if not exists public.lead_count_cube (
  country            text,
  has_mobile         boolean,
  has_email          boolean,
  has_personal_email boolean,
  has_linkedin       boolean,
  open_to_work       boolean,
  is_hiring          boolean,
  seniority          text,
  size               text,
  revenue            text,
  email_status       text,
  department         text,
  hq_country         text,
  n                  integer not null,
  constraint lead_count_cube_key unique nulls not distinct
    (country, has_mobile, has_email, has_personal_email, has_linkedin, open_to_work, is_hiring, seniority, size, revenue, email_status, department, hq_country)
);

create table if not exists public.local_count_cube (
  country       text,
  has_phone     boolean,
  has_mobile    boolean,
  has_email     boolean,
  has_website   boolean,
  has_whatsapp  boolean,
  has_facebook  boolean,
  has_instagram boolean,
  has_linkedin  boolean,
  open_saturday boolean,
  open_sunday   boolean,
  rating        numeric,
  n             integer not null,
  constraint local_count_cube_key unique nulls not distinct
    (country, has_phone, has_mobile, has_email, has_website, has_whatsapp, has_facebook, has_instagram, has_linkedin, open_saturday, open_sunday, rating)
);

-- a cube is only used once it has been built from the whole search table
create table if not exists public.search_cubes (
  source text primary key check (source in ('leads', 'local')),
  ready  boolean not null default false,
  built_at timestamptz
);
insert into public.search_cubes (source) values ('leads'), ('local') on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 2. Exact counts worked out in the background, and kept
-- ---------------------------------------------------------------------------
create table if not exists public.search_count_cache (
  source      text not null check (source in ('leads', 'local')),
  filters     jsonb not null,
  n           bigint not null,
  computed_at timestamptz not null default now(),
  primary key (source, filters)
);

create table if not exists public.search_count_queue (
  source       text not null check (source in ('leads', 'local')),
  filters      jsonb not null,
  requested_at timestamptz not null default now(),
  primary key (source, filters)
);

-- ---------------------------------------------------------------------------
-- 3. Background sync state: one row per step, run in order
-- ---------------------------------------------------------------------------
create table if not exists public.search_sync (
  step        text primary key check (step in ('leads', 'local', 'lead_cube', 'local_cube', 'facets')),
  ord         integer not null,
  position    bigint not null default 0,     -- next block to read
  total       bigint not null default 0,     -- blocks in the source when the step began
  added       bigint not null default 0,     -- rows added (or counted, for cubes) this pass
  started_at  timestamptz,
  finished_at timestamptz,
  updated_at  timestamptz
);
insert into public.search_sync (step, ord) values ('leads', 1), ('local', 2), ('lead_cube', 3), ('local_cube', 4), ('facets', 5)
on conflict do nothing;

alter table public.lead_count_cube    enable row level security;
alter table public.local_count_cube   enable row level security;
alter table public.search_cubes       enable row level security;
alter table public.search_count_cache enable row level security;
alter table public.search_count_queue enable row level security;
alter table public.search_sync        enable row level security;
revoke all on public.lead_count_cube, public.local_count_cube, public.search_cubes,
              public.search_count_cache, public.search_count_queue, public.search_sync from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Counting
-- ---------------------------------------------------------------------------
-- true when every column the WHERE clause reads (alias.column) is one of the cube's columns
create or replace function public.search_where_fits(p_where text, p_alias text, p_columns text[])
returns boolean language sql immutable set search_path = public as $$
  select not exists (
    select 1 from regexp_matches(p_where, '\m' || p_alias || '\.([a-z_]+)', 'g') m where m[1] <> all (p_columns)
  )
$$;

drop function if exists public.count_leads(uuid, jsonb);
create function public.count_leads(p_workspace_id uuid, p_filters jsonb default '{}')
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  k jsonb := coalesce(p_filters, '{}');
  f public.lead_query := public.lead_query_from(k);
  w text := public.lead_where(f);
  n bigint;
  plan json;
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;

  if (select ready from public.search_cubes where source = 'leads')
     and public.search_where_fits(w, 's', array['country', 'has_mobile', 'has_email', 'has_personal_email', 'has_linkedin', 'open_to_work',
                                               'is_hiring', 'seniority', 'size', 'revenue', 'email_status', 'department', 'hq_country']) then
    execute 'select coalesce(sum(s.n), 0) from public.lead_count_cube s where ' || w into n using f;
    return jsonb_build_object('n', n, 'exact', true);
  end if;

  select c.n into n from public.search_count_cache c where c.source = 'leads' and c.filters = k;
  if found then return jsonb_build_object('n', n, 'exact', true); end if;

  -- queue it (a bounded queue, so nobody can pile up work) and answer with the planner's estimate
  if (select count(*) from public.search_count_queue) < 200 then
    insert into public.search_count_queue (source, filters) values ('leads', k) on conflict do nothing;
  end if;
  begin
    execute 'explain (format json) select 1 from public.lead_search s where ' || w into plan using f;
    return jsonb_build_object('n', round((plan -> 0 -> 'Plan' ->> 'Plan Rows')::numeric), 'exact', false);
  exception when others then
    return jsonb_build_object('n', null, 'exact', false);
  end;
end $$;

drop function if exists public.count_local(uuid, jsonb);
create function public.count_local(p_workspace_id uuid, p_filters jsonb default '{}')
returns jsonb
language plpgsql volatile security definer
set search_path = public
as $$
declare
  k jsonb := coalesce(p_filters, '{}');
  f public.local_query := public.local_query_from(k);
  w text := public.local_where(f);
  n bigint;
  plan json;
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;

  if (select ready from public.search_cubes where source = 'local')
     and public.search_where_fits(w, 'l', array['country', 'has_phone', 'has_mobile', 'has_email', 'has_website', 'has_whatsapp',
                                               'has_facebook', 'has_instagram', 'has_linkedin', 'open_saturday', 'open_sunday', 'rating']) then
    execute 'select coalesce(sum(l.n), 0) from public.local_count_cube l where ' || w into n using f;
    return jsonb_build_object('n', n, 'exact', true);
  end if;

  select c.n into n from public.search_count_cache c where c.source = 'local' and c.filters = k;
  if found then return jsonb_build_object('n', n, 'exact', true); end if;

  if (select count(*) from public.search_count_queue) < 200 then
    insert into public.search_count_queue (source, filters) values ('local', k) on conflict do nothing;
  end if;
  begin
    execute 'explain (format json) select 1 from public.local_search l where ' || w into plan using f;
    return jsonb_build_object('n', round((plan -> 0 -> 'Plan' ->> 'Plan Rows')::numeric), 'exact', false);
  exception when others then
    return jsonb_build_object('n', null, 'exact', false);
  end;
end $$;

revoke execute on function public.count_leads(uuid, jsonb) from public, anon;
revoke execute on function public.count_local(uuid, jsonb) from public, anon;
grant  execute on function public.count_leads(uuid, jsonb) to authenticated;
grant  execute on function public.count_local(uuid, jsonb) to authenticated;

-- the queue worker: one filter per run, counted with no time limit
create or replace function public.fill_search_count()
returns integer
language plpgsql security definer
set search_path = public
set statement_timeout = 0
as $$
declare q record; n bigint;
begin
  select * into q from public.search_count_queue order by requested_at limit 1 for update skip locked;
  if not found then return 0; end if;
  begin
    if q.source = 'leads' then
      execute 'select count(*) from public.lead_search s where ' || public.lead_where(public.lead_query_from(q.filters))
        into n using public.lead_query_from(q.filters);
    else
      execute 'select count(*) from public.local_search l where ' || public.local_where(public.local_query_from(q.filters))
        into n using public.local_query_from(q.filters);
    end if;
    insert into public.search_count_cache (source, filters, n) values (q.source, q.filters, n)
    on conflict (source, filters) do update set n = excluded.n, computed_at = now();
  exception when others then
    raise warning 'search count failed for %: %', q.filters, sqlerrm;
  end;
  delete from public.search_count_queue where source = q.source and filters = q.filters;
  return 1;
end $$;

-- ---------------------------------------------------------------------------
-- 5. The background sync
-- ---------------------------------------------------------------------------
-- starts a pass; cubes are rebuilt only while they aren't ready (afterwards new rows are added to them as they're inserted)
create or replace function public.start_search_sync()
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.search_sync
     set position = 0, total = 0, added = 0, started_at = now(), updated_at = now(),
         finished_at = case
           when step = 'lead_cube' and (select ready from public.search_cubes where source = 'leads') then now()
           when step = 'local_cube' and (select ready from public.search_cubes where source = 'local') then now()
           else null end;
end $$;

-- after imports: adds new contacts and businesses to search in the background (returns at once)
create or replace function public.refresh_search_tables()
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.start_search_sync();
end $$;

create or replace function public.sync_search_batch()
returns text
language plpgsql security definer
set search_path = public
set statement_timeout = 0
as $$
declare
  s public.search_sync;
  batch bigint;
  lo bigint;
  hi bigint;
  n bigint := 0;
  lead_ready boolean := (select ready from public.search_cubes where source = 'leads');
  local_ready boolean := (select ready from public.search_cubes where source = 'local');
  range_sql text;
begin
  select * into s from public.search_sync
   where started_at is not null and finished_at is null
   order by ord limit 1 for update skip locked;
  if not found then return 'idle'; end if;

  -- a step measures its source when it begins (the lead cube starts after the new leads are in)
  if s.position = 0 and s.total = 0 then
    s.total := case s.step
      when 'leads' then pg_relation_size('public.data_list') / 8192 + 1
      when 'local' then pg_relation_size('public.google_businesses') / 8192 + 1
      when 'lead_cube' then pg_relation_size('public.lead_search') / 8192 + 1
      when 'local_cube' then pg_relation_size('public.local_search') / 8192 + 1
      else 1 end;
    if s.step = 'lead_cube' then truncate public.lead_count_cube; end if;
    if s.step = 'local_cube' then truncate public.local_count_cube; end if;
  end if;

  batch := case s.step when 'leads' then 6000 when 'local' then 15000 else 25000 end;
  lo := s.position;
  hi := lo + batch;
  range_sql := format('ctid >= %L::tid and ctid < %L::tid', format('(%s,0)', lo), format('(%s,0)', hi));

  if s.step = 'leads' then
    execute format($q$
      with src as (select * from public.data_list where %s and contact_id is not null),
      ins as (
        insert into public.lead_search (contact_id, full_name, current_title, company, company_domain, website, seniority, department,
                                        company_industry, main_industry, size, employees, revenue, founded, hq_country, country, city, state, location,
                                        has_mobile, mobile_prefix, has_email, email_status, has_personal_email, has_linkedin, open_to_work, is_hiring,
                                        role_start, funding, smart_tags)
        select d.contact_id, d.full_name, d.current_title, coalesce(nullif(d.company_name, ''), d.current_employer), d.company_domain,
               d.current_employer_website, nullif(d.seniority_level, ''), nullif(d.department, ''), nullif(d.company_industry, ''),
               nullif(d.main_industry, ''), nullif(d.employee_count_range, ''), d.linkedin_employee_count_exact, nullif(d.revenue_range, ''),
               extract(year from d.company_founded_year)::integer, nullif(d.company_hq_country, ''), nullif(d.contact_country, ''),
               d.contact_city, d.contact_state, d.contact_location,
               coalesce(d.mobile_phone, '') <> '', left(nullif(regexp_replace(coalesce(d.mobile_phone, ''), '[^0-9+]', '', 'g'), ''), 6),
               coalesce(d.work_email, '') <> '', nullif(d.email_status, ''), coalesce(d.personal_emails, '') <> '',
               coalesce(d.linkedin_url, '') <> '', coalesce(d.open_to_work, false), coalesce(d.is_hiring, false),
               d.role_start_date, nullif(d.last_funding_type, ''), d.smart_tags
          from src d
        on conflict (contact_id) do nothing
        returning country, has_mobile, has_email, has_personal_email, has_linkedin, open_to_work, is_hiring, seniority, size, revenue,
                  email_status, department, hq_country
      ),
      txt as (
        insert into public.lead_text
        select contact_id, nullif(skills, ''), nullif(languages, ''), nullif(company_tech_stack, '')
          from src
         where coalesce(skills, '') <> '' or coalesce(languages, '') <> '' or coalesce(company_tech_stack, '') <> ''
        on conflict (contact_id) do nothing
      ),
      cube as (
        insert into public.lead_count_cube
        select country, has_mobile, has_email, has_personal_email, has_linkedin, open_to_work, is_hiring, seniority, size, revenue,
               email_status, department, hq_country, count(*)
          from ins where %L::boolean
         group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
        on conflict on constraint lead_count_cube_key do update set n = lead_count_cube.n + excluded.n
      )
      select count(*) from ins
    $q$, range_sql, coalesce(lead_ready, false)) into n;
    delete from public.search_count_cache where source = 'leads';

  elsif s.step = 'local' then
    execute format($q$
      with ins as (
        insert into public.local_search (place_id, name, category, all_categories, keyword, city, municipality, neighbourhood, postcode, country,
                                         rating, domain, has_phone, has_mobile, has_email, has_website, has_whatsapp, has_facebook, has_instagram,
                                         has_linkedin, open_saturday, open_sunday, area)
        select g."Place ID", g."Name", g."Category", coalesce(nullif(g."All Categories", ''), g."Category"), g."Keyword", g."City", g."Municipality",
               g."Neighborhood", nullif(upper(replace(coalesce(g."Zip", ''), ' ', '')), ''), g."Country", g."Average Rating", g."Domain",
               coalesce(g."Phone Standard Format", '') <> '', coalesce(g."Phone Standard Format", '') like '+44 7%%',
               coalesce(g."Email 1", '') <> '', coalesce(g."Website", '') <> '', coalesce(g."WhatsApp", '') <> '',
               coalesce(g."Facebook", '') <> '', coalesce(g."Instagram", '') <> '', coalesce(g."LinkedIn", '') <> '',
               coalesce(g."Hours", '') ilike '%%Saturday:%%' and coalesce(g."Hours", '') not ilike '%%Saturday: Closed%%',
               coalesce(g."Hours", '') ilike '%%Sunday:%%' and coalesce(g."Hours", '') not ilike '%%Sunday: Closed%%',
               nullif(concat_ws(' · ', g."City", g."Municipality", g."Neighborhood"), '')
          from public.google_businesses g
         where %s and g."Place ID" is not null
        on conflict (place_id) do nothing
        returning country, has_phone, has_mobile, has_email, has_website, has_whatsapp, has_facebook, has_instagram, has_linkedin,
                  open_saturday, open_sunday, rating
      ),
      cube as (
        insert into public.local_count_cube
        select country, has_phone, has_mobile, has_email, has_website, has_whatsapp, has_facebook, has_instagram, has_linkedin,
               open_saturday, open_sunday, rating, count(*)
          from ins where %L::boolean
         group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
        on conflict on constraint local_count_cube_key do update set n = local_count_cube.n + excluded.n
      )
      select count(*) from ins
    $q$, replace(range_sql, 'ctid', 'g.ctid'), coalesce(local_ready, false)) into n;
    delete from public.search_count_cache where source = 'local';

  elsif s.step = 'lead_cube' then
    execute format($q$
      with b as (
        select country, has_mobile, has_email, has_personal_email, has_linkedin, open_to_work, is_hiring, seniority, size, revenue,
               email_status, department, hq_country, count(*) as n
          from public.lead_search where %s
         group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13
      ), up as (
        insert into public.lead_count_cube select * from b
        on conflict on constraint lead_count_cube_key do update set n = lead_count_cube.n + excluded.n
      )
      select coalesce(sum(n), 0) from b
    $q$, range_sql) into n;

  elsif s.step = 'local_cube' then
    execute format($q$
      with b as (
        select country, has_phone, has_mobile, has_email, has_website, has_whatsapp, has_facebook, has_instagram, has_linkedin,
               open_saturday, open_sunday, rating, count(*) as n
          from public.local_search where %s
         group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12
      ), up as (
        insert into public.local_count_cube select * from b
        on conflict on constraint local_count_cube_key do update set n = local_count_cube.n + excluded.n
      )
      select coalesce(sum(n), 0) from b
    $q$, range_sql) into n;

  else -- facets
    perform public.refresh_search_facets();
    hi := s.total;
  end if;

  update public.search_sync
     set position = hi, total = s.total, added = added + n, updated_at = now(),
         finished_at = case when hi >= s.total then now() end
   where step = s.step;

  if hi >= s.total then
    if s.step = 'leads' then analyze public.lead_search; analyze public.lead_text; end if;
    if s.step = 'local' then analyze public.local_search; end if;
    if s.step = 'lead_cube' then update public.search_cubes set ready = true, built_at = now() where source = 'leads'; end if;
    if s.step = 'local_cube' then update public.search_cubes set ready = true, built_at = now() where source = 'local'; end if;
  end if;
  return format('%s %s/%s +%s', s.step, least(hi, s.total), s.total, n);
end $$;

revoke execute on function public.fill_search_count() from public, anon, authenticated;
revoke execute on function public.start_search_sync() from public, anon, authenticated;
revoke execute on function public.sync_search_batch() from public, anon, authenticated;
revoke execute on function public.refresh_search_tables() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Jobs: the sync every 20 seconds, the count queue every 2 (both no-ops when idle)
-- ---------------------------------------------------------------------------
select cron.unschedule(jobname) from cron.job where jobname in ('decibel-search-sync', 'decibel-search-counts');
select cron.schedule('decibel-search-sync', '20 seconds', $$select public.sync_search_batch()$$);
select cron.schedule('decibel-search-counts', '2 seconds', $$select public.fill_search_count()$$);

-- first pass: the ~1.8M contacts imported since 7 October, then both cubes
select public.start_search_sync();

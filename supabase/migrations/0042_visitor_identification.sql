-- 0042: website visitor identification.
-- A workspace adds its website and pastes one script tag (public/v.js). Each page view is sent to the
-- visitor-track Edge Function, which reads the visitor's IP from the request, resolves it to a company
-- through enrich.so (cached for 30 days across all workspaces, so an IP is paid for once), and records the
-- company against the workspace. Only business networks resolve; home and mobile connections never do.
-- The person browsing is never identified. Raw page views (with IPs) are deleted after 30 days.
-- Members read everything through RLS; only the service role (the Edge Function) writes visits.

-- ---------------------------------------------------------------------------
-- 1. Sites: one per website a workspace tracks
-- ---------------------------------------------------------------------------
create table if not exists public.visitor_sites (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  domain        text not null check (domain ~ '^[a-z0-9.-]+\.[a-z]{2,}$'),
  -- public: it sits in the customer's page source and only lets a browser send page views
  site_key      text not null unique default encode(extensions.gen_random_bytes(12), 'hex'),
  created_by    uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now(),
  last_hit_at   timestamptz,
  unique (workspace_id, domain)
);
alter table public.visitor_sites enable row level security;
drop policy if exists visitor_sites_read on public.visitor_sites;
create policy visitor_sites_read on public.visitor_sites for select using (workspace_id in (select public.my_workspace_ids()));
drop policy if exists visitor_sites_delete on public.visitor_sites;
create policy visitor_sites_delete on public.visitor_sites for delete using (public.has_role(workspace_id, 'admin'));

-- ---------------------------------------------------------------------------
-- 2. IP → company cache, shared by every workspace (company-level data only; service role only)
-- ---------------------------------------------------------------------------
create table if not exists public.visitor_ip_cache (
  ip            text primary key,
  domain        text,            -- null: not a business network (no charge, nothing to show)
  organization  text,
  country       text,
  country_code  text,
  region        text,
  city          text,
  isp           text,
  credits_used  integer not null default 0,
  resolved_at   timestamptz not null default now()
);
alter table public.visitor_ip_cache enable row level security;
revoke all on public.visitor_ip_cache from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Page views (kept 30 days) and the companies they resolve to
-- ---------------------------------------------------------------------------
create table if not exists public.visitor_hits (
  id            bigserial primary key,
  site_id       uuid not null references public.visitor_sites(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  ip            text not null,
  path          text,
  referrer      text,
  company_domain text,
  created_at    timestamptz not null default now()
);
create index if not exists visitor_hits_site_idx on public.visitor_hits (site_id, created_at desc);
create index if not exists visitor_hits_created_idx on public.visitor_hits (created_at);
alter table public.visitor_hits enable row level security;
drop policy if exists visitor_hits_read on public.visitor_hits;
create policy visitor_hits_read on public.visitor_hits for select using (workspace_id in (select public.my_workspace_ids()));

create table if not exists public.visitor_companies (
  id            uuid primary key default gen_random_uuid(),
  site_id       uuid not null references public.visitor_sites(id) on delete cascade,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  domain        text not null,
  organization  text,
  country       text,
  region        text,
  city          text,
  isp           text,
  last_ip       text,
  page_views    integer not null default 0,
  visits        integer not null default 0,     -- a new visit after 30 minutes without a page view
  pages         jsonb not null default '[]',    -- the latest 12 distinct paths, newest first
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now(),
  unique (site_id, domain)
);
create index if not exists visitor_companies_ws_idx on public.visitor_companies (workspace_id, last_seen desc);
alter table public.visitor_companies enable row level security;
drop policy if exists visitor_companies_read on public.visitor_companies;
create policy visitor_companies_read on public.visitor_companies for select using (workspace_id in (select public.my_workspace_ids()));
drop policy if exists visitor_companies_delete on public.visitor_companies;
create policy visitor_companies_delete on public.visitor_companies for delete using (public.has_role(workspace_id, 'admin'));

-- ---------------------------------------------------------------------------
-- 4. Adding a site (admins), and recording a resolved visit (service role)
-- ---------------------------------------------------------------------------
create or replace function public.add_visitor_site(p_workspace_id uuid, p_domain text)
returns public.visitor_sites language plpgsql security definer set search_path = public as $$
declare d text; s public.visitor_sites;
begin
  if not public.has_role(p_workspace_id, 'admin') then raise exception 'forbidden: only owners and admins can add a website'; end if;
  d := regexp_replace(lower(btrim(coalesce(p_domain, ''))), '^(https?://)?(www\.)?([^/:?#]+).*$', '\3');
  if d !~ '^[a-z0-9.-]+\.[a-z]{2,}$' then raise exception 'invalid_domain: enter a website like acme.co.uk'; end if;
  if (select count(*) from public.visitor_sites where workspace_id = p_workspace_id) >= 10 then
    raise exception 'too_many: a workspace can track up to 10 websites';
  end if;
  insert into public.visitor_sites (workspace_id, domain, created_by) values (p_workspace_id, d, auth.uid())
  on conflict (workspace_id, domain) do update set domain = excluded.domain
  returning * into s;
  return s;
end $$;
revoke execute on function public.add_visitor_site(uuid, text) from public, anon;
grant  execute on function public.add_visitor_site(uuid, text) to authenticated;

create or replace function public.record_visitor_company(p_site_id uuid, p_domain text, p_organization text, p_country text,
                                                         p_region text, p_city text, p_isp text, p_ip text, p_path text)
returns void language plpgsql security definer set search_path = public as $$
declare ws uuid; new_visit boolean;
begin
  select workspace_id into ws from public.visitor_sites where id = p_site_id;
  if ws is null then return; end if;
  insert into public.visitor_companies as c (site_id, workspace_id, domain, organization, country, region, city, isp, last_ip, page_views, visits, pages)
  values (p_site_id, ws, p_domain, p_organization, p_country, p_region, p_city, p_isp, p_ip, 1, 1,
          case when p_path is null then '[]'::jsonb else jsonb_build_array(p_path) end)
  on conflict (site_id, domain) do update set
    organization = coalesce(excluded.organization, c.organization),
    country = coalesce(excluded.country, c.country),
    region = coalesce(excluded.region, c.region),
    city = coalesce(excluded.city, c.city),
    isp = coalesce(excluded.isp, c.isp),
    last_ip = excluded.last_ip,
    page_views = c.page_views + 1,
    visits = c.visits + case when c.last_seen < now() - interval '30 minutes' then 1 else 0 end,
    pages = case when p_path is null then c.pages else
              (select coalesce(jsonb_agg(x order by o), '[]'::jsonb) from (
                 select x, o from (
                   select p_path as x, 0::bigint as o
                   union all
                   select e.value #>> '{}', e.ord from jsonb_array_elements(c.pages) with ordinality as e(value, ord)
                    where e.value #>> '{}' <> p_path
                 ) s order by o limit 12) t)
            end,
    last_seen = now();
end $$;
revoke execute on function public.record_visitor_company(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.record_visitor_company(uuid, text, text, text, text, text, text, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Housekeeping: raw page views and their IPs go after 30 days; the IP cache refreshes after 30 days
-- ---------------------------------------------------------------------------
create or replace function public.visitor_purge_old()
returns void language sql security definer set search_path = public as $$
  delete from public.visitor_hits where created_at < now() - interval '30 days';
  delete from public.visitor_ip_cache where resolved_at < now() - interval '30 days';
$$;
revoke execute on function public.visitor_purge_old() from public, anon, authenticated;
select cron.schedule('decibel-visitor-purge', '50 3 * * *', $$select public.visitor_purge_old()$$);

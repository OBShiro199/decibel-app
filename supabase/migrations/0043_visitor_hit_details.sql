-- 0043: every page view keeps where it came from, including visits that did not resolve to a company
-- (home and mobile networks): country, region, city, the network (ISP) and the kind of device. The lookup
-- already returns these at no charge when no company is found. Raw page views are still deleted after
-- 30 days (visitor_purge_old, 0042), and nothing here names the person browsing.

alter table public.visitor_hits add column if not exists country      text;
alter table public.visitor_hits add column if not exists country_code text;
alter table public.visitor_hits add column if not exists region       text;
alter table public.visitor_hits add column if not exists city         text;
alter table public.visitor_hits add column if not exists isp          text;
alter table public.visitor_hits add column if not exists device       text check (device in ('desktop', 'mobile', 'tablet'));
create index if not exists visitor_hits_ws_idx on public.visitor_hits (workspace_id, created_at desc);

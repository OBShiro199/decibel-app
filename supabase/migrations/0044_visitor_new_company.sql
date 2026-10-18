-- 0044: record_visitor_company says whether the company is new to the website (true on its first visit), so
-- visitor-track can email the workspace "new company resolved" once per company, not on every page view.
drop function if exists public.record_visitor_company(uuid, text, text, text, text, text, text, text, text);
create function public.record_visitor_company(p_site_id uuid, p_domain text, p_organization text, p_country text,
                                              p_region text, p_city text, p_isp text, p_ip text, p_path text)
returns boolean language plpgsql security definer set search_path = public as $$
declare ws uuid; inserted boolean;
begin
  select workspace_id into ws from public.visitor_sites where id = p_site_id;
  if ws is null then return false; end if;
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
    last_seen = now()
  returning (xmax = 0) into inserted;
  return coalesce(inserted, false);
end $$;
revoke execute on function public.record_visitor_company(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant  execute on function public.record_visitor_company(uuid, text, text, text, text, text, text, text, text) to service_role;

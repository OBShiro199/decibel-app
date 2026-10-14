-- 0033: platform admins (Decibel's own staff, not a workspace role) can export every lead matching a
-- Leads search, with full contact details, free and without revealing into People. Only
-- oliverburt3+test1@gmail.com for now. The browser fetches matching ids from Typesense (lead-search) and
-- calls admin_export_leads with up to 1,000 ids at a time; each call is checked and audited here.

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  added_at   timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
revoke all on public.platform_admins from anon, authenticated;

insert into public.platform_admins (user_id)
select id from auth.users where lower(email) = 'oliverburt3+test1@gmail.com'
on conflict do nothing;

create or replace function public.is_platform_admin()
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
revoke execute on function public.is_platform_admin() from public, anon;
grant  execute on function public.is_platform_admin() to authenticated;

-- full rows for up to 1,000 lead ids, in the order given; platform admins only, every call audited
create or replace function public.admin_export_leads(p_workspace_id uuid, p_ids uuid[])
returns table (lead_id uuid, full_name text, first_name text, last_name text, current_title text, seniority_level text, department text,
               company_name text, company_domain text, company_industry text, employee_count_range text, revenue_range text,
               company_hq_country text, contact_country text, contact_city text, contact_location text, linkedin_url text,
               mobile_phone text, work_email text, email_status text, personal_emails text)
language plpgsql stable security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then raise exception 'forbidden'; end if;
  if cardinality(p_ids) > 1000 then raise exception 'too_many_ids'; end if;
  insert into public.audit_log (workspace_id, actor_id, action, target_table, payload)
  values (p_workspace_id, auth.uid(), 'export.leads_admin', 'data_list', jsonb_build_object('rows', cardinality(p_ids)));
  return query
  select d.contact_id, d.full_name, d.first_name, d.last_name, d.current_title, d.seniority_level, d.department,
         coalesce(nullif(d.company_name, ''), d.current_employer), d.company_domain, coalesce(nullif(d.main_industry, ''), d.company_industry),
         d.employee_count_range, d.revenue_range, d.company_hq_country, d.contact_country, d.contact_city, d.contact_location,
         d.linkedin_url, d.mobile_phone, d.work_email, d.email_status, d.personal_emails
    from unnest(p_ids) with ordinality as i(id, ord)
    cross join lateral (select * from public.data_list x where x.contact_id = i.id limit 1) d
   order by i.ord;
end $$;
revoke execute on function public.admin_export_leads(uuid, uuid[]) from public, anon;
grant  execute on function public.admin_export_leads(uuid, uuid[]) to authenticated;

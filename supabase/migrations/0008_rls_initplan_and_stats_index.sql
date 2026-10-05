-- 0008: faster row-level security and stats.
--
-- 1. Tenant policies called public.is_member(workspace_id) once per row. A security-definer
--    function can't be inlined, so a list of 5,000 people ran 5,000 membership lookups.
--    my_workspace_ids() returns the caller's workspaces; written as
--    `workspace_id in (select public.my_workspace_ids())` Postgres evaluates it once per
--    statement and hashes the result. Same rows visible as before: membership of auth.uid().
--    Admin-only write policies (has_role) are low volume and stay as they are.
-- 2. call_stats_daily groups calls by London day; an expression index lets Today and the
--    dashboard read one workspace's date range instead of every call it has made.

create or replace function public.my_workspace_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.workspace_members where user_id = auth.uid()
$$;
revoke all on function public.my_workspace_ids() from public, anon;
grant execute on function public.my_workspace_ids() to authenticated;

-- generic tenant tables: members read and write
do $$
declare t text;
begin
  foreach t in array array['people','lists','list_members','notes','tasks','tenant_companies','calls','saved_searches']
  loop
    execute format('alter policy %I_select on public.%I using (workspace_id in (select public.my_workspace_ids()))', t, t);
    execute format('alter policy %I_insert on public.%I with check (workspace_id in (select public.my_workspace_ids()))', t, t);
    execute format('alter policy %I_update on public.%I using (workspace_id in (select public.my_workspace_ids())) with check (workspace_id in (select public.my_workspace_ids()))', t, t);
    execute format('alter policy %I_delete on public.%I using (workspace_id in (select public.my_workspace_ids()))', t, t);
  end loop;
end $$;

-- admin-managed tenant tables: members read (writes stay admin-only via has_role)
do $$
declare t text;
begin
  foreach t in array array['business_profiles','icp_profiles','pipeline_stages','phone_numbers','dnc_entries','imports']
  loop
    execute format('alter policy %I_select on public.%I using (workspace_id in (select public.my_workspace_ids()))', t, t);
  end loop;
end $$;

-- read-only member tables
alter policy subscriptions_select on public.subscriptions        using (workspace_id in (select public.my_workspace_ids()));
alter policy credit_tx_select     on public.credit_transactions  using (workspace_id in (select public.my_workspace_ids()));
alter policy recordings_select    on public.recordings           using (workspace_id in (select public.my_workspace_ids()));
alter policy activities_select    on public.activities           using (workspace_id in (select public.my_workspace_ids()));
alter policy usage_reports_select on public.usage_reports        using (workspace_id in (select public.my_workspace_ids()));
alter policy members_select       on public.workspace_members    using (workspace_id in (select public.my_workspace_ids()));
alter policy workspaces_select    on public.workspaces           using (id in (select public.my_workspace_ids()));

-- stats by London day for one workspace
create index if not exists calls_ws_london_day_idx
  on public.calls (workspace_id, ((started_at at time zone 'Europe/London')::date));

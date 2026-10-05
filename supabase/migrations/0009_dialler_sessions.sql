-- 0009: power dialler sessions, so a rep can close the tab and pick up exactly where they left off.
--
-- One row per run. lead_ids is the order fixed when the run started (people ids, or practice-N
-- for practice runs); position is the lead the rep is on; results holds each lead's state,
-- outcome, note, seconds and call id. Calls, outcomes and notes themselves still live in
-- public.calls / people as usual: this table only remembers the run.

create table public.dialler_sessions (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid not null references auth.users(id) on delete cascade,
  source        text not null check (source in ('practice', 'today', 'list')),
  list_id       uuid references public.lists(id) on delete set null,
  label         text not null,
  test_number   text,
  lead_ids      text[] not null default '{}',
  position      integer not null default 0 check (position >= 0),
  results       jsonb not null default '{}'::jsonb,
  status        text not null default 'active' check (status in ('active', 'paused', 'finished')),
  started_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create index dialler_sessions_user_open_idx on public.dialler_sessions (user_id, workspace_id, updated_at desc) where status <> 'finished';

create trigger dialler_sessions_set_updated_at before update on public.dialler_sessions
  for each row execute function public.set_updated_at();

alter table public.dialler_sessions enable row level security;

-- a session belongs to one rep in one of their workspaces
create policy dialler_sessions_select on public.dialler_sessions for select to authenticated
  using (user_id = (select auth.uid()) and workspace_id in (select public.my_workspace_ids()));
create policy dialler_sessions_insert on public.dialler_sessions for insert to authenticated
  with check (user_id = (select auth.uid()) and workspace_id in (select public.my_workspace_ids()));
create policy dialler_sessions_update on public.dialler_sessions for update to authenticated
  using (user_id = (select auth.uid()) and workspace_id in (select public.my_workspace_ids()))
  with check (user_id = (select auth.uid()) and workspace_id in (select public.my_workspace_ids()));
create policy dialler_sessions_delete on public.dialler_sessions for delete to authenticated
  using (user_id = (select auth.uid()) and workspace_id in (select public.my_workspace_ids()));

grant select, insert, update, delete on public.dialler_sessions to authenticated;

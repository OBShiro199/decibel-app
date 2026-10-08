-- 0022: Search with AI. A prompt is turned into the same filters Leads and Local businesses use
-- (by the `ai-search` Edge Function, which calls Claude). Each search is recorded here: it powers
-- "recent searches", per-user and per-workspace rate limits, and cost tracking. Rows are written
-- only by the function (service role); members can read their own searches.

create table public.ai_searches (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  mode            text not null check (mode in ('leads', 'local')),
  prompt          text not null check (char_length(prompt) between 1 and 1000),
  suggested_mode  text check (suggested_mode in ('leads', 'local')),
  title           text not null default '',
  summary         text not null default '',
  leads_filters   jsonb not null default '{}',
  local_filters   jsonb not null default '{}',
  notes           text[] not null default '{}',
  model           text not null default '',
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  ok              boolean not null default true,
  created_at      timestamptz not null default now()
);
create index ai_searches_user_idx on public.ai_searches (user_id, created_at desc);
create index ai_searches_ws_idx on public.ai_searches (workspace_id, created_at desc);

alter table public.ai_searches enable row level security;
create policy ai_searches_own on public.ai_searches
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.ai_searches from authenticated;
revoke all on public.ai_searches from anon;

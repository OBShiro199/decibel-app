-- 0011: founder support chat and once-only transactional emails.
--
-- Each signed-in user has one support conversation with the founder. Users can read
-- their own conversation through RLS; every write goes through the `support` Edge
-- Function (service role), which also emails the founder and rate-limits senders.
-- The founder's inbox at /private reads and replies through the same function,
-- behind a password that lives only in Edge Function secrets.

create table public.support_threads (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users(id) on delete cascade,
  email            text not null,
  name             text not null default '',
  workspace_name   text not null default '',
  status           text not null default 'open' check (status in ('open', 'closed')),
  founder_unread   boolean not null default true,
  user_unread      boolean not null default false,
  last_message_at  timestamptz not null default now(),
  last_preview     text not null default '',
  last_sender      text not null default 'user' check (last_sender in ('user', 'founder')),
  created_at       timestamptz not null default now()
);
create index support_threads_last_idx on public.support_threads (last_message_at desc);

create table public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.support_threads(id) on delete cascade,
  sender      text not null check (sender in ('user', 'founder')),
  body        text not null check (char_length(body) between 1 and 4000),
  created_at  timestamptz not null default now()
);
create index support_messages_thread_idx on public.support_messages (thread_id, created_at);

alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;

create policy support_threads_own on public.support_threads
  for select to authenticated using (user_id = (select auth.uid()));

create policy support_messages_own on public.support_messages
  for select to authenticated using (
    thread_id in (select id from public.support_threads where user_id = (select auth.uid()))
  );

-- the widget clears its unread badge; nothing else about the thread is writable by users
create or replace function public.support_mark_read()
returns void
language sql
security definer
set search_path = public
as $$
  update public.support_threads set user_unread = false
   where user_id = auth.uid() and user_unread;
$$;
revoke all on function public.support_mark_read() from public, anon;
grant execute on function public.support_mark_read() to authenticated;

-- password attempts on the founder inbox, so the password cannot be guessed at speed
create table public.support_admin_logins (
  id   bigint generated always as identity primary key,
  ok   boolean not null,
  at   timestamptz not null default now()
);
create index support_admin_logins_at_idx on public.support_admin_logins (at desc);
alter table public.support_admin_logins enable row level security;

-- once-only emails (welcome, first export): the unique key is the claim
create table public.email_log (
  user_id  uuid not null references auth.users(id) on delete cascade,
  kind     text not null,
  sent_at  timestamptz not null default now(),
  primary key (user_id, kind)
);
alter table public.email_log enable row level security;
-- no policies on support_admin_logins or email_log: only the service role touches them

-- 0023: TPS/CTPS checks.
--
-- A member uploads a file (up to 1,000 rows). Every UK number in the chosen column is checked
-- against the TPS and CTPS registers by the `tps-check` Edge Function (Provero), and the file
-- comes back with a status column: VALID, DNC (TPS), DNC (CTPS), DNC (TPS + CTPS) and so on.
--
-- Check credits are separate from data credits (0010) and carry the same guarantees, enforced by
-- the database rather than app code:
--   1. Check credits move only through tps_credit_transactions, an append-only ledger.
--      workspaces.tps_credit_balance changes only as a side effect of a ledger insert, so it always
--      equals the ledger sum, and a check constraint means it can never drop below zero.
--   2. Browsers can't write the ledger, balances, jobs, rows or results. Members act only through
--      tps_quote / tps_create_job / tps_cancel_job / tps_delete_job; the worker functions are
--      service role only.
--   3. A job reserves its whole cost up front under the workspace row lock, so two uploads at once
--      can't overspend. 1 credit per unique UK number in the file (duplicates are checked once);
--      numbers this workspace checked in the last 28 days are reused free, keeping their original
--      check date; when a job ends, every reserved credit that didn't produce a result (invalid,
--      not checked, cancelled) is refunded exactly once (unique index on job + reason).
--   4. 2,500 welcome check credits once per account (profiles.tps_credits_granted_at, claimed by a
--      single UPDATE), so extra workspaces or delete-and-recreate give nothing.
--   5. Abuse limits: 1,000 rows and 2 MB per file, 3 running jobs per workspace, 30 uploads per
--      user per hour.
--   6. Uploaded rows are personal data: members can delete a finished check, and rows are removed
--      automatically after 90 days (the summary and the ledger stay).

-- ---------------------------------------------------------------------------
-- 1. Balance and welcome flag
-- ---------------------------------------------------------------------------
alter table public.workspaces add column if not exists tps_credit_balance integer not null default 0;
alter table public.workspaces drop constraint if exists workspaces_tps_credit_balance_check;
alter table public.workspaces add constraint workspaces_tps_credit_balance_check check (tps_credit_balance >= 0);

-- not in the profiles column grants from 0010, so browsers can't touch it
alter table public.profiles add column if not exists tps_credits_granted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. The ledger (append-only)
-- ---------------------------------------------------------------------------
create table if not exists public.tps_credit_transactions (
  id            bigint generated always as identity primary key,
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,
  delta         integer not null check (delta <> 0),
  reason        text not null check (reason in ('welcome', 'reserve', 'refund', 'topup', 'adjustment')),
  job_id        uuid,             -- no foreign key: the ledger outlives a deleted check
  reference     text,             -- top-ups: a unique reference so a grant can't be applied twice
  note          text,
  created_at    timestamptz not null default now(),
  check ((reason in ('reserve', 'refund')) = (job_id is not null)),
  check (reason <> 'reserve' or delta < 0),
  check (reason not in ('welcome', 'refund', 'topup') or delta > 0)
);
create unique index if not exists tps_ledger_job_reason_uidx on public.tps_credit_transactions (job_id, reason) where job_id is not null;
create unique index if not exists tps_ledger_reference_uidx on public.tps_credit_transactions (reference) where reference is not null;
create index if not exists tps_ledger_ws_idx on public.tps_credit_transactions (workspace_id, created_at desc);

alter table public.tps_credit_transactions enable row level security;
drop policy if exists tps_ledger_read on public.tps_credit_transactions;
create policy tps_ledger_read on public.tps_credit_transactions
  for select to authenticated using (workspace_id in (select public.my_workspace_ids()));
revoke insert, update, delete, truncate on public.tps_credit_transactions from authenticated, anon;
revoke all on public.tps_credit_transactions from anon;

create or replace function public.tps_ledger_immutable()
returns trigger language plpgsql as $$
begin
  -- a workspace being deleted takes its own ledger with it (cascade); nothing else may remove rows
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.workspace_id) then
    return old;
  end if;
  raise exception 'tps_credit_transactions is append-only: % is not allowed', tg_op using errcode = '42501';
end $$;

create or replace function public.tps_ledger_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception 'tps_credit_transactions is append-only: TRUNCATE is not allowed' using errcode = '42501';
end $$;

drop trigger if exists tps_ledger_no_change on public.tps_credit_transactions;
create trigger tps_ledger_no_change before update or delete on public.tps_credit_transactions
  for each row execute function public.tps_ledger_immutable();
drop trigger if exists tps_ledger_no_truncate on public.tps_credit_transactions;
create trigger tps_ledger_no_truncate before truncate on public.tps_credit_transactions
  for each statement execute function public.tps_ledger_no_truncate();

-- the balance follows the ledger, and nothing else may move it
create or replace function public.apply_tps_credit_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('decibel.tps_ledger_write', 'on', true);
  update public.workspaces set tps_credit_balance = tps_credit_balance + new.delta where id = new.workspace_id;
  perform set_config('decibel.tps_ledger_write', 'off', true);
  return new;
end $$;

drop trigger if exists tps_ledger_apply on public.tps_credit_transactions;
create trigger tps_ledger_apply after insert on public.tps_credit_transactions
  for each row execute function public.apply_tps_credit_transaction();

create or replace function public.guard_tps_credit_balance()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.tps_credit_balance <> 0 then
    raise exception 'a workspace starts with no check credits; grant them through tps_credit_transactions' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.tps_credit_balance is distinct from old.tps_credit_balance
     and coalesce(current_setting('decibel.tps_ledger_write', true), 'off') <> 'on' then
    raise exception 'tps_credit_balance changes only through tps_credit_transactions' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists workspaces_guard_tps_credit_balance on public.workspaces;
create trigger workspaces_guard_tps_credit_balance before insert or update of tps_credit_balance on public.workspaces
  for each row execute function public.guard_tps_credit_balance();

-- reconciliation: workspaces whose balance differs from the ledger (should return nothing)
create or replace function public.tps_ledger_check()
returns table (workspace_id uuid, balance integer, ledger integer)
language sql stable security definer set search_path = public as $$
  select w.id, w.tps_credit_balance, coalesce(sum(t.delta), 0)::integer
    from public.workspaces w left join public.tps_credit_transactions t on t.workspace_id = w.id
   group by w.id, w.tps_credit_balance
  having w.tps_credit_balance <> coalesce(sum(t.delta), 0)
$$;
revoke execute on function public.tps_ledger_check() from public, anon, authenticated;
grant  execute on function public.tps_ledger_check() to service_role;

-- ---------------------------------------------------------------------------
-- 3. 2,500 welcome check credits, once per account
-- ---------------------------------------------------------------------------
create or replace function public.grant_tps_welcome()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  with claimed as (
    update public.profiles set tps_credits_granted_at = now()
     where id = new.created_by and tps_credits_granted_at is null
    returning id
  )
  insert into public.tps_credit_transactions (workspace_id, user_id, delta, reason, note)
  select new.id, new.created_by, 2500, 'welcome', 'Welcome TPS/CTPS check credits' from claimed;
  return new;
end $$;
revoke execute on function public.grant_tps_welcome() from public, anon, authenticated;

drop trigger if exists workspaces_grant_tps_welcome on public.workspaces;
create trigger workspaces_grant_tps_welcome after insert on public.workspaces
  for each row execute function public.grant_tps_welcome();

-- existing accounts: 2,500 once, into their first workspace
with firsts as (
  select distinct on (w.created_by) w.id, w.created_by
    from public.workspaces w join public.profiles p on p.id = w.created_by
   where p.tps_credits_granted_at is null
   order by w.created_by, w.created_at
), claimed as (
  update public.profiles p set tps_credits_granted_at = now() from firsts f where p.id = f.created_by
  returning p.id
)
insert into public.tps_credit_transactions (workspace_id, user_id, delta, reason, note)
select f.id, f.created_by, 2500, 'welcome', 'Welcome TPS/CTPS check credits' from firsts f join claimed c on c.id = f.created_by;

-- Top-ups (no Stripe yet): the founder grants them by hand from the SQL editor, e.g.
--   select public.tps_grant_credits('<workspace id>', 1000, 'topup-2026-10-08-acme', 'Top-up by email');
-- The reference is unique, so running it twice can't double the grant.
create or replace function public.tps_grant_credits(p_workspace_id uuid, p_amount integer, p_reference text, p_note text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare tid bigint;
begin
  if p_amount is null or p_amount = 0 or abs(p_amount) > 1000000 then raise exception 'amount must be between -1,000,000 and 1,000,000, not 0'; end if;
  if coalesce(btrim(p_reference), '') = '' then raise exception 'a unique reference is required'; end if;
  insert into public.tps_credit_transactions (workspace_id, delta, reason, reference, note)
  values (p_workspace_id, p_amount, case when p_amount > 0 then 'topup' else 'adjustment' end, p_reference, p_note)
  returning id into tid;
  return tid;
end $$;
revoke execute on function public.tps_grant_credits(uuid, integer, text, text) from public, anon, authenticated;
grant  execute on function public.tps_grant_credits(uuid, integer, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Jobs, rows and the numbers to check
-- ---------------------------------------------------------------------------
create table if not exists public.tps_jobs (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  user_id           uuid references public.profiles(id) on delete set null,
  file_name         text not null check (char_length(file_name) between 1 and 200),
  headers           jsonb not null check (jsonb_typeof(headers) = 'array'),
  phone_column      integer not null check (phone_column >= 0),
  -- running → done | cancelled | failed. finished_at is set once the credits are settled.
  status            text not null default 'running' check (status in ('running', 'done', 'cancelled', 'failed')),
  total_rows        integer not null default 0,
  numbers_total     integer not null default 0,   -- unique UK numbers in the file
  numbers_reused    integer not null default 0,   -- of those, checked in the last 28 days (free)
  numbers_done      integer not null default 0,   -- unique numbers with an outcome so far
  -- row tallies (a row is one line of the file), kept current by the worker
  rows_valid        integer not null default 0,
  rows_tps          integer not null default 0,
  rows_ctps         integer not null default 0,
  rows_both         integer not null default 0,
  rows_invalid      integer not null default 0,
  rows_not_uk       integer not null default 0,
  rows_missing      integer not null default 0,
  rows_unchecked    integer not null default 0,
  credits_reserved  integer not null default 0,
  credits_refunded  integer not null default 0,
  error             text,
  heartbeat_at      timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  finished_at       timestamptz
);
create index if not exists tps_jobs_ws_idx on public.tps_jobs (workspace_id, created_at desc);
create index if not exists tps_jobs_user_idx on public.tps_jobs (user_id, created_at desc);
create index if not exists tps_jobs_open_idx on public.tps_jobs (heartbeat_at) where finished_at is null;

create table if not exists public.tps_job_rows (
  job_id        uuid not null references public.tps_jobs(id) on delete cascade,
  workspace_id  uuid not null,
  row_no        integer not null,
  cells         jsonb not null check (jsonb_typeof(cells) = 'array'),
  phone_raw     text not null default '',
  e164          text,
  kind          text not null check (kind in ('uk', 'not_uk', 'invalid', 'missing')),
  primary key (job_id, row_no)
);
create index if not exists tps_job_rows_number_idx on public.tps_job_rows (job_id, e164) where e164 is not null;

create table if not exists public.tps_job_numbers (
  job_id        uuid not null references public.tps_jobs(id) on delete cascade,
  workspace_id  uuid not null,
  e164          text not null,
  -- pending → checking → done | invalid | error, or skipped when a check is cancelled
  status        text not null default 'pending' check (status in ('pending', 'checking', 'done', 'invalid', 'error', 'skipped')),
  on_tps        boolean,
  on_ctps       boolean,
  tps_since     date,
  ctps_since    date,
  reused        boolean not null default false,
  attempts      smallint not null default 0,
  claimed_at    timestamptz,
  checked_at    timestamptz,
  error         text,
  primary key (job_id, e164),
  check (status <> 'done' or (on_tps is not null and on_ctps is not null and checked_at is not null))
);
create index if not exists tps_numbers_open_idx on public.tps_job_numbers (job_id, status) where status in ('pending', 'checking');
create index if not exists tps_numbers_recent_idx on public.tps_job_numbers (workspace_id, e164, checked_at desc) where status = 'done';

-- members read their workspace's checks; nobody writes from the browser
alter table public.tps_jobs enable row level security;
alter table public.tps_job_rows enable row level security;
alter table public.tps_job_numbers enable row level security;
drop policy if exists tps_jobs_read on public.tps_jobs;
create policy tps_jobs_read on public.tps_jobs for select to authenticated using (workspace_id in (select public.my_workspace_ids()));
drop policy if exists tps_job_rows_read on public.tps_job_rows;
create policy tps_job_rows_read on public.tps_job_rows for select to authenticated using (workspace_id in (select public.my_workspace_ids()));
drop policy if exists tps_job_numbers_read on public.tps_job_numbers;
create policy tps_job_numbers_read on public.tps_job_numbers for select to authenticated using (workspace_id in (select public.my_workspace_ids()));
revoke insert, update, delete, truncate on public.tps_jobs, public.tps_job_rows, public.tps_job_numbers from authenticated;
revoke all on public.tps_jobs, public.tps_job_rows, public.tps_job_numbers from anon;

-- ---------------------------------------------------------------------------
-- 5. Reading a phone cell
-- ---------------------------------------------------------------------------
-- 'uk' (+44 then 9 or 10 digits starting 1, 2, 3, 7 or 8: landlines, mobiles, 03 and 08 numbers),
-- 'not_uk' (another country, never checked or charged), 'invalid' or 'missing'.
-- Accepts 07…, +44 7…, 0044 7…, 44 7…, +44 (0)7…, spaces, dots, dashes and brackets, an
-- extension at the end, and UK numbers whose leading 0 a spreadsheet dropped (7…, 1…).
create or replace function public.tps_classify(p text, out e164 text, out kind text)
language plpgsql immutable set search_path = public as $$
declare s text; d text;
begin
  s := btrim(coalesce(p, ''));
  if s = '' then kind := 'missing'; return; end if;
  s := regexp_replace(s, '\(\s*0\s*\)', '', 'g');                       -- +44 (0)7…
  s := regexp_replace(s, '\s*(ext\.?|extension|x)\s*\d{1,6}\s*$', '', 'i'); -- extensions
  if s ~ '[A-Za-z]' or s !~ '\d' then kind := 'invalid'; return; end if; -- words, 4.47E+11
  d := regexp_replace(s, '[^0-9]', '', 'g');
  if s ~ '^\+' then null;                                                -- already international
  elsif d like '00%' then d := substr(d, 3);
  elsif d like '0%' then d := '44' || substr(d, 2);
  elsif d ~ '^44\d{9,10}$' then null;
  elsif d ~ '^[17]\d{9}$' or d ~ '^1\d{8}$' then d := '44' || d;         -- leading 0 lost
  else kind := 'invalid'; return;
  end if;
  if d ~ '^440\d{9,10}$' then d := '44' || substr(d, 4); end if;          -- +44 07…
  if d ~ '^44[12378]\d{8,9}$' then e164 := '+' || d; kind := 'uk';
  elsif d ~ '^44' then kind := 'invalid';
  elsif d ~ '^[1-9]\d{7,14}$' then e164 := '+' || d; kind := 'not_uk';
  else kind := 'invalid';
  end if;
end $$;
grant execute on function public.tps_classify(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Tallies and settlement (internal)
-- ---------------------------------------------------------------------------
create or replace function public.tps_refresh_job(p_job_id uuid)
returns void language sql security definer set search_path = public as $$
  with r as (
    select
      count(*) as total,
      count(*) filter (where o = 'valid')   as valid,
      count(*) filter (where o = 'tps')     as tps,
      count(*) filter (where o = 'ctps')    as ctps,
      count(*) filter (where o = 'both')    as both_,
      count(*) filter (where o = 'invalid') as invalid,
      count(*) filter (where o = 'not_uk')  as not_uk,
      count(*) filter (where o = 'missing') as missing,
      count(*) filter (where o = 'unchecked') as unchecked
    from (
      select case
               when r.kind <> 'uk' then r.kind
               when n.status = 'done' and n.on_tps and n.on_ctps then 'both'
               when n.status = 'done' and n.on_tps then 'tps'
               when n.status = 'done' and n.on_ctps then 'ctps'
               when n.status = 'done' then 'valid'
               when n.status = 'invalid' then 'invalid'
               when n.status in ('error', 'skipped') then 'unchecked'
               else 'pending'
             end as o
        from public.tps_job_rows r
        left join public.tps_job_numbers n on n.job_id = r.job_id and n.e164 = r.e164
       where r.job_id = p_job_id
    ) x
  ), n as (
    select count(*) filter (where status in ('done', 'invalid', 'error', 'skipped')) as done
      from public.tps_job_numbers where job_id = p_job_id
  )
  update public.tps_jobs j
     set rows_valid = r.valid, rows_tps = r.tps, rows_ctps = r.ctps, rows_both = r.both_,
         rows_invalid = r.invalid, rows_not_uk = r.not_uk, rows_missing = r.missing,
         rows_unchecked = r.unchecked, numbers_done = n.done
    from r, n
   where j.id = p_job_id
$$;
revoke execute on function public.tps_refresh_job(uuid) from public, anon, authenticated;

-- Ends a check and settles its credits, once. With p_error, numbers still waiting are given up
-- (provider outage) and the check is marked failed. Charged = numbers checked live with a result;
-- everything else that was reserved comes back.
create or replace function public.tps_finish_job(p_job_id uuid, p_error text default null)
returns public.tps_jobs language plpgsql security definer set search_path = public as $$
declare j public.tps_jobs; charged integer; refund integer;
begin
  select * into j from public.tps_jobs where id = p_job_id for update;
  if not found then raise exception 'check not found'; end if;
  if j.finished_at is not null then return j; end if;

  if p_error is not null then
    update public.tps_job_numbers set status = 'error', error = left(p_error, 200)
     where job_id = p_job_id and status in ('pending', 'checking');
  elsif exists (select 1 from public.tps_job_numbers where job_id = p_job_id and status in ('pending', 'checking')) then
    return j;  -- still working; the last batch settles it
  end if;

  select count(*) into charged from public.tps_job_numbers where job_id = p_job_id and status = 'done' and not reused;
  refund := greatest(j.credits_reserved - charged, 0);
  if refund > 0 then
    insert into public.tps_credit_transactions (workspace_id, user_id, delta, reason, job_id, note)
    values (j.workspace_id, j.user_id, refund, 'refund', j.id, 'Unused check credits returned')
    on conflict do nothing;
  end if;

  perform public.tps_refresh_job(p_job_id);
  update public.tps_jobs
     set status = case when p_error is not null then 'failed' when status = 'running' then 'done' else status end,
         error = coalesce(left(p_error, 200), error),
         credits_refunded = refund,
         finished_at = now(),
         heartbeat_at = now()
   where id = p_job_id
  returning * into j;
  return j;
end $$;
revoke execute on function public.tps_finish_job(uuid, text) from public, anon, authenticated;
grant  execute on function public.tps_finish_job(uuid, text) to service_role;

-- Starts the worker for a check. pg_net sends only after the transaction commits.
create or replace function public.tps_kick(p_job_id uuid)
returns void language plpgsql security definer set search_path = public, vault, extensions as $$
declare token text;
begin
  select decrypted_secret into token from vault.decrypted_secrets where name = 'decibels_cron_secret';
  if token is null then return; end if;  -- the sweeper picks it up
  perform net.http_post(
    url := 'https://fkjwglvztyyerewldnty.supabase.co/functions/v1/tps-check',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    body := case when p_job_id is null then '{}'::jsonb else jsonb_build_object('job_id', p_job_id) end,
    timeout_milliseconds := 5000
  );
end $$;
revoke execute on function public.tps_kick(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. What members can call
-- ---------------------------------------------------------------------------
-- The exact cost of checking a column before anything is charged.
create or replace function public.tps_quote(p_workspace_id uuid, p_values text[])
returns table (rows_total integer, numbers_total integer, numbers_reused integer, cost integer,
               rows_not_uk integer, rows_invalid integer, rows_missing integer, balance integer)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_workspace_id is null or p_workspace_id not in (select public.my_workspace_ids()) then raise exception 'not a member of this workspace' using errcode = '42501'; end if;
  if coalesce(array_length(p_values, 1), 0) > 1000 then raise exception 'too_many_rows: a file can have up to 1,000 rows'; end if;
  return query
  with c as (select (public.tps_classify(v)).* from unnest(coalesce(p_values, '{}')) v),
       u as (select distinct c.e164 from c where c.kind = 'uk'),
       r as (select count(*)::integer as n from u
              where exists (select 1 from public.tps_job_numbers n
                             where n.workspace_id = p_workspace_id and n.e164 = u.e164 and n.status = 'done'
                               and n.checked_at > now() - interval '28 days'))
  select coalesce(array_length(p_values, 1), 0),
         (select count(*)::integer from u),
         r.n,
         (select count(*)::integer from u) - r.n,
         (select count(*)::integer from c where c.kind = 'not_uk'),
         (select count(*)::integer from c where c.kind = 'invalid'),
         (select count(*)::integer from c where c.kind = 'missing'),
         (select w.tps_credit_balance from public.workspaces w where w.id = p_workspace_id)
    from r;
end $$;
revoke execute on function public.tps_quote(uuid, text[]) from public, anon;
grant  execute on function public.tps_quote(uuid, text[]) to authenticated;

-- Creates a check: stores the file, works out the unique numbers, reserves the credits and
-- starts the worker. All or nothing.
create or replace function public.tps_create_job(p_workspace_id uuid, p_file_name text, p_headers jsonb, p_phone_column integer, p_rows jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  bal integer;
  jid uuid;
  n_rows integer;
  cost integer;
  reused integer;
begin
  if uid is null then raise exception 'sign in first' using errcode = '42501'; end if;
  if p_workspace_id is null or p_workspace_id not in (select public.my_workspace_ids()) then raise exception 'not a member of this workspace' using errcode = '42501'; end if;

  -- the file
  if coalesce(btrim(p_file_name), '') = '' then raise exception 'invalid_file: the file needs a name'; end if;
  if jsonb_typeof(p_headers) is distinct from 'array' or jsonb_array_length(p_headers) not between 1 and 200 then
    raise exception 'invalid_file: between 1 and 200 columns are allowed';
  end if;
  if exists (select 1 from jsonb_array_elements(p_headers) h where jsonb_typeof(h) <> 'string') then
    raise exception 'invalid_file: column names must be text';
  end if;
  if p_phone_column is null or p_phone_column < 0 or p_phone_column >= jsonb_array_length(p_headers) then
    raise exception 'invalid_file: choose the column with the phone numbers';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'invalid_file: rows must be a list'; end if;
  n_rows := jsonb_array_length(p_rows);
  if n_rows = 0 then raise exception 'invalid_file: the file has no rows'; end if;
  if n_rows > 1000 then raise exception 'too_many_rows: a file can have up to 1,000 rows, this one has %', n_rows; end if;
  if octet_length(p_rows::text) > 2000000 then raise exception 'file_too_large: files can be up to 2 MB'; end if;
  if exists (select 1 from jsonb_array_elements(p_rows) r
              where jsonb_typeof(r) <> 'array' or jsonb_array_length(r) > 200
                 or exists (select 1 from jsonb_array_elements(r) c where jsonb_typeof(c) not in ('string', 'null'))) then
    raise exception 'invalid_file: every row must be a list of text cells';
  end if;

  -- abuse limits
  if (select count(*) from public.tps_jobs where workspace_id = p_workspace_id and finished_at is null) >= 3 then
    raise exception 'too_many_running: wait for one of your checks to finish';
  end if;
  if (select count(*) from public.tps_jobs where user_id = uid and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'slow_down: you have uploaded a lot of files this hour, try again shortly';
  end if;

  -- one check at a time per workspace past this point, so the balance can't change under us
  select tps_credit_balance into bal from public.workspaces where id = p_workspace_id for update;

  insert into public.tps_jobs (workspace_id, user_id, file_name, headers, phone_column, total_rows)
  values (p_workspace_id, uid, left(btrim(p_file_name), 200), p_headers, p_phone_column, n_rows)
  returning id into jid;

  insert into public.tps_job_rows (job_id, workspace_id, row_no, cells, phone_raw, e164, kind)
  select jid, p_workspace_id, (r.ord - 1)::integer, r.cells, left(coalesce(r.cells ->> p_phone_column, ''), 100), c.e164, c.kind
    from jsonb_array_elements(p_rows) with ordinality as r(cells, ord)
    cross join lateral public.tps_classify(r.cells ->> p_phone_column) c;

  -- unique UK numbers; a result from the last 28 days is reused free with its original date
  insert into public.tps_job_numbers (job_id, workspace_id, e164, status, on_tps, on_ctps, tps_since, ctps_since, reused, checked_at)
  select jid, p_workspace_id, u.e164,
         case when prev.e164 is null then 'pending' else 'done' end,
         prev.on_tps, prev.on_ctps, prev.tps_since, prev.ctps_since, prev.e164 is not null, prev.checked_at
    from (select distinct e164 from public.tps_job_rows where job_id = jid and kind = 'uk') u
    left join lateral (
      select n.e164, n.on_tps, n.on_ctps, n.tps_since, n.ctps_since, n.checked_at
        from public.tps_job_numbers n
       where n.workspace_id = p_workspace_id and n.e164 = u.e164 and n.status = 'done'
         and n.checked_at > now() - interval '28 days'
       order by n.checked_at desc
       limit 1
    ) prev on true;

  select count(*) filter (where not n.reused), count(*) filter (where n.reused) into cost, reused
    from public.tps_job_numbers n where n.job_id = jid;

  if cost > bal then
    raise exception 'insufficient_tps_credits: this file needs % check credits, you have %', cost, bal;
  end if;
  if cost > 0 then
    insert into public.tps_credit_transactions (workspace_id, user_id, delta, reason, job_id, note)
    values (p_workspace_id, uid, -cost, 'reserve', jid, 'TPS/CTPS check: ' || left(btrim(p_file_name), 120));
  end if;

  update public.tps_jobs set numbers_total = cost + reused, numbers_reused = reused, credits_reserved = cost where id = jid;
  perform public.tps_refresh_job(jid);

  if cost = 0 then
    perform public.tps_finish_job(jid);   -- nothing to check live: done straight away
  else
    perform public.tps_kick(jid);
  end if;
  return jid;
end $$;
revoke execute on function public.tps_create_job(uuid, text, jsonb, integer, jsonb) from public, anon;
grant  execute on function public.tps_create_job(uuid, text, jsonb, integer, jsonb) to authenticated;

-- Stops a running check. Numbers not yet checked are skipped and refunded when it settles.
create or replace function public.tps_cancel_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare j public.tps_jobs;
begin
  select * into j from public.tps_jobs where id = p_job_id for update;
  if not found or j.workspace_id not in (select public.my_workspace_ids()) then raise exception 'check not found' using errcode = '42501'; end if;
  if j.status <> 'running' then return; end if;
  update public.tps_jobs set status = 'cancelled' where id = p_job_id;
  update public.tps_job_numbers set status = 'skipped' where job_id = p_job_id and status = 'pending';
  perform public.tps_finish_job(p_job_id);  -- settles now unless a batch is mid-check
end $$;
revoke execute on function public.tps_cancel_job(uuid) from public, anon;
grant  execute on function public.tps_cancel_job(uuid) to authenticated;

-- Deletes a finished check and its rows (the ledger keeps the credit history).
create or replace function public.tps_delete_job(p_job_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare j public.tps_jobs;
begin
  select * into j from public.tps_jobs where id = p_job_id for update;
  if not found or j.workspace_id not in (select public.my_workspace_ids()) then raise exception 'check not found' using errcode = '42501'; end if;
  if j.finished_at is null then raise exception 'still_running: cancel the check first'; end if;
  delete from public.tps_jobs where id = p_job_id;
end $$;
revoke execute on function public.tps_delete_job(uuid) from public, anon;
grant  execute on function public.tps_delete_job(uuid) to authenticated;

-- The checked file: every row with its outcome, in file order.
create or replace function public.tps_job_results(p_job_id uuid)
returns table (row_no integer, cells jsonb, phone_raw text, e164 text, outcome text,
               tps_since date, ctps_since date, checked_at timestamptz)
language sql stable security definer set search_path = public as $$
  select r.row_no, r.cells, r.phone_raw, r.e164,
         case
           when r.kind <> 'uk' then r.kind
           when n.status = 'done' and n.on_tps and n.on_ctps then 'both'
           when n.status = 'done' and n.on_tps then 'tps'
           when n.status = 'done' and n.on_ctps then 'ctps'
           when n.status = 'done' then 'valid'
           when n.status = 'invalid' then 'invalid'
           when n.status in ('error', 'skipped') then 'unchecked'
           else 'pending'
         end,
         n.tps_since, n.ctps_since, n.checked_at
    from public.tps_jobs j
    join public.tps_job_rows r on r.job_id = j.id
    left join public.tps_job_numbers n on n.job_id = r.job_id and n.e164 = r.e164
   where j.id = p_job_id and j.workspace_id in (select public.my_workspace_ids())
   order by r.row_no
$$;
revoke execute on function public.tps_job_results(uuid) from public, anon;
grant  execute on function public.tps_job_results(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. The worker (service role only)
-- ---------------------------------------------------------------------------
-- Claims up to p_limit numbers. SKIP LOCKED means two workers on one check never take the same
-- number; a claim older than 2 minutes (a worker that died) is retried, up to 3 attempts.
create or replace function public.tps_claim(p_job_id uuid, p_limit integer default 20)
returns table (e164 text) language plpgsql security definer set search_path = public as $$
begin
  update public.tps_job_numbers n set status = 'error', error = 'Not checked after 3 attempts'
   where n.job_id = p_job_id and n.status = 'checking' and n.claimed_at < now() - interval '2 minutes' and n.attempts >= 3;
  if not exists (select 1 from public.tps_jobs where id = p_job_id and status = 'running') then return; end if;
  update public.tps_jobs set heartbeat_at = now() where id = p_job_id;
  return query
  update public.tps_job_numbers n
     set status = 'checking', claimed_at = now(), attempts = n.attempts + 1
   where (n.job_id, n.e164) in (
           select x.job_id, x.e164 from public.tps_job_numbers x
            where x.job_id = p_job_id
              and (x.status = 'pending' or (x.status = 'checking' and x.claimed_at < now() - interval '2 minutes'))
              and x.attempts < 3
            order by x.e164
            limit least(greatest(p_limit, 1), 50)
            for update skip locked)
  returning n.e164;
end $$;
revoke execute on function public.tps_claim(uuid, integer) from public, anon, authenticated;
grant  execute on function public.tps_claim(uuid, integer) to service_role;

-- Saves a batch: [{ e164, status: done|invalid|error|retry, on_tps, on_ctps, tps_since, ctps_since, error }].
-- Only numbers this worker holds ('checking') are written, so a late or repeated save can't
-- overwrite anything. Settles the check when nothing is left.
create or replace function public.tps_save(p_job_id uuid, p_results jsonb)
returns public.tps_jobs language plpgsql security definer set search_path = public as $$
declare j public.tps_jobs;
begin
  update public.tps_job_numbers n
     set status = case x.status when 'retry' then (case when n.attempts >= 3 then 'error' else 'pending' end) else x.status end,
         on_tps = case when x.status = 'done' then coalesce(x.on_tps, false) end,
         on_ctps = case when x.status = 'done' then coalesce(x.on_ctps, false) end,
         tps_since = case when x.status = 'done' then x.tps_since end,
         ctps_since = case when x.status = 'done' then x.ctps_since end,
         checked_at = case when x.status in ('done', 'invalid') then now() end,
         error = case when x.status in ('error', 'retry') then left(x.error, 200) end
    from jsonb_to_recordset(p_results) as x(e164 text, status text, on_tps boolean, on_ctps boolean, tps_since date, ctps_since date, error text)
   where n.job_id = p_job_id and n.e164 = x.e164 and n.status = 'checking'
     and x.status in ('done', 'invalid', 'error', 'retry');

  -- a cancelled check stops claiming; anything handed back is skipped
  update public.tps_job_numbers set status = 'skipped'
   where job_id = p_job_id and status = 'pending'
     and exists (select 1 from public.tps_jobs where id = p_job_id and status = 'cancelled');

  perform public.tps_refresh_job(p_job_id);
  update public.tps_jobs set heartbeat_at = now() where id = p_job_id;
  select * into j from public.tps_finish_job(p_job_id);
  return j;
end $$;
revoke execute on function public.tps_save(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.tps_save(uuid, jsonb) to service_role;

-- Checks whose worker went quiet: settles the ones with nothing left and returns the rest to resume.
create or replace function public.tps_sweep()
returns table (job_id uuid) language plpgsql security definer set search_path = public as $$
declare j record;
begin
  for j in select id from public.tps_jobs where finished_at is null and heartbeat_at < now() - interval '45 seconds' for update skip locked loop
    update public.tps_job_numbers set status = case when attempts >= 3 then 'error' else 'pending' end,
                                      error = case when attempts >= 3 then 'Not checked after 3 attempts' end
     where tps_job_numbers.job_id = j.id and status = 'checking' and claimed_at < now() - interval '2 minutes';
    update public.tps_job_numbers set status = 'skipped'
     where tps_job_numbers.job_id = j.id and status = 'pending'
       and exists (select 1 from public.tps_jobs where id = j.id and status = 'cancelled');
    perform public.tps_finish_job(j.id);
    if exists (select 1 from public.tps_jobs where id = j.id and finished_at is null and status = 'running') then
      update public.tps_jobs set heartbeat_at = now() where id = j.id;
      job_id := j.id;
      return next;
    end if;
  end loop;
end $$;
revoke execute on function public.tps_sweep() from public, anon, authenticated;
grant  execute on function public.tps_sweep() to service_role;

-- every minute, but only wakes the function when a check has stalled
create or replace function public.tps_sweep_kick()
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.tps_jobs where finished_at is null and heartbeat_at < now() - interval '45 seconds') then
    perform public.tps_kick(null);
  end if;
end $$;
revoke execute on function public.tps_sweep_kick() from public, anon, authenticated;

-- uploaded rows are personal data: keep them 90 days
create or replace function public.tps_purge_old()
returns void language sql security definer set search_path = public as $$
  delete from public.tps_job_rows r using public.tps_jobs j
   where r.job_id = j.id and j.finished_at < now() - interval '90 days';
  delete from public.tps_job_numbers n using public.tps_jobs j
   where n.job_id = j.id and j.finished_at < now() - interval '90 days';
$$;
revoke execute on function public.tps_purge_old() from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname in ('decibel-tps-sweep', 'decibel-tps-purge');
select cron.schedule('decibel-tps-sweep', '* * * * *', $$select public.tps_sweep_kick()$$);
select cron.schedule('decibel-tps-purge', '40 3 * * *', $$select public.tps_purge_old()$$);

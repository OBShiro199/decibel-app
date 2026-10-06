-- 0016: free public tools (phone check, email check, TPS/CTPS check) that call paid
-- pay-as-you-go APIs, without letting anyone run up the bill.
--
-- Defences, in the order a request meets them (enforced by free_tool_consume, which the
-- public `free-tools` Edge Function calls with the service role before any paid API):
--   1. Turnstile (bot check) is verified in the Edge Function before this runs.
--   2. Kill switch and per-tool enable flag (free_tool_config).
--   3. Blocklist of abusive IPs (hashed) with an expiry.
--   4. Cache: the same number/email checked recently returns the stored result, free.
--      Keys are salted SHA-256 hashes, so no raw phone numbers or emails are stored.
--   5. Per-IP limits per tool: per minute (burst) and per day; signed-in users get more.
--   6. Per-tool cap on paid lookups per day (protects small prepaid credit balances), plus a
--      global daily spend cap across all tools; when either is reached, that tool pauses
--      until midnight (London).
--   7. A transaction lock on the budget keeps concurrent requests from overspending.
-- Nothing here is readable or writable by browsers: RLS on, no policies, privileges revoked.
-- Costs are integer micro-pounds (1 GBP = 1,000,000) so maths stays exact.

create table public.free_tool_config (
  tool              text primary key check (tool in ('phone', 'email', 'tps')),
  enabled           boolean not null default true,
  cost_micros       integer not null check (cost_micros >= 0),   -- what one paid lookup costs us
  anon_per_day      integer not null default 5,                  -- per IP, signed out
  user_per_day      integer not null default 25,                 -- per signed-in user
  per_minute        integer not null default 3,                  -- burst limit per IP
  max_paid_per_day  integer not null default 30,                 -- paid lookups per day, everyone together
  cache_days        integer not null default 7
);

-- costs are estimates for the spend cap; the per-day caps are what protect the prepaid balances
insert into public.free_tool_config (tool, cost_micros, anon_per_day, user_per_day, per_minute, max_paid_per_day, cache_days) values
  ('phone',  6500, 5, 20, 3, 40, 30),   -- Twilio Lookup line type, $0.008
  ('email',  3000, 5, 20, 3, 40, 14),   -- MillionVerifier, one credit
  ('tps',   16000, 3, 10, 3, 15, 7)     -- tpsapi.com, two credits (TPS + CTPS); short cache because registers change
on conflict (tool) do nothing;

create table public.free_tool_settings (
  id                  boolean primary key default true check (id),  -- single row
  kill_switch         boolean not null default false,              -- true pauses every tool instantly
  daily_cap_micros    bigint not null default 3000000              -- £3 a day across all tools
);
insert into public.free_tool_settings default values on conflict do nothing;

create table public.free_tool_budget (
  day           date not null,
  tool          text not null,
  spent_micros  bigint not null default 0,
  lookups       integer not null default 0,
  primary key (day, tool)
);

create table public.free_tool_usage (
  id           bigint generated always as identity primary key,
  tool         text not null,
  ip_hash      text not null,
  user_id      uuid references auth.users(id) on delete set null,
  cached       boolean not null default false,
  cost_micros  integer not null default 0,
  refunded     boolean not null default false,
  created_at   timestamptz not null default now()
);
create index free_tool_usage_ip_idx on public.free_tool_usage (ip_hash, tool, created_at desc);
create index free_tool_usage_user_idx on public.free_tool_usage (user_id, tool, created_at desc) where user_id is not null;
create index free_tool_usage_created_idx on public.free_tool_usage (created_at);

create table public.free_tool_blocklist (
  ip_hash     text primary key,
  reason      text not null default '',
  blocked_at  timestamptz not null default now(),
  until       timestamptz                     -- null = permanent
);

create table public.free_tool_cache (
  tool        text not null,
  key_hash    text not null,                  -- salted hash of the normalised number/email
  result      jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (tool, key_hash)
);
create index free_tool_cache_created_idx on public.free_tool_cache (created_at);

alter table public.free_tool_config    enable row level security;
alter table public.free_tool_settings  enable row level security;
alter table public.free_tool_budget    enable row level security;
alter table public.free_tool_usage     enable row level security;
alter table public.free_tool_blocklist enable row level security;
alter table public.free_tool_cache     enable row level security;
revoke all on public.free_tool_config, public.free_tool_settings, public.free_tool_budget,
              public.free_tool_usage, public.free_tool_blocklist, public.free_tool_cache
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- free_tool_consume: the single gate. Call it before any paid API.
--   returns: allowed, reason, usage_id, cached_result
--   reason:  'ok' | 'cached' | 'disabled' | 'blocked' | 'burst' | 'daily_limit' | 'budget'
-- A cached hit costs nothing but still counts toward the IP's daily limit, so the cache
-- cannot be used to enumerate numbers at speed.
-- ---------------------------------------------------------------------------
create or replace function public.free_tool_consume(
  p_tool     text,
  p_ip_hash  text,
  p_user_id  uuid,
  p_key_hash text
)
returns table (allowed boolean, reason text, usage_id bigint, cached_result jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg      public.free_tool_config%rowtype;
  st       public.free_tool_settings%rowtype;
  today    date := (now() at time zone 'Europe/London')::date;
  day_from timestamptz := (today::timestamp at time zone 'Europe/London');
  used_day int;
  used_min int;
  limit_day int;
  hit      jsonb;
  spent    bigint;
  paid     int;
  new_id   bigint;
begin
  if p_ip_hash is null or length(p_ip_hash) < 16 or p_key_hash is null or length(p_key_hash) < 16 then
    return query select false, 'bad_request'::text, null::bigint, null::jsonb; return;
  end if;

  select * into st from public.free_tool_settings where id;
  select * into cfg from public.free_tool_config where tool = p_tool;
  if not found or not cfg.enabled or st.kill_switch then
    return query select false, 'disabled'::text, null::bigint, null::jsonb; return;
  end if;

  if exists (select 1 from public.free_tool_blocklist b where b.ip_hash = p_ip_hash and (b.until is null or b.until > now())) then
    return query select false, 'blocked'::text, null::bigint, null::jsonb; return;
  end if;

  -- serialise requests from the same IP so two parallel calls cannot both slip under a limit
  perform pg_advisory_xact_lock(hashtextextended('free_tool:' || p_ip_hash, 0));

  select count(*) into used_min from public.free_tool_usage u
   where u.ip_hash = p_ip_hash and u.tool = p_tool and u.created_at > now() - interval '1 minute';
  if used_min >= cfg.per_minute then
    return query select false, 'burst'::text, null::bigint, null::jsonb; return;
  end if;

  limit_day := case when p_user_id is null then cfg.anon_per_day else cfg.user_per_day end;
  if p_user_id is null then
    select count(*) into used_day from public.free_tool_usage u
     where u.ip_hash = p_ip_hash and u.tool = p_tool and u.created_at >= day_from and not u.refunded;
  else
    select count(*) into used_day from public.free_tool_usage u
     where u.user_id = p_user_id and u.tool = p_tool and u.created_at >= day_from and not u.refunded;
  end if;
  if used_day >= limit_day then
    -- repeated hammering past the limit earns a 24-hour block
    if used_min >= cfg.per_minute - 1 then
      insert into public.free_tool_blocklist (ip_hash, reason, until)
      values (p_ip_hash, 'auto: over daily limit', now() + interval '24 hours')
      on conflict (ip_hash) do update set until = greatest(coalesce(public.free_tool_blocklist.until, now()), excluded.until);
    end if;
    return query select false, 'daily_limit'::text, null::bigint, null::jsonb; return;
  end if;

  -- cache: free, but still logged and counted
  select c.result into hit from public.free_tool_cache c
   where c.tool = p_tool and c.key_hash = p_key_hash and c.created_at > now() - make_interval(days => cfg.cache_days);
  if hit is not null then
    insert into public.free_tool_usage (tool, ip_hash, user_id, cached, cost_micros)
    values (p_tool, p_ip_hash, p_user_id, true, 0) returning id into new_id;
    return query select true, 'cached'::text, new_id, hit; return;
  end if;

  -- spend caps: one lock for the budget so concurrent lookups cannot overspend
  perform pg_advisory_xact_lock(hashtextextended('free_tool_budget', 0));
  select coalesce(sum(b.spent_micros), 0) into spent from public.free_tool_budget b where b.day = today;
  select coalesce(max(b.lookups), 0) into paid from public.free_tool_budget b where b.day = today and b.tool = p_tool;
  if paid >= cfg.max_paid_per_day or spent + cfg.cost_micros > st.daily_cap_micros then
    return query select false, 'budget'::text, null::bigint, null::jsonb; return;
  end if;
  insert into public.free_tool_budget (day, tool, spent_micros, lookups) values (today, p_tool, cfg.cost_micros, 1)
  on conflict (day, tool) do update set spent_micros = public.free_tool_budget.spent_micros + excluded.spent_micros,
                                        lookups = public.free_tool_budget.lookups + 1;

  insert into public.free_tool_usage (tool, ip_hash, user_id, cached, cost_micros)
  values (p_tool, p_ip_hash, p_user_id, false, cfg.cost_micros) returning id into new_id;
  return query select true, 'ok'::text, new_id, null::jsonb;
end $$;

-- After a successful paid lookup: store the result for the cache.
create or replace function public.free_tool_store(p_tool text, p_key_hash text, p_result jsonb)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.free_tool_cache (tool, key_hash, result, created_at)
  values (p_tool, p_key_hash, p_result, now())
  on conflict (tool, key_hash) do update set result = excluded.result, created_at = excluded.created_at;
$$;

-- If the paid API fails: give the person their check back and return the money to the budget.
create or replace function public.free_tool_refund(p_usage_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare u public.free_tool_usage%rowtype;
begin
  update public.free_tool_usage set refunded = true
   where id = p_usage_id and not refunded
   returning * into u;
  if found and u.cost_micros > 0 then
    update public.free_tool_budget
       set spent_micros = greatest(0, spent_micros - u.cost_micros), lookups = greatest(0, lookups - 1)
     where day = (u.created_at at time zone 'Europe/London')::date and tool = u.tool;
  end if;
end $$;

-- Housekeeping (run nightly): usage kept 30 days, expired cache rows and old blocks removed.
create or replace function public.free_tool_cleanup()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.free_tool_usage where created_at < now() - interval '30 days';
  delete from public.free_tool_cache c using public.free_tool_config f
   where c.tool = f.tool and c.created_at < now() - make_interval(days => f.cache_days);
  delete from public.free_tool_blocklist where until is not null and until < now() - interval '7 days';
  delete from public.free_tool_budget where day < (now() at time zone 'Europe/London')::date - 90;
$$;

revoke all on function public.free_tool_consume(text, text, uuid, text) from public, anon, authenticated;
revoke all on function public.free_tool_store(text, text, jsonb)         from public, anon, authenticated;
revoke all on function public.free_tool_refund(bigint)                   from public, anon, authenticated;
revoke all on function public.free_tool_cleanup()                        from public, anon, authenticated;

select cron.schedule('decibel-free-tools-cleanup', '40 3 * * *', $$select public.free_tool_cleanup()$$);

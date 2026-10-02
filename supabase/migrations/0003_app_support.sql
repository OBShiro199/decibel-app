-- =============================================================================
-- Decibel — 0003_app_support.sql
-- Support objects the app and Edge Functions need on top of 0001/0002:
-- TPS cache, rate limits, Vault helpers for per-workspace Twilio secrets,
-- server-side dial check, invitation lookup, list helpers, call roll-ups,
-- and tighter grants. Safe to run more than once.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Tighten grants
-- ---------------------------------------------------------------------------
-- anon gets no table or view access (PRD section 8, Security). The masked view was
-- readable with only the publishable key before this.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;

revoke execute on function public.reveal_contact(uuid, uuid, uuid)        from public, anon;
revoke execute on function public.can_dial(uuid, uuid)                    from public, anon;
revoke execute on function public.create_workspace(text, text, text, text) from public, anon;
revoke execute on function public.accept_invitation(text)                 from public, anon;
revoke execute on function public.today_queue(uuid, integer)              from public, anon;
grant  execute on function public.reveal_contact(uuid, uuid, uuid)        to authenticated;
grant  execute on function public.can_dial(uuid, uuid)                    to authenticated, service_role;
grant  execute on function public.create_workspace(text, text, text, text) to authenticated;
grant  execute on function public.accept_invitation(text)                 to authenticated;
grant  execute on function public.today_queue(uuid, integer)              to authenticated;

-- Admins may edit workspace settings, but never billing or Twilio columns directly.
revoke insert, update on public.workspaces from authenticated;
grant update (name, slug, website, logo_url, team_size, recording_policy, recording_notice_text,
              onboarding_state, onboarding_completed_at)
  on public.workspaces to authenticated;

-- Members may not rewrite their own role or credit limit through profiles/members.
revoke insert on public.workspace_members from authenticated;

-- ---------------------------------------------------------------------------
-- 2. Extra columns
-- ---------------------------------------------------------------------------
alter table public.workspaces add column if not exists daily_reveal_limit integer not null default 300;
alter table public.workspaces add column if not exists twilio_account_mode text not null default 'pending'
  check (twilio_account_mode in ('pending', 'subaccount', 'parent'));
alter table public.workspaces add column if not exists art14_notice_text text not null default
  'We hold your business contact details under legitimate interest (UK GDPR Art. 6(1)(f)). You can object or ask for erasure at any time.';
grant update (art14_notice_text) on public.workspaces to authenticated;
alter table public.profiles add column if not exists mobile_e164 text;
alter table public.profiles add column if not exists notification_prefs jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- 3. TPS cache (V1: seeded dummy flags; V2: nightly TPS file sync)
-- ---------------------------------------------------------------------------
create table if not exists public.tps_cache (
  e164        text primary key,
  status      public.tps_status not null,
  checked_at  timestamptz not null default now()
);
alter table public.tps_cache enable row level security;   -- no policies: service role only
revoke all on public.tps_cache from anon, authenticated;

insert into public.tps_cache (e164, status) values
  ('+447700900106', 'tps_listed'),
  ('+447700900190', 'tps_listed'),
  ('+447700900191', 'ctps_listed'),
  ('+447700900192', 'tps_listed'),
  ('+447700900193', 'clear'),
  ('+447700900194', 'clear')
on conflict (e164) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Rate limits (twilio-token 60/min per user; reveals 300/day per workspace)
-- ---------------------------------------------------------------------------
create table if not exists public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  count         integer not null default 1,
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;  -- service role only
revoke all on public.rate_limits from anon, authenticated;

create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  w timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  c integer;
begin
  insert into public.rate_limits (key, window_start, count) values (p_key, w, 1)
  on conflict (key, window_start) do update set count = public.rate_limits.count + 1
  returning count into c;
  delete from public.rate_limits where window_start < now() - interval '2 days';
  return c <= p_limit;
end $$;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant  execute on function public.check_rate_limit(text, integer, integer) to service_role;

create or replace function public.enforce_reveal_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare lim integer; used integer;
begin
  if new.reason = 'reveal' then
    select daily_reveal_limit into lim from public.workspaces where id = new.workspace_id;
    select count(*) into used from public.credit_transactions
     where workspace_id = new.workspace_id and reason = 'reveal' and created_at >= date_trunc('day', now());
    if lim is not null and used >= lim then raise exception 'daily_reveal_limit'; end if;
  end if;
  return new;
end $$;
drop trigger if exists before_credit_transaction on public.credit_transactions;
create trigger before_credit_transaction before insert on public.credit_transactions
  for each row execute function public.enforce_reveal_limit();

-- ---------------------------------------------------------------------------
-- 5. Vault helpers: per-workspace Twilio secrets (service role only)
--    Secret JSON: { account_sid, auth_token, api_key_sid, api_key_secret }
-- ---------------------------------------------------------------------------
create or replace function public.set_workspace_twilio_secret(p_workspace_id uuid, p_secret jsonb)
returns uuid language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  select twilio_secret_vault_id into sid from public.workspaces where id = p_workspace_id;
  if sid is null then
    sid := vault.create_secret(p_secret::text, 'twilio_ws_' || p_workspace_id::text, 'Decibel workspace Twilio credentials');
    update public.workspaces set twilio_secret_vault_id = sid where id = p_workspace_id;
  else
    perform vault.update_secret(sid, p_secret::text);
  end if;
  return sid;
end $$;

create or replace function public.get_workspace_twilio_secret(p_workspace_id uuid)
returns jsonb language sql stable security definer set search_path = public, vault as $$
  select s.decrypted_secret::jsonb
    from public.workspaces w
    join vault.decrypted_secrets s on s.id = w.twilio_secret_vault_id
   where w.id = p_workspace_id
$$;

revoke execute on function public.set_workspace_twilio_secret(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.get_workspace_twilio_secret(uuid)        from public, anon, authenticated;
grant  execute on function public.set_workspace_twilio_secret(uuid, jsonb) to service_role;
grant  execute on function public.get_workspace_twilio_secret(uuid)        to service_role;

-- ---------------------------------------------------------------------------
-- 6. Server-side dial check. can_dial() relies on auth.uid(), which is null for
--    the service role inside twilio-voice, so the webhook uses this variant.
-- ---------------------------------------------------------------------------
create or replace function public.can_dial_for(p_workspace_id uuid, p_person_id uuid, p_user_id uuid)
returns table (allowed boolean, reason text) language plpgsql security definer set search_path = public as $$
declare p public.people; ws public.workspaces;
begin
  if not exists (select 1 from public.workspace_members m where m.workspace_id = p_workspace_id and m.user_id = p_user_id)
                                        then return query select false, 'forbidden'; return; end if;
  select * into p  from public.people     where id = p_person_id and workspace_id = p_workspace_id;
  select * into ws from public.workspaces where id = p_workspace_id;
  if p.id is null                       then return query select false, 'person_not_found'; return; end if;
  if p.mobile_e164 is null              then return query select false, 'no_mobile'; return; end if;
  if p.do_not_call                      then return query select false, 'do_not_call'; return; end if;
  if p.tps_status in ('tps_listed','ctps_listed') then return query select false, 'tps_listed'; return; end if;
  if exists (select 1 from public.dnc_entries d where d.workspace_id = p_workspace_id and d.e164 = p.mobile_e164)
                                        then return query select false, 'dnc_list'; return; end if;
  if ws.plan = 'trial' and ws.trial_ends_at < now() then return query select false, 'trial_expired'; return; end if;
  if ws.minute_balance_seconds <= 0 and ws.stripe_customer_id is null
                                        then return query select false, 'no_minutes'; return; end if;
  return query select true, null::text;
end $$;
revoke execute on function public.can_dial_for(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.can_dial_for(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Invitation lookup for the /invite/:token page (invitee is not a member yet)
-- ---------------------------------------------------------------------------
create or replace function public.get_invitation(p_token text)
returns table (workspace_name text, inviter_name text, email text, role public.workspace_role,
               status public.invitation_status, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select w.name, coalesce(nullif(p.full_name, ''), p.email::text), i.email::text, i.role,
         case when i.status = 'pending' and i.expires_at < now() then 'expired'::public.invitation_status else i.status end,
         i.expires_at
    from public.invitations i
    join public.workspaces w on w.id = i.workspace_id
    join public.profiles p   on p.id = i.invited_by
   where i.token = p_token
$$;
grant execute on function public.get_invitation(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. List helpers
-- ---------------------------------------------------------------------------
-- Start calling: puts a list's unowned people at the top of the caller's Today queue.
create or replace function public.start_calling_list(p_list_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare l public.lists; n integer;
begin
  select * into l from public.lists where id = p_list_id;
  if l.id is null or not public.is_member(l.workspace_id) then raise exception 'forbidden'; end if;
  update public.people p
     set owner_id = coalesce(p.owner_id, auth.uid()), priority = greatest(p.priority, 1)
    from public.list_members lm
   where lm.list_id = p_list_id and lm.person_id = p.id and (p.owner_id is null or p.owner_id = auth.uid());
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.start_calling_list(uuid) from public, anon;
grant  execute on function public.start_calling_list(uuid) to authenticated;

-- Assign to: distributes a list's people round-robin across the selected members.
create or replace function public.assign_list(p_list_id uuid, p_user_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare l public.lists; n integer; k integer := coalesce(array_length(p_user_ids, 1), 0);
begin
  select * into l from public.lists where id = p_list_id;
  if l.id is null or not public.has_role(l.workspace_id, 'admin') then raise exception 'forbidden'; end if;
  if k = 0 then return 0; end if;
  if exists (select 1 from unnest(p_user_ids) u
              where not exists (select 1 from public.workspace_members m where m.workspace_id = l.workspace_id and m.user_id = u))
  then raise exception 'not_a_member'; end if;

  with ordered as (
    select lm.person_id, row_number() over (order by lm.position, lm.added_at) as rn
      from public.list_members lm where lm.list_id = p_list_id
  )
  update public.people p
     set owner_id = p_user_ids[((o.rn - 1) % k) + 1]
    from ordered o where o.person_id = p.id;
  get diagnostics n = row_count;

  insert into public.activities (workspace_id, person_id, actor_id, kind, payload)
  select l.workspace_id, lm.person_id, auth.uid(), 'assigned', jsonb_build_object('list_id', p_list_id)
    from public.list_members lm where lm.list_id = p_list_id;
  return n;
end $$;
revoke execute on function public.assign_list(uuid, uuid[]) from public, anon;
grant  execute on function public.assign_list(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. Call roll-ups: outcome moves the pipeline stage; completed calls burn minutes
-- ---------------------------------------------------------------------------
create or replace function public.call_outcome_to_stage()
returns trigger language plpgsql security definer set search_path = public as $$
declare target_name text; target public.pipeline_stages; cur public.pipeline_stages; force boolean := false;
begin
  if new.person_id is null or new.outcome is null or new.outcome is not distinct from old.outcome then return new; end if;
  target_name := case new.outcome
    when 'meeting_booked' then 'Meeting booked'
    when 'connected'      then 'Connected'
    when 'no_answer'      then 'Attempted'
    when 'voicemail'      then 'Attempted'
    when 'busy'           then 'Attempted'
    when 'call_back'      then 'Attempted'
    when 'not_interested' then 'Not interested'
    when 'wrong_number'   then 'Wrong number'
    when 'do_not_call'    then 'Not interested'
    else null end;
  if target_name is null then return new; end if;
  force := new.outcome in ('not_interested', 'wrong_number', 'do_not_call');

  select * into target from public.pipeline_stages where workspace_id = new.workspace_id and name = target_name;
  if target.id is null then return new; end if;
  select s.* into cur from public.people p left join public.pipeline_stages s on s.id = p.stage_id where p.id = new.person_id;

  if force or cur.id is null or (cur.position < target.position and not cur.is_won and not cur.is_lost) then
    update public.people set stage_id = target.id where id = new.person_id and stage_id is distinct from target.id;
  end if;
  return new;
end $$;
drop trigger if exists on_call_outcome_stage on public.calls;
create trigger on_call_outcome_stage after update of outcome on public.calls
  for each row execute function public.call_outcome_to_stage();

create or replace function public.call_burn_minutes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'completed' and old.status is distinct from 'completed'
     and new.direction = 'outbound' and new.duration_seconds > 0 then
    update public.workspaces set minute_balance_seconds = minute_balance_seconds - new.duration_seconds
     where id = new.workspace_id;
  end if;
  return new;
end $$;
drop trigger if exists on_call_completed_minutes on public.calls;
create trigger on_call_completed_minutes after update of status on public.calls
  for each row execute function public.call_burn_minutes();

-- ---------------------------------------------------------------------------
-- 10. Usage reporting bookkeeping for stripe-usage (nightly metered minutes)
-- ---------------------------------------------------------------------------
create table if not exists public.usage_reports (
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  day            date not null,
  seconds        integer not null,
  reported_at    timestamptz not null default now(),
  primary key (workspace_id, day)
);
alter table public.usage_reports enable row level security;
revoke all on public.usage_reports from anon, authenticated;
grant select on public.usage_reports to authenticated;
drop policy if exists usage_reports_select on public.usage_reports;
create policy usage_reports_select on public.usage_reports for select to authenticated
  using (public.is_member(workspace_id));

-- ---------------------------------------------------------------------------
-- 11. Storage: allow users to replace their own avatar
-- ---------------------------------------------------------------------------
drop policy if exists avatars_update on storage.objects;
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

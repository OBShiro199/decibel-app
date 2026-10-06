-- 0010: a credit system that cannot be gamed or edited.
--
-- Guarantees, each enforced by the database itself (not by app code):
--   1. Credits move only through public.credit_transactions, an append-only ledger. Rows can
--      never be updated, deleted or truncated (only a workspace's own deletion removes its rows).
--   2. workspaces.credit_balance can only change as a side effect of a ledger insert, so the
--      balance always equals the sum of the ledger, for every role including service_role.
--   3. Browsers cannot insert into the ledger, edit a balance or edit the welcome-grant flag.
--   4. Revealing a contact is atomic: the paid data, the charge and the audit row commit together
--      or not at all, one reveal at a time per workspace, 1 credit per newly revealed contact,
--      nothing for one already revealed. Bulk reveals (adding leads to a list) are all-or-nothing.
--   5. Database contacts reach a workspace only through a reveal (people.source_contact_id can't
--      be set from the browser), so data can't be obtained without paying.
--   6. Welcome credits (5,000) are granted once per account, not per workspace, so creating more
--      workspaces or deleting and recreating one can't mint credits.

-- ---------------------------------------------------------------------------
-- 1. Welcome grant: once per account
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists trial_credits_granted_at timestamptz;

-- Browsers may edit only these profile columns. Everything else (email, the grant flag) is
-- written by the system. Column grants replace the old table-wide update grant.
revoke update on public.profiles from authenticated, anon;
grant update (full_name, avatar_url, last_workspace_id, timezone, mobile_e164, notification_prefs)
  on public.profiles to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The ledger is append-only
-- ---------------------------------------------------------------------------
revoke insert, update, delete, truncate on public.credit_transactions from authenticated, anon;

create or replace function public.credit_ledger_immutable()
returns trigger language plpgsql as $$
begin
  -- a workspace being deleted takes its own ledger with it (cascade); nothing else may remove rows
  if tg_op = 'DELETE' and not exists (select 1 from public.workspaces where id = old.workspace_id) then
    return old;
  end if;
  raise exception 'credit_transactions is append-only: % is not allowed', tg_op using errcode = '42501';
end $$;

create or replace function public.credit_ledger_no_truncate()
returns trigger language plpgsql as $$
begin
  raise exception 'credit_transactions is append-only: TRUNCATE is not allowed' using errcode = '42501';
end $$;

drop trigger if exists credit_ledger_no_change on public.credit_transactions;
create trigger credit_ledger_no_change before update or delete on public.credit_transactions
  for each row execute function public.credit_ledger_immutable();
drop trigger if exists credit_ledger_no_truncate on public.credit_transactions;
create trigger credit_ledger_no_truncate before truncate on public.credit_transactions
  for each statement execute function public.credit_ledger_no_truncate();

-- ---------------------------------------------------------------------------
-- 3. The balance changes only through the ledger
-- ---------------------------------------------------------------------------
create or replace function public.apply_credit_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('decibel.ledger_write', 'on', true);
  update public.workspaces set credit_balance = credit_balance + new.delta where id = new.workspace_id;
  perform set_config('decibel.ledger_write', 'off', true);
  return new;
end $$;

create or replace function public.guard_credit_balance()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' and new.credit_balance <> 0 then
    raise exception 'a workspace starts with no credits; grant them through credit_transactions' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and new.credit_balance is distinct from old.credit_balance
     and coalesce(current_setting('decibel.ledger_write', true), 'off') <> 'on' then
    raise exception 'credit_balance changes only through credit_transactions' using errcode = '42501';
  end if;
  return new;
end $$;

drop trigger if exists workspaces_guard_credit_balance on public.workspaces;
create trigger workspaces_guard_credit_balance before insert or update of credit_balance on public.workspaces
  for each row execute function public.guard_credit_balance();

-- ---------------------------------------------------------------------------
-- 4. Database contacts only arrive through a reveal
-- ---------------------------------------------------------------------------
create or replace function public.people_before_write()
returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('decibel.reveal', true), 'off') <> 'on' and coalesce(auth.role(), '') <> 'service_role' then
    if (tg_op = 'INSERT' and new.source_contact_id is not null)
       or (tg_op = 'UPDATE' and new.source_contact_id is not null and new.source_contact_id is distinct from old.source_contact_id) then
      raise exception 'database contacts are added by revealing them' using errcode = '42501';
    end if;
  end if;
  new.mobile_e164      := public.normalize_phone(new.mobile_e164);
  new.direct_dial_e164 := public.normalize_phone(new.direct_dial_e164);
  if new.mobile_e164 is not null and exists (
       select 1 from public.dnc_entries d where d.workspace_id = new.workspace_id and d.e164 = new.mobile_e164)
  then new.do_not_call := true; end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Revealing: one worker, one gate, two entry points
-- ---------------------------------------------------------------------------
-- Allowance gate. Callers hold the workspace row lock, so the balance and the day's counts
-- cannot change between this check and the charge.
create or replace function public.check_reveal_allowance(p_workspace_id uuid, p_user_id uuid, p_cost integer)
returns void language plpgsql security definer set search_path = public as $$
declare bal integer; ws_lim integer; lim integer; used integer;
begin
  select credit_balance, daily_reveal_limit into bal, ws_lim from public.workspaces where id = p_workspace_id;
  if bal < p_cost then raise exception 'insufficient_credits: this needs %, you have %', p_cost, bal; end if;

  select daily_credit_limit into lim from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  if lim is not null then
    select count(*) into used from public.credit_transactions
     where workspace_id = p_workspace_id and user_id = p_user_id and reason = 'reveal' and created_at >= date_trunc('day', now());
    if used + p_cost > lim then raise exception 'daily_limit_reached: % left today', greatest(lim - used, 0); end if;
  end if;

  if ws_lim is not null then
    select count(*) into used from public.credit_transactions
     where workspace_id = p_workspace_id and reason = 'reveal' and created_at >= date_trunc('day', now());
    if used + p_cost > ws_lim then raise exception 'daily_reveal_limit: % left today', greatest(ws_lim - used, 0); end if;
  end if;
end $$;

-- The worker: reveals one contact (free if already revealed), optionally files it in a list.
create or replace function public.reveal_one(p_workspace_id uuid, p_contact_id uuid, p_list_id uuid, p_user_id uuid)
returns public.people language plpgsql security definer set search_path = public as $$
declare c public.contacts; p public.people; tc uuid;
begin
  select * into p from public.people where workspace_id = p_workspace_id and source_contact_id = p_contact_id;
  if not found then
    select * into c from public.contacts where id = p_contact_id;
    if not found then raise exception 'contact not found'; end if;

    if c.company_id is not null then
      insert into public.tenant_companies (workspace_id, source_company_id, name, domain, industry, size_band, country_code, city, linkedin_url)
      select p_workspace_id, co.id, co.name, co.domain, i.name, co.size_band, co.country_code, co.city, co.linkedin_url
        from public.companies co left join public.industries i on i.id = co.industry_id where co.id = c.company_id
      on conflict (workspace_id, source_company_id) do update set name = excluded.name
      returning id into tc;
    end if;

    perform set_config('decibel.reveal', 'on', true);
    insert into public.people (workspace_id, source_contact_id, tenant_company_id, first_name, last_name, job_title, seniority,
                               email, mobile_e164, direct_dial_e164, linkedin_url, country_code, city, tps_status, tps_checked_at,
                               source, created_by, stage_id)
    values (p_workspace_id, c.id, tc, c.first_name, c.last_name, c.job_title, c.seniority,
            c.email, c.mobile_e164, c.direct_dial_e164, c.linkedin_url, c.country_code, c.city, c.tps_status, c.tps_checked_at,
            'database', p_user_id,
            (select id from public.pipeline_stages where workspace_id = p_workspace_id and position = 1))
    returning * into p;
    perform set_config('decibel.reveal', 'off', true);

    -- the charge, in the same transaction as the data it pays for
    -- (no names here: the ledger is permanent, so it holds ids only and stays erasure-safe)
    insert into public.credit_transactions (workspace_id, user_id, delta, reason, reference_id)
    values (p_workspace_id, p_user_id, -1, 'reveal', c.id);

    insert into public.activities (workspace_id, person_id, actor_id, kind, payload)
    values (p_workspace_id, p.id, p_user_id, 'revealed', jsonb_build_object('contact_id', c.id));
  end if;

  if p_list_id is not null then
    insert into public.list_members (list_id, person_id, workspace_id, added_by)
    values (p_list_id, p.id, p_workspace_id, p_user_id) on conflict do nothing;
  end if;
  return p;
end $$;

revoke execute on function public.check_reveal_allowance(uuid, uuid, integer) from public, anon, authenticated;
revoke execute on function public.reveal_one(uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- One contact: 1 credit, free if this workspace already revealed it.
create or replace function public.reveal_contact(p_workspace_id uuid, p_contact_id uuid, p_list_id uuid default null)
returns public.people language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  -- one reveal at a time per workspace: no race can double-spend or double-charge
  perform 1 from public.workspaces where id = p_workspace_id for update;
  if p_list_id is not null and not exists (select 1 from public.lists where id = p_list_id and workspace_id = p_workspace_id) then
    raise exception 'list not found';
  end if;
  if not exists (select 1 from public.people where workspace_id = p_workspace_id and source_contact_id = p_contact_id) then
    perform public.check_reveal_allowance(p_workspace_id, auth.uid(), 1);
  end if;
  return public.reveal_one(p_workspace_id, p_contact_id, p_list_id, auth.uid());
end $$;

-- Many contacts (adding leads to a list): 1 credit per newly revealed contact, all or nothing.
create or replace function public.reveal_contacts(p_workspace_id uuid, p_contact_ids uuid[], p_list_id uuid default null)
returns setof public.people language plpgsql security definer set search_path = public as $$
declare ids uuid[]; cost integer; known integer; cid uuid; p public.people;
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  if coalesce(cardinality(p_contact_ids), 0) = 0 then return; end if;
  if cardinality(p_contact_ids) > 500 then raise exception 'too_many: reveal at most 500 contacts at a time'; end if;

  perform 1 from public.workspaces where id = p_workspace_id for update;
  if p_list_id is not null and not exists (select 1 from public.lists where id = p_list_id and workspace_id = p_workspace_id) then
    raise exception 'list not found';
  end if;

  -- de-duplicated, in the order given
  select array_agg(x order by o) into ids
    from (select distinct on (x) x, o from unnest(p_contact_ids) with ordinality as t(x, o) order by x, o) d;

  select count(*) into known from public.contacts where id = any(ids);
  if known <> cardinality(ids) then raise exception 'contact not found'; end if;

  select count(*) into cost from unnest(ids) as x
   where not exists (select 1 from public.people where workspace_id = p_workspace_id and source_contact_id = x);
  if cost > 0 then perform public.check_reveal_allowance(p_workspace_id, auth.uid(), cost); end if;

  foreach cid in array ids loop
    p := public.reveal_one(p_workspace_id, cid, p_list_id, auth.uid());
    return next p;
  end loop;
end $$;

revoke execute on function public.reveal_contacts(uuid, uuid[], uuid) from public, anon;
grant  execute on function public.reveal_contacts(uuid, uuid[], uuid) to authenticated;
revoke execute on function public.reveal_contact(uuid, uuid, uuid) from public, anon;
grant  execute on function public.reveal_contact(uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. 5,000 welcome credits, once per account
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');

  insert into public.pipeline_stages (workspace_id, name, position, is_won, is_lost) values
    (new.id, 'New',            1, false, false),
    (new.id, 'Attempted',      2, false, false),
    (new.id, 'Connected',      3, false, false),
    (new.id, 'Meeting booked', 4, false, false),
    (new.id, 'Qualified',      5, false, false),
    (new.id, 'Won',            6, true,  false),
    (new.id, 'Lost',           7, false, true),
    (new.id, 'Not interested', 8, false, true),
    (new.id, 'Wrong number',   9, false, true);

  -- Welcome credits go to the account, once. The flag lives on the profile (which outlives any
  -- workspace) and is claimed by a single UPDATE, so concurrent or repeated workspace creation
  -- cannot grant twice.
  with claimed as (
    update public.profiles set trial_credits_granted_at = now()
     where id = new.created_by and trial_credits_granted_at is null
    returning id
  )
  insert into public.credit_transactions (workspace_id, user_id, delta, reason, note)
  select new.id, new.created_by, 5000, 'trial_grant', 'Welcome credits' from claimed;

  update public.workspaces set minute_balance_seconds = 60 * 60 where id = new.id;

  insert into public.business_profiles (workspace_id) values (new.id);

  update public.profiles set last_workspace_id = new.id where id = new.created_by;
  return new;
end $$;

-- Existing accounts: raise the welcome credits from 50 to 5,000, once, as ledger entries
-- (one workspace per account), and mark every existing creator as already granted.
insert into public.credit_transactions (workspace_id, user_id, delta, reason, note)
select w.id, w.created_by, 5000 - g.granted, 'trial_grant', 'Welcome credits raised to 5,000'
  from (select distinct on (created_by) id, created_by from public.workspaces order by created_by, created_at) w
  join lateral (select coalesce(sum(delta), 0)::integer as granted from public.credit_transactions t where t.workspace_id = w.id and t.reason = 'trial_grant') g on true
  join public.profiles pr on pr.id = w.created_by
 where pr.trial_credits_granted_at is null and g.granted < 5000;

update public.profiles set trial_credits_granted_at = now()
 where trial_credits_granted_at is null and id in (select created_by from public.workspaces);

-- ---------------------------------------------------------------------------
-- 7. Daily reveal allowance: 5,000 credits must be usable
-- ---------------------------------------------------------------------------
alter table public.workspaces alter column daily_reveal_limit set default 1000;
update public.workspaces set daily_reveal_limit = 1000 where daily_reveal_limit = 300;

-- ---------------------------------------------------------------------------
-- 8. Reconciliation: any workspace whose balance differs from its ledger (should return nothing)
-- ---------------------------------------------------------------------------
create or replace function public.credit_ledger_check()
returns table (workspace_id uuid, balance integer, ledger integer)
language sql stable security definer set search_path = public as $$
  select w.id, w.credit_balance, coalesce(sum(t.delta), 0)::integer
    from public.workspaces w left join public.credit_transactions t on t.workspace_id = w.id
   group by w.id, w.credit_balance
  having w.credit_balance <> coalesce(sum(t.delta), 0)
$$;
revoke execute on function public.credit_ledger_check() from public, anon, authenticated;
grant  execute on function public.credit_ledger_check() to service_role;

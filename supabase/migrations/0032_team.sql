-- 0032: teams. Invites are created on the server, accepting never changes an existing member's
-- role, removing a member hands their leads and numbers back, ownership can be transferred, and
-- calls and recordings are visible to owners and admins and to the rep who made the call (members
-- still see team totals through team_stats). Numbers stay admin-assigned; nothing here buys one.

-- ---------------------------------------------------------------------------
-- 1. Invites
-- ---------------------------------------------------------------------------
-- creates (or renews) invitations; returns one row per email with what happened and, for new or
-- renewed invites, the token the invite email links to
create or replace function public.invite_members(p_workspace_id uuid, p_emails text[], p_role public.workspace_role default 'member')
returns table (email text, status text, invitation_id uuid, token text)
language plpgsql security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  e text;
  sent_today integer;
begin
  if auth.uid() is null or not public.has_role(p_workspace_id, 'admin') then raise exception 'forbidden'; end if;
  if p_role = 'owner' then raise exception 'cannot_invite_owner'; end if;
  if cardinality(p_emails) > 50 then raise exception 'too_many_emails'; end if;
  select count(*) into sent_today from public.invitations i
   where i.workspace_id = p_workspace_id and i.created_at > now() - interval '1 day';
  if sent_today + cardinality(p_emails) > 200 then raise exception 'slow_down'; end if;

  foreach e in array p_emails loop
    e := lower(btrim(e));
    if e = '' then continue; end if;
    if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      email := e; status := 'invalid'; invitation_id := null; token := null; return next; continue;
    end if;
    if exists (select 1 from public.workspace_members m join public.profiles p on p.id = m.user_id
                where m.workspace_id = p_workspace_id and lower(p.email) = e) then
      email := e; status := 'already_member'; invitation_id := null; token := null; return next; continue;
    end if;
    insert into public.invitations as i (workspace_id, email, role, invited_by)
    values (p_workspace_id, e, p_role, auth.uid())
    on conflict (workspace_id, email) do update
      set status = 'pending', role = excluded.role, invited_by = excluded.invited_by,
          token = encode(extensions.gen_random_bytes(24), 'hex'), expires_at = now() + interval '7 days', created_at = now(), accepted_at = null
    returning i.email::text, 'invited', i.id, i.token into email, status, invitation_id, token;
    return next;
  end loop;
end $$;
revoke execute on function public.invite_members(uuid, text[], public.workspace_role) from public, anon;
grant  execute on function public.invite_members(uuid, text[], public.workspace_role) to authenticated;

-- a new token for one pending invite (resend), admins only
create or replace function public.renew_invitation(p_invitation_id uuid)
returns table (email text, token text)
language plpgsql security definer
set search_path = public
as $$
#variable_conflict use_column
declare inv public.invitations;
begin
  select * into inv from public.invitations where id = p_invitation_id;
  if inv.id is null or not public.has_role(inv.workspace_id, 'admin') then raise exception 'forbidden'; end if;
  if inv.status = 'accepted' then raise exception 'already_accepted'; end if;
  update public.invitations
     set status = 'pending', token = encode(extensions.gen_random_bytes(24), 'hex'), expires_at = now() + interval '7 days', invited_by = auth.uid()
   where id = inv.id
  returning invitations.email::text, invitations.token into email, token;
  return next;
end $$;
revoke execute on function public.renew_invitation(uuid) from public, anon;
grant  execute on function public.renew_invitation(uuid) to authenticated;

-- accepting: joins with the invited role; someone already in the workspace keeps their role
create or replace function public.accept_invitation_as(p_token text, p_user_id uuid)
returns public.workspaces
language plpgsql security definer
set search_path = public
as $$
declare inv public.invitations; ws public.workspaces; me public.profiles;
begin
  select * into me from public.profiles where id = p_user_id;
  select * into inv from public.invitations where token = p_token for update;
  if not found or me.id is null or inv.status <> 'pending' or inv.expires_at < now() then raise exception 'invalid_invitation'; end if;
  if lower(inv.email) <> lower(me.email) then raise exception 'email_mismatch'; end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (inv.workspace_id, me.id, inv.role)
  on conflict (workspace_id, user_id) do nothing;
  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  update public.profiles set last_workspace_id = inv.workspace_id where id = me.id;
  select * into ws from public.workspaces where id = inv.workspace_id;
  return ws;
end $$;
revoke execute on function public.accept_invitation_as(text, uuid) from public, anon, authenticated;
grant  execute on function public.accept_invitation_as(text, uuid) to service_role;

create or replace function public.accept_invitation(p_token text)
returns public.workspaces
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'invalid_invitation'; end if;
  return public.accept_invitation_as(p_token, auth.uid());
end $$;
revoke execute on function public.accept_invitation(text) from public, anon;
grant  execute on function public.accept_invitation(text) to authenticated;

-- the invite page also shows whether an account already exists for the invited email (so it can
-- offer "set a password" or "log in"), and the number the invitee will be given, if any
drop function if exists public.get_invitation(text);
create function public.get_invitation(p_token text)
returns table (workspace_name text, inviter_name text, email text, role public.workspace_role, status public.invitation_status,
               expires_at timestamptz, has_account boolean)
language sql stable security definer
set search_path = public
as $$
  select w.name, coalesce(nullif(p.full_name, ''), p.email::text), i.email::text, i.role,
         case when i.status = 'pending' and i.expires_at < now() then 'expired'::public.invitation_status else i.status end,
         i.expires_at,
         exists (select 1 from public.profiles x where lower(x.email) = lower(i.email))
    from public.invitations i
    join public.workspaces w on w.id = i.workspace_id
    join public.profiles p   on p.id = i.invited_by
   where i.token = p_token and length(p_token) >= 32
$$;
revoke execute on function public.get_invitation(text) from public;
grant  execute on function public.get_invitation(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Removing members and transferring ownership
-- ---------------------------------------------------------------------------
-- removes a member: their leads go to p_reassign_to (or nobody), their numbers are unassigned and
-- returned so the caller can release them at Twilio if wanted
create or replace function public.remove_member(p_workspace_id uuid, p_user_id uuid, p_reassign_to uuid default null)
returns jsonb
language plpgsql security definer
set search_path = public
as $$
declare
  target public.workspace_members;
  moved integer;
  numbers jsonb;
begin
  if auth.uid() is null or not public.has_role(p_workspace_id, 'admin') then raise exception 'forbidden'; end if;
  select * into target from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  if target.user_id is null then raise exception 'not_a_member'; end if;
  if target.role = 'owner' then raise exception 'cannot_remove_owner'; end if;
  if p_user_id = auth.uid() then raise exception 'use_leave'; end if;
  if p_reassign_to is not null and not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_reassign_to)
  then raise exception 'reassign_not_member'; end if;

  update public.people set owner_id = p_reassign_to where workspace_id = p_workspace_id and owner_id = p_user_id;
  get diagnostics moved = row_count;
  with un as (
    update public.phone_numbers set assigned_user_id = null, updated_at = now()
     where workspace_id = p_workspace_id and assigned_user_id = p_user_id and status <> 'released'
    returning id, e164, kind
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'e164', e164, 'kind', kind)), '[]') into numbers from un;
  delete from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id;
  update public.profiles set last_workspace_id = null where id = p_user_id and last_workspace_id = p_workspace_id;
  return jsonb_build_object('leads_moved', moved, 'numbers', numbers);
end $$;
revoke execute on function public.remove_member(uuid, uuid, uuid) from public, anon;
grant  execute on function public.remove_member(uuid, uuid, uuid) to authenticated;

create or replace function public.transfer_ownership(p_workspace_id uuid, p_new_owner uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = auth.uid() and role = 'owner')
  then raise exception 'owners_only'; end if;
  if p_new_owner = auth.uid() then return; end if;
  if not exists (select 1 from public.workspace_members where workspace_id = p_workspace_id and user_id = p_new_owner)
  then raise exception 'not_a_member'; end if;
  update public.workspace_members set role = 'owner' where workspace_id = p_workspace_id and user_id = p_new_owner;
  update public.workspace_members set role = 'admin' where workspace_id = p_workspace_id and user_id = auth.uid();
end $$;
revoke execute on function public.transfer_ownership(uuid, uuid) from public, anon;
grant  execute on function public.transfer_ownership(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Calls and recordings: owners and admins see all, reps see their own
-- ---------------------------------------------------------------------------
drop policy if exists calls_select on public.calls;
create policy calls_select on public.calls for select to authenticated
  using (workspace_id in (select public.my_workspace_ids()) and (user_id = (select auth.uid()) or public.has_role(workspace_id, 'admin')));
drop policy if exists calls_update on public.calls;
create policy calls_update on public.calls for update to authenticated
  using (workspace_id in (select public.my_workspace_ids()) and (user_id = (select auth.uid()) or public.has_role(workspace_id, 'admin')))
  with check (workspace_id in (select public.my_workspace_ids()));
drop policy if exists calls_delete on public.calls;
create policy calls_delete on public.calls for delete to authenticated
  using (public.has_role(workspace_id, 'admin'));

drop policy if exists recordings_select on public.recordings;
create policy recordings_select on public.recordings for select to authenticated
  using (workspace_id in (select public.my_workspace_ids())
         and (public.has_role(workspace_id, 'admin')
              or exists (select 1 from public.calls c where c.id = recordings.call_id and c.user_id = (select auth.uid()))));

drop policy if exists recordings_read on storage.objects;
create policy recordings_read on storage.objects for select to authenticated
  using (bucket_id = 'recordings'
         and public.is_member(((storage.foldername(name))[1])::uuid)
         and (public.has_role(((storage.foldername(name))[1])::uuid, 'admin')
              or exists (select 1 from public.calls c
                          where c.workspace_id = ((storage.foldername(name))[1])::uuid
                            and c.id::text = split_part(storage.filename(name), '.', 1)
                            and c.user_id = (select auth.uid()))));

-- ---------------------------------------------------------------------------
-- 4. Team analytics: one row per member for a period. Every member sees the totals (the
--    leaderboard); calls and recordings themselves stay admin-or-own through RLS.
-- ---------------------------------------------------------------------------
create or replace function public.team_stats(p_workspace_id uuid, p_from timestamptz, p_to timestamptz)
returns table (user_id uuid, full_name text, email text, avatar_url text, role public.workspace_role, joined_at timestamptz,
               last_seen_at timestamptz, dials integer, connects integer, meetings integer, talk_seconds integer,
               outcomes jsonb, recordings integer, last_call_at timestamptz, numbers jsonb)
language sql stable security definer
set search_path = public
as $$
  with me as (select public.is_member(p_workspace_id) as ok),
  c as (
    select c.user_id,
           count(*) filter (where c.direction = 'outbound' and c.kind = 'standard' and c.status <> 'blocked') as dials,
           count(*) filter (where c.talk_seconds > 0) as connects,
           count(*) filter (where c.outcome = 'meeting_booked') as meetings,
           coalesce(sum(c.talk_seconds), 0) as talk_seconds,
           max(c.started_at) as last_call_at
      from public.calls c
     where c.workspace_id = p_workspace_id and c.started_at >= p_from and c.started_at < p_to
     group by c.user_id
  ),
  o as (
    select x.user_id, jsonb_object_agg(x.outcome, x.n) as outcomes
      from (select c.user_id, c.outcome::text as outcome, count(*) as n
              from public.calls c
             where c.workspace_id = p_workspace_id and c.started_at >= p_from and c.started_at < p_to and c.outcome is not null
             group by 1, 2) x
     group by x.user_id
  ),
  r as (
    select c.user_id, count(*) as n
      from public.recordings rec join public.calls c on c.id = rec.call_id
     where rec.workspace_id = p_workspace_id and c.started_at >= p_from and c.started_at < p_to
     group by c.user_id
  ),
  n as (
    select pn.assigned_user_id as user_id,
           jsonb_agg(jsonb_build_object('id', pn.id, 'e164', pn.e164, 'kind', pn.kind, 'is_default', pn.is_default) order by pn.e164) as numbers
      from public.phone_numbers pn
     where pn.workspace_id = p_workspace_id and pn.status = 'active' and pn.assigned_user_id is not null
     group by 1
  )
  select m.user_id, p.full_name, p.email::text, p.avatar_url, m.role, m.joined_at, p.last_seen_at,
         coalesce(c.dials, 0)::integer, coalesce(c.connects, 0)::integer, coalesce(c.meetings, 0)::integer, coalesce(c.talk_seconds, 0)::integer,
         coalesce(o.outcomes, '{}'), coalesce(r.n, 0)::integer, c.last_call_at, coalesce(n.numbers, '[]')
    from public.workspace_members m
    join public.profiles p on p.id = m.user_id
    left join c on c.user_id = m.user_id
    left join o on o.user_id = m.user_id
    left join r on r.user_id = m.user_id
    left join n on n.user_id = m.user_id
   where m.workspace_id = p_workspace_id and (select ok from me)
   order by coalesce(c.dials, 0) desc, p.full_name
$$;
revoke execute on function public.team_stats(uuid, timestamptz, timestamptz) from public, anon;
grant  execute on function public.team_stats(uuid, timestamptz, timestamptz) to authenticated;

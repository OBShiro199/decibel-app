-- =============================================================================
-- Decibels — 0005_audit_log.sql
-- Writes to public.audit_log. Triggers cover reveals, member and invitation
-- changes, phone numbers and DNC edits, so nothing depends on the client
-- remembering to log. Exports happen in the browser, so they call log_audit().
-- =============================================================================

create or replace function public.write_audit(
  p_workspace_id uuid, p_actor uuid, p_action text, p_table text, p_target text, p_payload jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (workspace_id, actor_id, action, target_table, target_id, payload)
  values (p_workspace_id, coalesce(auth.uid(), p_actor), p_action, p_table, p_target, coalesce(p_payload, '{}'::jsonb));
$$;
revoke execute on function public.write_audit(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;

-- Called from the app for actions that happen client-side (CSV exports).
create or replace function public.log_audit(p_workspace_id uuid, p_action text, p_payload jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  if p_action !~ '^export\.[a-z_]+$' then raise exception 'invalid_action'; end if;
  perform public.write_audit(p_workspace_id, auth.uid(), p_action, null, null, p_payload);
end $$;
revoke execute on function public.log_audit(uuid, text, jsonb) from public, anon;
grant  execute on function public.log_audit(uuid, text, jsonb) to authenticated;

-- reveals (one credit each)
create or replace function public.audit_credit_tx() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.reason = 'reveal' then
    perform public.write_audit(new.workspace_id, new.user_id, 'contact.revealed', 'contacts', new.reference_id::text, jsonb_build_object('credits', -new.delta));
  elsif new.reason in ('purchase', 'subscription_grant', 'admin_adjustment', 'refund') then
    perform public.write_audit(new.workspace_id, new.user_id, 'credits.' || new.reason::text, 'credit_transactions', new.id::text, jsonb_build_object('delta', new.delta));
  end if;
  return new;
end $$;
drop trigger if exists audit_credit_tx on public.credit_transactions;
create trigger audit_credit_tx after insert on public.credit_transactions for each row execute function public.audit_credit_tx();

-- members
create or replace function public.audit_members() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(new.workspace_id, new.user_id, 'member.added', 'workspace_members', new.user_id::text, jsonb_build_object('role', new.role));
  elsif tg_op = 'UPDATE' then
    if new.role is distinct from old.role or new.daily_credit_limit is distinct from old.daily_credit_limit then
      perform public.write_audit(new.workspace_id, null, 'member.updated', 'workspace_members', new.user_id::text,
        jsonb_build_object('from_role', old.role, 'to_role', new.role, 'daily_credit_limit', new.daily_credit_limit));
    end if;
  else
    perform public.write_audit(old.workspace_id, null, 'member.removed', 'workspace_members', old.user_id::text, jsonb_build_object('role', old.role));
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists audit_members on public.workspace_members;
create trigger audit_members after insert or update or delete on public.workspace_members for each row execute function public.audit_members();

-- invitations
create or replace function public.audit_invitations() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(new.workspace_id, new.invited_by, 'invite.sent', 'invitations', new.id::text, jsonb_build_object('email', new.email, 'role', new.role));
  elsif new.status is distinct from old.status then
    perform public.write_audit(new.workspace_id, null, 'invite.' || new.status::text, 'invitations', new.id::text, jsonb_build_object('email', new.email));
  end if;
  return new;
end $$;
drop trigger if exists audit_invitations on public.invitations;
create trigger audit_invitations after insert or update on public.invitations for each row execute function public.audit_invitations();

-- phone numbers: purchases, verification, review outcome, default, release
create or replace function public.audit_numbers() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(new.workspace_id, new.assigned_user_id,
      case when new.kind = 'verified_caller_id' then 'number.verified' when new.status = 'active' then 'number.purchased' else 'number.requested' end,
      'phone_numbers', new.id::text, jsonb_build_object('e164', new.e164, 'kind', new.kind, 'status', new.status));
  elsif tg_op = 'UPDATE' then
    if new.status is distinct from old.status then
      perform public.write_audit(new.workspace_id, null, 'number.' || new.status::text, 'phone_numbers', new.id::text, jsonb_build_object('e164', new.e164, 'from', old.status));
    end if;
    if new.is_default and not old.is_default then
      perform public.write_audit(new.workspace_id, null, 'number.set_default', 'phone_numbers', new.id::text, jsonb_build_object('e164', new.e164));
    end if;
  else
    perform public.write_audit(old.workspace_id, null, 'number.deleted', 'phone_numbers', old.id::text, jsonb_build_object('e164', old.e164));
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists audit_numbers on public.phone_numbers;
create trigger audit_numbers after insert or update or delete on public.phone_numbers for each row execute function public.audit_numbers();

-- do-not-call list
create or replace function public.audit_dnc() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(new.workspace_id, new.added_by, 'dnc.added', 'dnc_entries', new.id::text, jsonb_build_object('e164', new.e164, 'reason', new.reason));
  else
    perform public.write_audit(old.workspace_id, null, 'dnc.removed', 'dnc_entries', old.id::text, jsonb_build_object('e164', old.e164));
  end if;
  return coalesce(new, old);
end $$;
drop trigger if exists audit_dnc on public.dnc_entries;
create trigger audit_dnc after insert or delete on public.dnc_entries for each row execute function public.audit_dnc();

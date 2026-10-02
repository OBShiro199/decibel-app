-- =============================================================================
-- Decibel — 0007_audit_log_workspace_delete.sql
-- Fix: deleting a workspace cascades to its members, numbers, invitations and
-- DNC entries. Their audit triggers then tried to log against the workspace
-- being deleted, which violated audit_log's foreign key and blocked the delete.
-- Skip audit rows for a workspace that no longer exists (its own audit log is
-- removed with it anyway).
-- =============================================================================

create or replace function public.write_audit(
  p_workspace_id uuid, p_actor uuid, p_action text, p_table text, p_target text, p_payload jsonb default '{}'::jsonb
) returns void language sql security definer set search_path = public as $$
  insert into public.audit_log (workspace_id, actor_id, action, target_table, target_id, payload)
  select p_workspace_id, coalesce(auth.uid(), p_actor), p_action, p_table, p_target, coalesce(p_payload, '{}'::jsonb)
  where p_workspace_id is null or exists (select 1 from public.workspaces w where w.id = p_workspace_id);
$$;
revoke execute on function public.write_audit(uuid, uuid, text, text, text, jsonb) from public, anon, authenticated;

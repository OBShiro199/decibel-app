-- =============================================================================
-- Decibels — 0004_call_outcome_rpc.sql
-- One round trip, one transaction, to log a call's outcome. Replaces four
-- sequential client writes (call, note, task, person) that could partially fail.
-- Idempotent: saving the same call twice updates rather than duplicates.
-- =============================================================================

create or replace function public.log_call_outcome(
  p_call_id      uuid,
  p_outcome      public.call_outcome,
  p_notes        text default null,
  p_follow_up_at timestamptz default null
)
returns public.calls language plpgsql security definer set search_path = public as $$
declare
  c public.calls;
  body text := nullif(btrim(coalesce(p_notes, '')), '');
  callee text;
begin
  select * into c from public.calls where id = p_call_id;
  if c.id is null then raise exception 'call_not_found'; end if;
  if not public.is_member(c.workspace_id) then raise exception 'forbidden'; end if;

  -- triggers on calls roll the outcome up onto the person, the pipeline stage,
  -- the activity timeline and the DNC list
  update public.calls set outcome = p_outcome, notes = body where id = c.id returning * into c;

  if c.person_id is not null then
    if body is not null then
      update public.notes set body = body, updated_at = now() where call_id = c.id;
      if not found then
        insert into public.notes (workspace_id, person_id, call_id, author_id, body)
        values (c.workspace_id, c.person_id, c.id, auth.uid(), body);
      end if;
    end if;

    if p_follow_up_at is not null then
      select full_name into callee from public.people where id = c.person_id;
      if not exists (select 1 from public.tasks t where t.person_id = c.person_id and t.due_at = p_follow_up_at and t.completed_at is null) then
        insert into public.tasks (workspace_id, person_id, assignee_id, created_by, title, due_at)
        values (c.workspace_id, c.person_id, auth.uid(), auth.uid(), btrim('Call back ' || coalesce(callee, '')), p_follow_up_at);
      end if;
      update public.people set next_call_at = p_follow_up_at where id = c.person_id;
    end if;
  end if;

  return c;
end $$;

revoke execute on function public.log_call_outcome(uuid, public.call_outcome, text, timestamptz) from public, anon;
grant  execute on function public.log_call_outcome(uuid, public.call_outcome, text, timestamptz) to authenticated;

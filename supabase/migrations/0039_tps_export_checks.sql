-- 0039: TPS/CTPS checks before a lead export, and one reuse rule for every check.
-- * A number checked in the last 30 days and found clear (on neither register) is reused free, keeping its
--   original check date. A number that was listed is checked again: registrations change, and a listed
--   number is the one that must never be called by mistake. (Was: any result from the last 28 days.)
-- * tps_apply_to_people writes a finished check's results onto the workspace's people (tps_status,
--   tps_checked_at), so the dial-time TPS block (can_dial_for) sees them. Leads exports call it.

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
                               and n.checked_at > now() - interval '30 days'
                               and not n.on_tps and not n.on_ctps))
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

  -- unique UK numbers; a clear result from the last 30 days is reused free with its original date
  insert into public.tps_job_numbers (job_id, workspace_id, e164, status, on_tps, on_ctps, tps_since, ctps_since, reused, checked_at)
  select jid, p_workspace_id, u.e164,
         case when prev.e164 is null then 'pending' else 'done' end,
         prev.on_tps, prev.on_ctps, prev.tps_since, prev.ctps_since, prev.e164 is not null, prev.checked_at
    from (select distinct e164 from public.tps_job_rows where job_id = jid and kind = 'uk') u
    left join lateral (
      select n.e164, n.on_tps, n.on_ctps, n.tps_since, n.ctps_since, n.checked_at
        from public.tps_job_numbers n
       where n.workspace_id = p_workspace_id and n.e164 = u.e164 and n.status = 'done'
         and n.checked_at > now() - interval '30 days'
         and not n.on_tps and not n.on_ctps
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

-- Writes a finished check's results onto this workspace's people whose mobile was checked.
create or replace function public.tps_apply_to_people(p_job_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare j public.tps_jobs; n integer;
begin
  select * into j from public.tps_jobs where id = p_job_id;
  if not found or j.workspace_id not in (select public.my_workspace_ids()) then raise exception 'check not found' using errcode = '42501'; end if;
  if j.finished_at is null then raise exception 'still_running: wait for the check to finish'; end if;
  update public.people p
     set tps_status = case when x.on_tps then 'tps_listed'::public.tps_status
                           when x.on_ctps then 'ctps_listed'::public.tps_status
                           else 'clear'::public.tps_status end,
         tps_checked_at = x.checked_at
    from public.tps_job_numbers x
   where x.job_id = p_job_id and x.status = 'done'
     and p.workspace_id = j.workspace_id and p.mobile_e164 = x.e164
     and (p.tps_checked_at is null or p.tps_checked_at <= x.checked_at);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.tps_apply_to_people(uuid) from public, anon;
grant  execute on function public.tps_apply_to_people(uuid) to authenticated;

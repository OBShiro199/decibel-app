-- 0027: dnc_add counts a number repeated within one request as a duplicate, not as invalid.

-- Adds up to 5,000 numbers (one chunk of an upload, or a single number). Returns the counts.
create or replace function public.dnc_add(p_workspace_id uuid, p_numbers text[], p_labels text[] default null, p_reason text default null,
                                         p_source text default 'manual', p_import_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  imp public.dnc_imports;
  n_in integer := coalesce(cardinality(p_numbers), 0);
  n_valid integer;   -- rows with a readable number (repeats included)
  fresh text[];
  src text := case when p_source in ('manual', 'import', 'paste', 'tps_check') then p_source else 'manual' end;
  why text := nullif(left(btrim(coalesce(p_reason, '')), 200), '');
begin
  if auth.uid() is null or p_workspace_id is null or p_workspace_id not in (select public.my_workspace_ids()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if n_in > 5000 then raise exception 'too_many: add at most 5,000 numbers per request'; end if;
  if p_import_id is not null then
    select * into imp from public.dnc_imports where id = p_import_id for update;
    if not found or imp.workspace_id <> p_workspace_id or imp.user_id <> auth.uid() or imp.status <> 'running' then raise exception 'import_not_open'; end if;
    why := coalesce(why, imp.reason);
  end if;

  with given as (
    select public.dnc_e164(n) as e164, nullif(left(btrim(coalesce(p_labels[o], '')), 120), '') as label, o
      from unnest(p_numbers) with ordinality as t(n, o)
  ), valid as (
    select distinct on (e164) e164, label from given where e164 is not null order by e164, o
  ), ins as (
    insert into public.dnc_entries (workspace_id, e164, reason, label, source, import_id, added_by)
    select p_workspace_id, v.e164, why, v.label, src, p_import_id, auth.uid() from valid v
    on conflict (workspace_id, e164) do nothing
    returning e164
  )
  select (select count(*) from given where e164 is not null), coalesce((select array_agg(e164) from ins), '{}') into n_valid, fresh;

  -- people already in the workspace with these numbers can no longer be called
  if cardinality(fresh) > 0 then
    update public.people set do_not_call = true
     where workspace_id = p_workspace_id and not do_not_call and (mobile_e164 = any(fresh) or direct_dial_e164 = any(fresh));
  end if;

  if p_import_id is not null then
    update public.dnc_imports
       set added = dnc_imports.added + cardinality(fresh), duplicates = dnc_imports.duplicates + (n_valid - cardinality(fresh)), invalid = dnc_imports.invalid + (n_in - n_valid)
     where id = p_import_id;
  end if;
  return jsonb_build_object('added', cardinality(fresh), 'duplicates', n_valid - cardinality(fresh), 'invalid', n_in - n_valid);
end $$;

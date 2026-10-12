-- 0026: the DNC list. A workspace's own do-not-call numbers, uploaded in bulk (CSV, Excel, a
-- pasted list), added one at a time, from calls ("do not call" outcome) or from TPS check results.
--
-- What the database guarantees:
--   1. Nobody can add a person whose mobile or direct dial is on the workspace's DNC list (insert or
--      change of number is refused with 'dnc_listed: …'), whichever path adds them: CSV import,
--      the add-person form, quick dial, saving local businesses, revealing leads.
--   2. Nobody can dial a number on the list: can_dial / can_dial_for answer 'dnc_list' (checked
--      before the generic do-not-call flag so the reason is specific), and telnyx-call checks test
--      and test-routed numbers too.
--   3. Revealing leads skips any lead whose mobile is on the list: it is not revealed, not added to
--      the list or dialler, and not charged.
--   4. Lead and local-business search results say which rows are on the list (on_dnc).
--   5. Any member can add numbers (adding is always the safe direction); only owners and admins
--      can remove them. Adding flags matching people do_not_call; removing clears that flag unless
--      the person asked not to be called on a call.

-- ---------------------------------------------------------------------------
-- 1. Entries: where each came from, an optional label, numbers always E.164
-- ---------------------------------------------------------------------------
alter table public.dnc_entries add column if not exists source text not null default 'manual';
alter table public.dnc_entries drop constraint if exists dnc_entries_source_check;
alter table public.dnc_entries add constraint dnc_entries_source_check check (source in ('manual', 'import', 'paste', 'call', 'tps_check'));
alter table public.dnc_entries add column if not exists label text;
alter table public.dnc_entries drop constraint if exists dnc_entries_label_check;
alter table public.dnc_entries add constraint dnc_entries_label_check check (label is null or char_length(label) <= 120);
alter table public.dnc_entries add column if not exists import_id uuid;
create index if not exists dnc_entries_ws_created_idx on public.dnc_entries (workspace_id, created_at desc);
create index if not exists dnc_entries_e164_trgm on public.dnc_entries using gin (e164 gin_trgm_ops);
update public.dnc_entries set source = 'call' where reason = 'Requested on call' and source = 'manual';

-- one way to read a phone cell: UK or international number in E.164, else null
create or replace function public.dnc_e164(p text)
returns text language sql immutable set search_path = public as $$
  select c.e164 from public.tps_classify(p) c where c.kind in ('uk', 'not_uk')
$$;

create or replace function public.dnc_entries_before()
returns trigger language plpgsql set search_path = public as $$
begin
  new.e164 := coalesce(public.dnc_e164(new.e164), new.e164);
  if new.e164 !~ '^\+[1-9][0-9]{6,14}$' then raise exception 'invalid_number: % is not a phone number', new.e164; end if;
  if tg_op = 'INSERT' and new.source = 'manual' and new.reason = 'Requested on call' then new.source := 'call'; end if;
  new.label := nullif(left(btrim(coalesce(new.label, '')), 120), '');
  new.reason := nullif(left(btrim(coalesce(new.reason, '')), 200), '');
  return new;
end $$;
drop trigger if exists dnc_entries_before on public.dnc_entries;
create trigger dnc_entries_before before insert or update on public.dnc_entries
  for each row execute function public.dnc_entries_before();

-- ---------------------------------------------------------------------------
-- 2. Uploads (history; the rows are entries tagged with the import id)
-- ---------------------------------------------------------------------------
create table if not exists public.dnc_imports (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  user_id       uuid references public.profiles(id) on delete set null,
  file_name     text not null check (char_length(file_name) between 1 and 200),
  kind          text not null default 'file' check (kind in ('file', 'paste', 'tps_check')),
  reason        text check (reason is null or char_length(reason) <= 200),
  total_rows    integer not null default 0 check (total_rows >= 0),
  added         integer not null default 0,
  duplicates    integer not null default 0,
  invalid       integer not null default 0,
  status        text not null default 'running' check (status in ('running', 'done', 'failed')),
  created_at    timestamptz not null default now(),
  finished_at   timestamptz
);
create index if not exists dnc_imports_ws_idx on public.dnc_imports (workspace_id, created_at desc);
alter table public.dnc_imports enable row level security;
drop policy if exists dnc_imports_read on public.dnc_imports;
create policy dnc_imports_read on public.dnc_imports for select to authenticated using (workspace_id in (select public.my_workspace_ids()));
revoke insert, update, delete, truncate on public.dnc_imports from authenticated;
revoke all on public.dnc_imports from anon;

-- ---------------------------------------------------------------------------
-- 3. Adding, removing and checking numbers
-- ---------------------------------------------------------------------------
create or replace function public.dnc_import_begin(p_workspace_id uuid, p_file_name text, p_kind text, p_total integer, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null or p_workspace_id is null or p_workspace_id not in (select public.my_workspace_ids()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(p_total, 0) < 1 or p_total > 200000 then raise exception 'too_many_rows: a DNC upload can have up to 200,000 numbers'; end if;
  if (select count(*) from public.dnc_imports where user_id = auth.uid() and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'slow_down: you have uploaded a lot of lists this hour, try again shortly';
  end if;
  insert into public.dnc_imports (workspace_id, user_id, file_name, kind, reason, total_rows)
  values (p_workspace_id, auth.uid(), left(coalesce(nullif(btrim(p_file_name), ''), 'Pasted numbers'), 200),
          case when p_kind in ('file', 'paste', 'tps_check') then p_kind else 'file' end,
          nullif(left(btrim(coalesce(p_reason, '')), 200), ''), p_total)
  returning dnc_imports.id into v_id;
  return v_id;
end $$;

-- Adds up to 5,000 numbers (one chunk of an upload, or a single number). Returns the counts.
create or replace function public.dnc_add(p_workspace_id uuid, p_numbers text[], p_labels text[] default null, p_reason text default null,
                                         p_source text default 'manual', p_import_id uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  imp public.dnc_imports;
  n_in integer := coalesce(cardinality(p_numbers), 0);
  n_valid integer;
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
  select (select count(*) from valid), coalesce((select array_agg(e164) from ins), '{}') into n_valid, fresh;

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

create or replace function public.dnc_import_finish(p_import_id uuid, p_failed boolean default false)
returns public.dnc_imports language plpgsql security definer set search_path = public as $$
declare imp public.dnc_imports;
begin
  update public.dnc_imports set status = case when p_failed then 'failed' else 'done' end, finished_at = now()
   where id = p_import_id and user_id = auth.uid() and status = 'running'
  returning * into imp;
  if not found then select * into imp from public.dnc_imports where id = p_import_id and workspace_id in (select public.my_workspace_ids()); end if;
  return imp;
end $$;

-- Owners and admins only. People with these numbers become callable again unless they asked not to be.
create or replace function public.dnc_remove(p_workspace_id uuid, p_ids uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare gone text[];
begin
  if auth.uid() is null or not public.has_role(p_workspace_id, 'admin') then raise exception 'admins_only: only owners and admins can remove numbers from the DNC list' using errcode = '42501'; end if;
  if coalesce(cardinality(p_ids), 0) > 5000 then raise exception 'too_many: remove at most 5,000 numbers at a time'; end if;
  with del as (delete from public.dnc_entries where workspace_id = p_workspace_id and id = any(p_ids) returning e164)
  select coalesce(array_agg(e164), '{}') into gone from del;
  if cardinality(gone) > 0 then
    update public.people set do_not_call = false
     where workspace_id = p_workspace_id and do_not_call and last_outcome is distinct from 'do_not_call'
       and (mobile_e164 = any(gone) or direct_dial_e164 = any(gone))
       and not exists (select 1 from public.dnc_entries d where d.workspace_id = p_workspace_id and d.e164 in (people.mobile_e164, people.direct_dial_e164));
  end if;
  return cardinality(gone);
end $$;

-- Which of these numbers are on the list (for warnings before adding people). Up to 5,000.
create or replace function public.dnc_check(p_workspace_id uuid, p_numbers text[])
returns table (input text, e164 text) language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or p_workspace_id is null or p_workspace_id not in (select public.my_workspace_ids()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if coalesce(cardinality(p_numbers), 0) > 5000 then raise exception 'too_many: check at most 5,000 numbers at a time'; end if;
  return query
  select n, d.e164 from unnest(p_numbers) n
    join public.dnc_entries d on d.workspace_id = p_workspace_id and d.e164 = public.dnc_e164(n);
end $$;

revoke execute on function public.dnc_import_begin(uuid, text, text, integer, text) from public, anon;
revoke execute on function public.dnc_add(uuid, text[], text[], text, text, uuid) from public, anon;
revoke execute on function public.dnc_import_finish(uuid, boolean) from public, anon;
revoke execute on function public.dnc_remove(uuid, uuid[]) from public, anon;
revoke execute on function public.dnc_check(uuid, text[]) from public, anon;
grant execute on function public.dnc_import_begin(uuid, text, text, integer, text) to authenticated;
grant execute on function public.dnc_add(uuid, text[], text[], text, text, uuid) to authenticated;
grant execute on function public.dnc_import_finish(uuid, boolean) to authenticated;
grant execute on function public.dnc_remove(uuid, uuid[]) to authenticated;
grant execute on function public.dnc_check(uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. People can't be added with a DNC number
-- ---------------------------------------------------------------------------
create or replace function public.people_before_write()
returns trigger language plpgsql as $$
declare hit text;
begin
  if coalesce(current_setting('decibel.reveal', true), 'off') <> 'on' and coalesce(auth.role(), '') <> 'service_role' then
    if (tg_op = 'INSERT' and (new.source_contact_id is not null or new.source_lead_id is not null))
       or (tg_op = 'UPDATE' and new.source_contact_id is not null and new.source_contact_id is distinct from old.source_contact_id)
       or (tg_op = 'UPDATE' and new.source_lead_id is distinct from old.source_lead_id) then
      raise exception 'database contacts are added by revealing them' using errcode = '42501';
    end if;
  end if;
  new.mobile_e164      := public.normalize_phone(new.mobile_e164);
  new.direct_dial_e164 := public.normalize_phone(new.direct_dial_e164);

  -- a new person, or a changed number, must not be on the DNC list
  if tg_op = 'INSERT' or new.mobile_e164 is distinct from old.mobile_e164 or new.direct_dial_e164 is distinct from old.direct_dial_e164 then
    select d.e164 into hit from public.dnc_entries d
     where d.workspace_id = new.workspace_id
       and ((new.mobile_e164 is not null and d.e164 = new.mobile_e164 and (tg_op = 'INSERT' or new.mobile_e164 is distinct from old.mobile_e164))
         or (new.direct_dial_e164 is not null and d.e164 = new.direct_dial_e164 and (tg_op = 'INSERT' or new.direct_dial_e164 is distinct from old.direct_dial_e164)))
     limit 1;
    if hit is not null then
      raise exception 'dnc_listed: % is on your DNC list', hit using errcode = 'P0001', hint = 'Remove it from the DNC list first if you really need to add this person.';
    end if;
  end if;
  if new.mobile_e164 is not null and exists (
       select 1 from public.dnc_entries d where d.workspace_id = new.workspace_id and d.e164 = new.mobile_e164)
  then new.do_not_call := true; end if;
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Dialling: the DNC list is named before the generic do-not-call flag
-- ---------------------------------------------------------------------------
create or replace function public.can_dial(p_workspace_id uuid, p_person_id uuid)
returns table (allowed boolean, reason text) language plpgsql security definer set search_path = public as $$
declare p public.people; ws public.workspaces;
begin
  if not public.is_member(p_workspace_id) then return query select false, 'forbidden'; return; end if;
  select * into p  from public.people     where id = p_person_id and workspace_id = p_workspace_id;
  select * into ws from public.workspaces where id = p_workspace_id;
  if p.id is null                       then return query select false, 'person_not_found'; return; end if;
  if p.mobile_e164 is null              then return query select false, 'no_mobile'; return; end if;
  if exists (select 1 from public.dnc_entries d where d.workspace_id = p_workspace_id and d.e164 = p.mobile_e164)
                                        then return query select false, 'dnc_list'; return; end if;
  if p.do_not_call                      then return query select false, 'do_not_call'; return; end if;
  if p.tps_status in ('tps_listed','ctps_listed') then return query select false, 'tps_listed'; return; end if;
  if ws.plan = 'trial' and ws.trial_ends_at < now() then return query select false, 'trial_expired'; return; end if;
  if ws.minute_balance_seconds <= 0 and ws.stripe_customer_id is null
                                        then return query select false, 'no_minutes'; return; end if;
  return query select true, null::text;
end $$;

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
  if exists (select 1 from public.dnc_entries d where d.workspace_id = p_workspace_id and d.e164 = p.mobile_e164)
                                        then return query select false, 'dnc_list'; return; end if;
  if p.do_not_call                      then return query select false, 'do_not_call'; return; end if;
  if p.tps_status in ('tps_listed','ctps_listed') then return query select false, 'tps_listed'; return; end if;
  if ws.plan = 'trial' and ws.trial_ends_at < now() then return query select false, 'trial_expired'; return; end if;
  if ws.minute_balance_seconds <= 0 and ws.stripe_customer_id is null
                                        then return query select false, 'no_minutes'; return; end if;
  return query select true, null::text;
end $$;
revoke execute on function public.can_dial_for(uuid, uuid, uuid) from public, anon, authenticated;
grant  execute on function public.can_dial_for(uuid, uuid, uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 6. Revealing leads skips DNC numbers (not revealed, not charged)
-- ---------------------------------------------------------------------------
create or replace function public.reveal_leads(p_workspace_id uuid, p_lead_ids uuid[], p_list_id uuid default null)
returns setof public.people language plpgsql security definer set search_path = public set statement_timeout = '60s' as $$
declare ids uuid[]; cost integer; known integer; lid uuid; p public.people;
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  if coalesce(cardinality(p_lead_ids), 0) = 0 then return; end if;
  if cardinality(p_lead_ids) > 500 then raise exception 'too_many: reveal at most 500 leads at a time'; end if;

  perform 1 from public.workspaces where id = p_workspace_id for update;
  if p_list_id is not null and not exists (select 1 from public.lists where id = p_list_id and workspace_id = p_workspace_id) then
    raise exception 'list not found';
  end if;

  select array_agg(x order by o) into ids
    from (select distinct on (x) x, o from unnest(p_lead_ids) with ordinality as t(x, o) order by x, o) s;

  select count(distinct contact_id) into known from public.data_list where contact_id = any(ids);
  if known <> cardinality(ids) then raise exception 'lead not found'; end if;

  -- leads whose mobile is on the DNC list are left out entirely
  select array_agg(x order by o) into ids
    from unnest(ids) with ordinality as t(x, o)
   where not exists (
     select 1 from public.data_list d join public.dnc_entries e on e.workspace_id = p_workspace_id and e.e164 = public.lead_e164(d.mobile_phone)
      where d.contact_id = x);
  if ids is null then return; end if;

  select count(*) into cost from unnest(ids) as x
   where not exists (select 1 from public.people where workspace_id = p_workspace_id and source_lead_id = x);
  if cost > 0 then perform public.check_reveal_allowance(p_workspace_id, auth.uid(), cost); end if;

  foreach lid in array ids loop
    p := public.reveal_lead_one(p_workspace_id, lid, p_list_id, auth.uid());
    return next p;
  end loop;
end $$;
revoke all on function public.reveal_leads(uuid, uuid[], uuid) from public, anon;
grant execute on function public.reveal_leads(uuid, uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Search results say which rows are on the DNC list
-- ---------------------------------------------------------------------------
drop function if exists public.search_leads(uuid, jsonb, integer, integer);
drop function if exists public.search_local(uuid, jsonb, integer, integer);

create or replace function public.search_leads(p_workspace_id uuid, p_filters jsonb default '{}', p_limit integer default 100, p_offset integer default 0)
returns table (
  lead_id uuid, full_name text, first_name text, last_name text, current_title text, seniority_level text, department text,
  role_start_date date, company_name text, company_domain text, company_industry text, main_industry text,
  employee_count_range text, employee_count integer, revenue_range text, company_founded integer, company_hq_country text,
  contact_country text, contact_city text, contact_location text, linkedin_url text,
  has_mobile boolean, mobile text, has_email boolean, email text, email_status text, has_personal_email boolean,
  open_to_work boolean, is_hiring boolean, last_funding_type text, total_funding_amount text, smart_tags text,
  person_id uuid, on_dnc boolean
)
language plpgsql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare f public.lead_query := public.lead_query_from(coalesce(p_filters, '{}'));
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  return query execute
  'select d.contact_id, d.full_name, d.first_name, d.last_name, d.current_title, d.seniority_level, d.department,
          d.role_start_date, coalesce(nullif(d.company_name, ''''), d.current_employer), d.company_domain, d.company_industry, d.main_industry,
          d.employee_count_range, d.linkedin_employee_count_exact, d.revenue_range, extract(year from d.company_founded_year)::integer, d.company_hq_country,
          d.contact_country, d.contact_city, d.contact_location, d.linkedin_url,
          coalesce(d.mobile_phone, '''') <> '''',
          case when p.id is not null then p.mobile_e164 else public.mask_phone(public.lead_e164(d.mobile_phone)) end,
          coalesce(d.work_email, '''') <> '''',
          case when p.id is not null then p.email::text
               when coalesce(d.work_email, '''') <> '''' then ''•••@'' || split_part(d.work_email, ''@'', 2) end,
          d.email_status, coalesce(d.personal_emails, '''') <> '''',
          coalesce(d.open_to_work, false), coalesce(d.is_hiring, false), d.last_funding_type, d.total_funding_amount, d.smart_tags,
          p.id,
          exists (select 1 from public.dnc_entries e where e.workspace_id = $2 and e.e164 = public.lead_e164(d.mobile_phone))
     from (select s.contact_id from public.lead_search s where ' || public.lead_where(f) || '
            order by s.contact_id limit $3 offset $4) c
     cross join lateral (select * from public.data_list x where x.contact_id = c.contact_id limit 1) d
     left join public.people p on p.workspace_id = $2 and p.source_lead_id = d.contact_id
    order by d.contact_id'
  using f, p_workspace_id, least(greatest(coalesce(p_limit, 100), 1), 500), least(greatest(coalesce(p_offset, 0), 0), 10000);
end $$;

create or replace function public.search_local(p_workspace_id uuid, p_filters jsonb default '{}', p_limit integer default 100, p_offset integer default 0)
returns table (
  place_id text, name text, category text, all_categories text, keyword text, phone text, has_mobile boolean, whatsapp text,
  email text, all_emails text, website text, domain text, facebook text, instagram text, linkedin text,
  address text, street text, neighbourhood text, city text, postcode text, country text,
  rating numeric, review_url text, hours text, maps_url text, logo_url text, on_dnc boolean
)
language plpgsql stable security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare f public.local_query := public.local_query_from(coalesce(p_filters, '{}'));
begin
  if auth.uid() is null or not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;
  return query execute
  'select g."Place ID", g."Name", g."Category", g."All Categories", g."Keyword", g."Phone Standard Format",
          coalesce(g."Phone Standard Format", '''') like ''+44 7%'', g."WhatsApp",
          g."Email 1", g."All Emails", coalesce(g."Clean Website URL", g."Website"), g."Domain", g."Facebook", g."Instagram", g."LinkedIn",
          g."Full Address", g."Street Address", g."Neighborhood", g."City", g."Zip", g."Country",
          g."Average Rating", g."Review URL", g."Hours", g."GMB URL", g."Logo URL",
          exists (select 1 from public.dnc_entries e where e.workspace_id = $4 and e.e164 = public.lead_e164(g."Phone Standard Format"))
     from (select l.place_id from public.local_search l where ' || public.local_where(f) || '
            order by l.place_id limit $2 offset $3) c
     cross join lateral (select * from public.google_businesses x where x."Place ID" = c.place_id limit 1) g
    order by g."Place ID"'
  using f, least(greatest(coalesce(p_limit, 100), 1), 500), least(greatest(coalesce(p_offset, 0), 0), 10000), p_workspace_id;
end $$;

revoke all on function public.search_leads(uuid, jsonb, integer, integer) from public, anon;
revoke all on function public.search_local(uuid, jsonb, integer, integer) from public, anon;
grant execute on function public.search_leads(uuid, jsonb, integer, integer) to authenticated;
grant execute on function public.search_local(uuid, jsonb, integer, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. CSV imports of people report how many rows the DNC list stopped
-- ---------------------------------------------------------------------------
alter table public.imports add column if not exists dnc_skipped_count integer not null default 0;

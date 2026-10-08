-- 0024: one kind of list. A saved search is now a list in Lists (a "search list"): it keeps the
-- filters instead of people, and opening it runs the search on Leads or Local businesses.
-- Existing saved searches are moved across; saved_searches is no longer read or written by the app.

alter table public.lists add column if not exists search jsonb;
alter table public.lists add column if not exists search_source text;
alter table public.lists drop constraint if exists lists_search_shape;
alter table public.lists add constraint lists_search_shape check (
  (search is null and search_source is null)
  or (jsonb_typeof(search) = 'object' and search_source in ('leads', 'local') and octet_length(search::text) <= 20000)
);

-- a search list never has people in it
create or replace function public.list_members_not_search()
returns trigger language plpgsql as $$
begin
  if exists (select 1 from public.lists where id = new.list_id and search is not null) then
    raise exception 'people cannot be added to a saved search list' using errcode = '22023';
  end if;
  return new;
end $$;
drop trigger if exists list_members_not_search on public.list_members;
create trigger list_members_not_search before insert on public.list_members
  for each row execute function public.list_members_not_search();

-- move saved searches across, keeping names unique per workspace
insert into public.lists (workspace_id, name, owner_id, is_shared, search, search_source, created_at, updated_at)
select s.workspace_id,
       case when exists (select 1 from public.lists l where l.workspace_id = s.workspace_id and l.name = s.name)
              or (select count(*) from public.saved_searches d where d.workspace_id = s.workspace_id and d.name = s.name) > 1
            then left(s.name, 60) || ' (search ' || left(s.id::text, 4) || ')'
            else s.name end,
       s.user_id,
       true,
       case when s.filters ? 'v' then s.filters - 'source' else s.filters end,
       case when s.filters ->> 'source' = 'local' then 'local' else 'leads' end,
       s.created_at,
       s.created_at
  from public.saved_searches s
 where jsonb_typeof(s.filters) = 'object';

-- the old rows stay in saved_searches as a backup; nothing reads them any more

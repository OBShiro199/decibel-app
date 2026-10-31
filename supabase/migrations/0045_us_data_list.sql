-- 0045: us_data_list, a separate table for US leads (Blitz), with exactly data_list's columns, types and
-- index. Like data_list it has row level security on and no policies, so browsers can't read it; only
-- service-role code and security-definer functions can. Nothing in the app reads it yet: Leads search,
-- reveals and leads_by_ids still use data_list only.
create table if not exists public.us_data_list (like public.data_list including defaults including constraints including indexes);
alter table public.us_data_list enable row level security;
revoke all on public.us_data_list from anon, authenticated;
grant all on public.us_data_list to service_role;
-- lookups when importing: skip people already in the table
create index if not exists us_data_list_linkedin_idx on public.us_data_list (linkedin_url);
create index if not exists us_data_list_work_email_idx on public.us_data_list (work_email);

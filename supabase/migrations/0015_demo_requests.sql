-- 0015: "Book a 15-min demo" requests from the website. Written only by the public
-- `demo-request` Edge Function (service role), which also emails the founder.
create table public.demo_requests (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) between 3 and 200),
  company     text not null default '' check (char_length(company) <= 160),
  team_size   text not null default '' check (char_length(team_size) <= 40),
  phone       text not null default '' check (char_length(phone) <= 40),
  message     text not null default '' check (char_length(message) <= 2000),
  created_at  timestamptz not null default now()
);
create index demo_requests_created_idx on public.demo_requests (created_at desc);
create index demo_requests_email_idx on public.demo_requests (lower(email), created_at desc);
alter table public.demo_requests enable row level security;
revoke all on public.demo_requests from anon, authenticated;

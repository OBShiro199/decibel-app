-- =============================================================================
-- Decibels — 0001_schema.sql
-- Supabase Postgres migration: extensions, enums, tables, indexes, helpers,
-- triggers, RLS policies, views, storage policies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";      -- gen_random_uuid()
create extension if not exists "citext";        -- case-insensitive emails
create extension if not exists "pg_trgm";       -- fuzzy search on names/companies

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------
create type public.workspace_role      as enum ('owner', 'admin', 'member');
create type public.invitation_status   as enum ('pending', 'accepted', 'revoked', 'expired');
create type public.plan_tier           as enum ('trial', 'starter', 'growth', 'scale');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'canceled', 'paused', 'incomplete');
create type public.phone_number_kind   as enum ('twilio_local', 'twilio_national', 'twilio_mobile', 'verified_caller_id');
create type public.phone_number_status as enum ('pending_bundle', 'pending_review', 'active', 'rejected', 'released');
create type public.recording_policy    as enum ('always', 'rep_choice', 'never');
create type public.seniority           as enum ('c_level', 'vp', 'director', 'manager', 'ic', 'owner');
create type public.company_size_band   as enum ('1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001+');
create type public.tps_status          as enum ('unchecked', 'clear', 'tps_listed', 'ctps_listed');
create type public.list_view           as enum ('table', 'kanban');
create type public.call_direction      as enum ('outbound', 'inbound');
create type public.call_kind           as enum ('standard', 'test', 'voicemail');
create type public.call_status         as enum ('queued', 'initiated', 'ringing', 'in_progress', 'completed', 'busy', 'no_answer', 'failed', 'canceled', 'blocked');
create type public.call_outcome        as enum ('connected', 'no_answer', 'voicemail', 'busy', 'wrong_number', 'meeting_booked', 'not_interested', 'call_back', 'do_not_call');
create type public.credit_reason       as enum ('trial_grant', 'purchase', 'subscription_grant', 'reveal', 'refund', 'admin_adjustment');
create type public.activity_kind       as enum ('call', 'note', 'task_created', 'task_completed', 'stage_changed', 'revealed', 'imported', 'created', 'assigned');
create type public.import_status       as enum ('uploaded', 'mapping', 'processing', 'completed', 'failed');

-- ---------------------------------------------------------------------------
-- 2. Shared helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Normalise a UK/EU number to E.164: strips spaces, converts a leading 0 to +44 when no country code is given.
create or replace function public.normalize_phone(p text, default_cc text default '44')
returns text language plpgsql immutable as $$
declare s text;
begin
  if p is null then return null; end if;
  s := regexp_replace(p, '[^0-9+]', '', 'g');
  if s like '00%' then s := '+' || substr(s, 3); end if;
  if s like '0%'  then s := '+' || default_cc || substr(s, 2); end if;
  if s not like '+%' then s := '+' || s; end if;
  return s;
end $$;

create or replace function public.mask_phone(p text)
returns text language sql immutable as $$
  select case when p is null then null
              when length(p) < 7 then '•••'
              else left(p, 4) || ' ' || repeat('•', greatest(length(p) - 7, 1)) || right(p, 3) end
$$;

-- ---------------------------------------------------------------------------
-- 3. Identity and tenancy
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  email              citext not null unique,
  full_name          text not null default '',
  avatar_url         text,
  last_workspace_id  uuid,
  timezone           text not null default 'Europe/London',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.workspaces (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null check (length(name) between 1 and 80),
  slug                     citext not null unique check (slug ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$'),
  website                  text,
  logo_url                 text,
  team_size                text,
  created_by               uuid not null references public.profiles(id),
  -- Twilio
  twilio_subaccount_sid    text unique,
  twilio_twiml_app_sid     text,
  twilio_api_key_sid       text,
  twilio_secret_vault_id   uuid,                       -- reference to vault.secrets
  recording_policy         public.recording_policy not null default 'always',
  recording_notice_text    text not null default 'This call may be recorded for quality and training purposes.',
  -- Billing
  stripe_customer_id       text unique,
  plan                     public.plan_tier not null default 'trial',
  trial_ends_at            timestamptz not null default now() + interval '14 days',
  credit_balance           integer not null default 0 check (credit_balance >= 0),
  minute_balance_seconds   integer not null default 0,
  -- Onboarding
  onboarding_state         jsonb not null default '{"step": 1}'::jsonb,
  onboarding_completed_at  timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_last_workspace_fk
  foreign key (last_workspace_id) references public.workspaces(id) on delete set null;

create table public.workspace_members (
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  role           public.workspace_role not null default 'member',
  daily_credit_limit integer,                           -- null = unlimited within workspace balance
  joined_at      timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members(user_id);

create table public.invitations (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces(id) on delete cascade,
  email         citext not null,
  role          public.workspace_role not null default 'member',
  token         text not null unique default encode(gen_random_bytes(24), 'hex'),
  status        public.invitation_status not null default 'pending',
  invited_by    uuid not null references public.profiles(id),
  expires_at    timestamptz not null default now() + interval '7 days',
  accepted_at   timestamptz,
  created_at    timestamptz not null default now(),
  unique (workspace_id, email)
);

create table public.business_profiles (
  workspace_id      uuid primary key references public.workspaces(id) on delete cascade,
  what_we_sell      text,
  category          text,
  avg_deal_size     text,
  sales_motion      text,
  markets           text[] not null default '{}',          -- e.g. {UK, IE, DACH}
  updated_at        timestamptz not null default now()
);

create table public.icp_profiles (
  id                uuid primary key default gen_random_uuid(),
  workspace_id      uuid not null references public.workspaces(id) on delete cascade,
  name              text not null default 'My ICP',
  industries        text[] not null default '{}',
  company_sizes     public.company_size_band[] not null default '{}',
  countries         text[] not null default '{}',          -- ISO-3166 alpha-2
  job_titles        text[] not null default '{}',
  seniorities       public.seniority[] not null default '{}',
  is_default        boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index icp_profiles_workspace_idx on public.icp_profiles(workspace_id);

-- ---------------------------------------------------------------------------
-- 4. Billing
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null unique references public.workspaces(id) on delete cascade,
  stripe_subscription_id   text unique,
  stripe_price_id          text,
  plan                     public.plan_tier not null,
  status                   public.subscription_status not null,
  seats                    integer not null default 1 check (seats >= 1),
  current_period_start     timestamptz,
  current_period_end       timestamptz,
  cancel_at_period_end     boolean not null default false,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.credit_transactions (
  id             bigint generated always as identity primary key,
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete set null,
  delta          integer not null check (delta <> 0),
  reason         public.credit_reason not null,
  reference_id   uuid,                                     -- contact_id for reveals, invoice for purchases
  note           text,
  created_at     timestamptz not null default now()
);
create index credit_transactions_ws_created_idx on public.credit_transactions(workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 5. Phone numbers
-- ---------------------------------------------------------------------------
create table public.phone_numbers (
  id                       uuid primary key default gen_random_uuid(),
  workspace_id             uuid not null references public.workspaces(id) on delete cascade,
  e164                     text not null check (e164 ~ '^\+[1-9][0-9]{6,14}$'),
  friendly_name            text,
  country_code             char(2) not null default 'GB',
  kind                     public.phone_number_kind not null,
  status                   public.phone_number_status not null default 'pending_bundle',
  twilio_sid               text unique,                    -- IncomingPhoneNumber SID or OutgoingCallerId SID
  regulatory_bundle_sid    text,
  address_sid              text,
  assigned_user_id         uuid references public.profiles(id) on delete set null,
  is_default               boolean not null default false,
  monthly_cost_pence       integer not null default 0,
  purchased_at             timestamptz,
  released_at              timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (workspace_id, e164)
);
create unique index phone_numbers_one_default_per_ws
  on public.phone_numbers(workspace_id) where is_default;
create index phone_numbers_ws_idx on public.phone_numbers(workspace_id);

-- ---------------------------------------------------------------------------
-- 6. Global lead database (Decibels-owned, not tenant data)
-- ---------------------------------------------------------------------------
create table public.industries (
  id     serial primary key,
  name   text not null unique,
  sic_codes text[] not null default '{}'
);

create table public.companies (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  domain             citext unique,
  linkedin_url       text,
  industry_id        integer references public.industries(id),
  size_band          public.company_size_band,
  employee_count     integer,
  country_code       char(2) not null default 'GB',
  city               text,
  region             text,
  postcode           text,
  phone_switchboard  text,
  description        text,
  founded_year       integer,
  company_number     text,                                 -- Companies House number
  ctps_status        public.tps_status not null default 'unchecked',
  last_verified_at   timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index companies_name_trgm_idx on public.companies using gin (name gin_trgm_ops);
create index companies_industry_idx  on public.companies(industry_id);
create index companies_country_size_idx on public.companies(country_code, size_band);

create table public.contacts (
  id                 uuid primary key default gen_random_uuid(),
  company_id         uuid references public.companies(id) on delete set null,
  first_name         text not null,
  last_name          text not null,
  full_name          text generated always as (first_name || ' ' || last_name) stored,
  job_title          text,
  seniority          public.seniority,
  department         text,
  email              citext,
  email_verified     boolean not null default false,
  mobile_e164        text check (mobile_e164 is null or mobile_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  mobile_verified_at timestamptz,
  direct_dial_e164   text,
  linkedin_url       text,
  country_code       char(2) not null default 'GB',
  city               text,
  region             text,
  tps_status         public.tps_status not null default 'unchecked',
  tps_checked_at     timestamptz,
  last_verified_at   timestamptz,
  source             text not null default 'seed',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index contacts_company_idx     on public.contacts(company_id);
create index contacts_name_trgm_idx   on public.contacts using gin (full_name gin_trgm_ops);
create index contacts_title_trgm_idx  on public.contacts using gin (job_title gin_trgm_ops);
create index contacts_country_sen_idx on public.contacts(country_code, seniority);
create index contacts_has_mobile_idx  on public.contacts(id) where mobile_e164 is not null;
create unique index contacts_email_uq on public.contacts(email) where email is not null;

-- Public (masked) view of the database: what the browser is allowed to select.
-- Deliberately NOT security_invoker: it runs as the owner so clients never need
-- a grant on the raw contacts table (which holds unmasked mobiles).
create view public.contacts_public as
select c.id, c.company_id, c.first_name, c.last_name, c.full_name, c.job_title, c.seniority,
       c.department, c.country_code, c.city, c.region,
       (c.email is not null)       as has_email,
       (c.mobile_e164 is not null) as has_mobile,
       public.mask_phone(c.mobile_e164) as mobile_masked,
       c.tps_status, c.last_verified_at,
       co.name as company_name, co.domain as company_domain, co.size_band as company_size_band,
       i.name  as industry
from public.contacts c
left join public.companies co on co.id = c.company_id
left join public.industries i on i.id = co.industry_id;

-- ---------------------------------------------------------------------------
-- 7. Tenant CRM records
-- ---------------------------------------------------------------------------
create table public.tenant_companies (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  source_company_id  uuid references public.companies(id) on delete set null,
  name               text not null,
  domain             citext,
  industry           text,
  size_band          public.company_size_band,
  country_code       char(2),
  city               text,
  linkedin_url       text,
  notes              text,
  owner_id           uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (workspace_id, source_company_id),
  unique (workspace_id, domain)
);
create index tenant_companies_ws_idx on public.tenant_companies(workspace_id);

create table public.pipeline_stages (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  name           text not null,
  position       integer not null,
  is_won         boolean not null default false,
  is_lost        boolean not null default false,
  created_at     timestamptz not null default now(),
  unique (workspace_id, name),
  unique (workspace_id, position)
);

create table public.people (
  id                  uuid primary key default gen_random_uuid(),
  workspace_id        uuid not null references public.workspaces(id) on delete cascade,
  source_contact_id   uuid references public.contacts(id) on delete set null,
  tenant_company_id   uuid references public.tenant_companies(id) on delete set null,
  first_name          text not null,
  last_name           text not null default '',
  full_name           text generated always as (btrim(first_name || ' ' || last_name)) stored,
  job_title           text,
  seniority           public.seniority,
  email               citext,
  mobile_e164         text check (mobile_e164 is null or mobile_e164 ~ '^\+[1-9][0-9]{6,14}$'),
  direct_dial_e164    text,
  linkedin_url        text,
  country_code        char(2),
  city                text,
  tps_status          public.tps_status not null default 'unchecked',
  tps_checked_at      timestamptz,
  do_not_call         boolean not null default false,
  owner_id            uuid references public.profiles(id) on delete set null,
  stage_id            uuid references public.pipeline_stages(id) on delete set null,
  tags                text[] not null default '{}',
  priority            smallint not null default 0,
  last_called_at      timestamptz,
  last_outcome        public.call_outcome,
  call_count          integer not null default 0,
  next_call_at        timestamptz,
  source              text not null default 'database',   -- database | import | manual
  created_by          uuid references public.profiles(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (workspace_id, source_contact_id)
);
create index people_ws_idx            on public.people(workspace_id);
create index people_ws_owner_idx      on public.people(workspace_id, owner_id);
create index people_ws_stage_idx      on public.people(workspace_id, stage_id);
create index people_ws_next_call_idx  on public.people(workspace_id, next_call_at) where next_call_at is not null;
create index people_name_trgm_idx     on public.people using gin (full_name gin_trgm_ops);
create unique index people_ws_mobile_uq on public.people(workspace_id, mobile_e164) where mobile_e164 is not null;

create table public.lists (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  name           text not null,
  description    text,
  default_view   public.list_view not null default 'table',
  is_shared      boolean not null default true,
  script         text,
  owner_id       uuid not null references public.profiles(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (workspace_id, name)
);
create index lists_ws_idx on public.lists(workspace_id);

create table public.list_members (
  list_id        uuid not null references public.lists(id) on delete cascade,
  person_id      uuid not null references public.people(id) on delete cascade,
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  position       integer not null default 0,
  added_by       uuid references public.profiles(id) on delete set null,
  added_at       timestamptz not null default now(),
  primary key (list_id, person_id)
);
create index list_members_person_idx on public.list_members(person_id);
create index list_members_ws_idx     on public.list_members(workspace_id);

create table public.saved_searches (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  name           text not null,
  filters        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create table public.dnc_entries (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  e164           text not null,
  reason         text,
  added_by       uuid references public.profiles(id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (workspace_id, e164)
);

-- ---------------------------------------------------------------------------
-- 8. Calls, recordings, notes, tasks, activity
-- ---------------------------------------------------------------------------
create table public.calls (
  id                     uuid primary key default gen_random_uuid(),
  workspace_id           uuid not null references public.workspaces(id) on delete cascade,
  user_id                uuid references public.profiles(id) on delete set null,
  person_id              uuid references public.people(id) on delete set null,
  list_id                uuid references public.lists(id) on delete set null,
  phone_number_id        uuid references public.phone_numbers(id) on delete set null,
  direction              public.call_direction not null default 'outbound',
  kind                   public.call_kind not null default 'standard',
  from_e164              text,
  to_e164                text not null,
  status                 public.call_status not null default 'queued',
  outcome                public.call_outcome,
  twilio_call_sid        text unique,                     -- parent (client) leg
  twilio_child_call_sid  text unique,                     -- PSTN leg
  hangup_cause           text,
  blocked_reason         text,                            -- when status = blocked
  started_at             timestamptz not null default now(),
  answered_at            timestamptz,
  ended_at               timestamptz,
  duration_seconds       integer not null default 0 check (duration_seconds >= 0),
  talk_seconds           integer not null default 0 check (talk_seconds >= 0),
  recording_consent_played boolean not null default false,
  notes                  text,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index calls_ws_started_idx   on public.calls(workspace_id, started_at desc);
create index calls_ws_user_idx      on public.calls(workspace_id, user_id, started_at desc);
create index calls_person_idx       on public.calls(person_id);
create index calls_ws_outcome_idx   on public.calls(workspace_id, outcome);

create table public.recordings (
  id                   uuid primary key default gen_random_uuid(),
  workspace_id         uuid not null references public.workspaces(id) on delete cascade,
  call_id              uuid not null unique references public.calls(id) on delete cascade,
  storage_path         text not null,                     -- recordings/{workspace_id}/{call_id}.mp3
  twilio_recording_sid text unique,
  duration_seconds     integer not null default 0,
  channels             smallint not null default 2,
  size_bytes           bigint,
  transcript           text,                              -- V2
  summary              text,                              -- V2
  twilio_deleted_at    timestamptz,
  created_at           timestamptz not null default now()
);
create index recordings_ws_idx on public.recordings(workspace_id);

create table public.notes (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  person_id      uuid references public.people(id) on delete cascade,
  tenant_company_id uuid references public.tenant_companies(id) on delete cascade,
  call_id        uuid references public.calls(id) on delete set null,
  author_id      uuid references public.profiles(id) on delete set null,
  body           text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (person_id is not null or tenant_company_id is not null)
);
create index notes_person_idx on public.notes(person_id, created_at desc);

create table public.tasks (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  person_id      uuid references public.people(id) on delete cascade,
  assignee_id    uuid references public.profiles(id) on delete set null,
  created_by     uuid references public.profiles(id) on delete set null,
  title          text not null,
  due_at         timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index tasks_ws_assignee_due_idx on public.tasks(workspace_id, assignee_id, due_at) where completed_at is null;
create index tasks_person_idx on public.tasks(person_id);

create table public.activities (
  id             bigint generated always as identity primary key,
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  person_id      uuid references public.people(id) on delete cascade,
  tenant_company_id uuid references public.tenant_companies(id) on delete cascade,
  actor_id       uuid references public.profiles(id) on delete set null,
  kind           public.activity_kind not null,
  call_id        uuid references public.calls(id) on delete cascade,
  note_id        uuid references public.notes(id) on delete cascade,
  task_id        uuid references public.tasks(id) on delete cascade,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index activities_person_created_idx on public.activities(person_id, created_at desc);
create index activities_ws_created_idx     on public.activities(workspace_id, created_at desc);

create table public.imports (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  user_id        uuid references public.profiles(id) on delete set null,
  storage_path   text not null,
  filename       text not null,
  status         public.import_status not null default 'uploaded',
  column_map     jsonb not null default '{}'::jsonb,
  row_count      integer,
  imported_count integer not null default 0,
  skipped_count  integer not null default 0,
  error          text,
  list_id        uuid references public.lists(id) on delete set null,
  created_at     timestamptz not null default now(),
  completed_at   timestamptz
);

create table public.audit_log (
  id             bigint generated always as identity primary key,
  workspace_id   uuid references public.workspaces(id) on delete cascade,
  actor_id       uuid,
  action         text not null,
  target_table   text,
  target_id      text,
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);
create index audit_log_ws_idx on public.audit_log(workspace_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 9. updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','workspaces','icp_profiles','subscriptions','phone_numbers',
                           'companies','contacts','tenant_companies','people','lists','calls','notes','tasks']
  loop
    execute format('create trigger %I_set_updated_at before update on public.%I
                    for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 10. Auth helpers (used by RLS)
-- ---------------------------------------------------------------------------
create or replace function public.workspace_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.workspace_members where user_id = auth.uid()
$$;

create or replace function public.is_member(ws uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.workspace_members where workspace_id = ws and user_id = auth.uid())
$$;

create or replace function public.has_role(ws uuid, min_role public.workspace_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = auth.uid()
      and case min_role
            when 'member' then true
            when 'admin'  then m.role in ('admin','owner')
            when 'owner'  then m.role = 'owner'
          end
  )
$$;

-- ---------------------------------------------------------------------------
-- 11. Lifecycle triggers
-- ---------------------------------------------------------------------------
-- 11a. New auth user -> profile
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', ''),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 11b. New workspace -> owner membership, default stages, trial credits, business profile
create or replace function public.handle_new_workspace()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.created_by, 'owner');

  insert into public.pipeline_stages (workspace_id, name, position, is_won, is_lost) values
    (new.id, 'New',            1, false, false),
    (new.id, 'Attempted',      2, false, false),
    (new.id, 'Connected',      3, false, false),
    (new.id, 'Meeting booked', 4, false, false),
    (new.id, 'Qualified',      5, false, false),
    (new.id, 'Won',            6, true,  false),
    (new.id, 'Lost',           7, false, true),
    (new.id, 'Not interested', 8, false, true),
    (new.id, 'Wrong number',   9, false, true);

  -- the credit_transactions trigger below adds the 50 to workspaces.credit_balance
  insert into public.credit_transactions (workspace_id, user_id, delta, reason, note)
  values (new.id, new.created_by, 50, 'trial_grant', '14-day trial credits');

  update public.workspaces set minute_balance_seconds = 60 * 60 where id = new.id;

  insert into public.business_profiles (workspace_id) values (new.id);

  update public.profiles set last_workspace_id = new.id where id = new.created_by;
  return new;
end $$;

create trigger on_workspace_created
  after insert on public.workspaces
  for each row execute function public.handle_new_workspace();

-- 11c. Keep workspaces.credit_balance in sync with credit_transactions
create or replace function public.apply_credit_transaction()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.workspaces set credit_balance = credit_balance + new.delta where id = new.workspace_id;
  return new;
end $$;

create trigger on_credit_transaction
  after insert on public.credit_transactions
  for each row execute function public.apply_credit_transaction();

-- 11d. Call outcome set -> roll up onto person + activity row (+ DNC)
create or replace function public.handle_call_update()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.person_id is not null and new.outcome is distinct from old.outcome and new.outcome is not null then
    update public.people
       set last_called_at = coalesce(new.ended_at, now()),
           last_outcome   = new.outcome,
           call_count     = call_count + 1,
           do_not_call    = case when new.outcome = 'do_not_call' then true else do_not_call end
     where id = new.person_id;

    insert into public.activities (workspace_id, person_id, actor_id, kind, call_id, payload)
    values (new.workspace_id, new.person_id, new.user_id, 'call', new.id,
            jsonb_build_object('outcome', new.outcome, 'duration_seconds', new.duration_seconds));

    if new.outcome = 'do_not_call' then
      insert into public.dnc_entries (workspace_id, e164, reason, added_by)
      values (new.workspace_id, new.to_e164, 'Requested on call', new.user_id)
      on conflict do nothing;
    end if;
  end if;

  if new.ended_at is not null and new.answered_at is not null and new.talk_seconds = 0 then
    new.talk_seconds := greatest(0, extract(epoch from (new.ended_at - new.answered_at))::int);
  end if;
  return new;
end $$;

create trigger on_call_updated
  before update on public.calls
  for each row execute function public.handle_call_update();

-- 11e. Note / task / stage activity
create or replace function public.log_note_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.activities (workspace_id, person_id, tenant_company_id, actor_id, kind, note_id)
  values (new.workspace_id, new.person_id, new.tenant_company_id, new.author_id, 'note', new.id);
  return new;
end $$;
create trigger on_note_created after insert on public.notes
  for each row execute function public.log_note_activity();

create or replace function public.log_task_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into public.activities (workspace_id, person_id, actor_id, kind, task_id, payload)
    values (new.workspace_id, new.person_id, new.created_by, 'task_created', new.id, jsonb_build_object('title', new.title));
  elsif new.completed_at is not null and old.completed_at is null then
    insert into public.activities (workspace_id, person_id, actor_id, kind, task_id, payload)
    values (new.workspace_id, new.person_id, new.assignee_id, 'task_completed', new.id, jsonb_build_object('title', new.title));
  end if;
  return new;
end $$;
create trigger on_task_changed after insert or update on public.tasks
  for each row execute function public.log_task_activity();

create or replace function public.log_stage_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage_id is distinct from old.stage_id then
    insert into public.activities (workspace_id, person_id, actor_id, kind, payload)
    values (new.workspace_id, new.id, auth.uid(), 'stage_changed',
            jsonb_build_object('from', old.stage_id, 'to', new.stage_id));
  end if;
  return new;
end $$;
create trigger on_person_stage_changed after update of stage_id on public.people
  for each row execute function public.log_stage_change();

-- 11f. Normalise phone numbers and check DNC on people insert/update
create or replace function public.people_before_write()
returns trigger language plpgsql as $$
begin
  new.mobile_e164      := public.normalize_phone(new.mobile_e164);
  new.direct_dial_e164 := public.normalize_phone(new.direct_dial_e164);
  if new.mobile_e164 is not null and exists (
       select 1 from public.dnc_entries d where d.workspace_id = new.workspace_id and d.e164 = new.mobile_e164)
  then new.do_not_call := true; end if;
  return new;
end $$;
create trigger people_normalize before insert or update on public.people
  for each row execute function public.people_before_write();

-- ---------------------------------------------------------------------------
-- 12. RPCs (called from the app with the user's JWT via supabase.rpc())
-- ---------------------------------------------------------------------------
-- 12a. Create a workspace for the current user
create or replace function public.create_workspace(p_name text, p_slug text, p_website text default null, p_team_size text default null)
returns public.workspaces language plpgsql security definer set search_path = public as $$
declare ws public.workspaces;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.workspaces (name, slug, website, team_size, created_by)
  values (p_name, p_slug, p_website, p_team_size, auth.uid())
  returning id into ws.id;
  -- re-read: after-insert triggers have added membership, stages and trial credits
  select * into ws from public.workspaces where id = ws.id;
  return ws;
end $$;

-- 12b. Reveal a database contact into the tenant's people table (charges 1 credit, idempotent)
create or replace function public.reveal_contact(p_workspace_id uuid, p_contact_id uuid, p_list_id uuid default null)
returns public.people language plpgsql security definer set search_path = public as $$
declare
  c   public.contacts;
  p   public.people;
  tc  uuid;
  bal integer;
  lim integer;
  used_today integer;
begin
  if not public.is_member(p_workspace_id) then raise exception 'forbidden'; end if;

  select * into p from public.people where workspace_id = p_workspace_id and source_contact_id = p_contact_id;
  if found then
    if p_list_id is not null then
      insert into public.list_members (list_id, person_id, workspace_id, added_by)
      values (p_list_id, p.id, p_workspace_id, auth.uid()) on conflict do nothing;
    end if;
    return p;
  end if;

  select * into c from public.contacts where id = p_contact_id;
  if not found then raise exception 'contact not found'; end if;

  select credit_balance into bal from public.workspaces where id = p_workspace_id for update;
  if bal < 1 then raise exception 'insufficient_credits'; end if;

  select daily_credit_limit into lim from public.workspace_members where workspace_id = p_workspace_id and user_id = auth.uid();
  if lim is not null then
    select coalesce(-sum(delta),0) into used_today from public.credit_transactions
     where workspace_id = p_workspace_id and user_id = auth.uid() and reason = 'reveal' and created_at >= date_trunc('day', now());
    if used_today >= lim then raise exception 'daily_limit_reached'; end if;
  end if;

  if c.company_id is not null then
    insert into public.tenant_companies (workspace_id, source_company_id, name, domain, industry, size_band, country_code, city, linkedin_url)
    select p_workspace_id, co.id, co.name, co.domain, i.name, co.size_band, co.country_code, co.city, co.linkedin_url
      from public.companies co left join public.industries i on i.id = co.industry_id where co.id = c.company_id
    on conflict (workspace_id, source_company_id) do update set name = excluded.name
    returning id into tc;
  end if;

  insert into public.people (workspace_id, source_contact_id, tenant_company_id, first_name, last_name, job_title, seniority,
                             email, mobile_e164, direct_dial_e164, linkedin_url, country_code, city, tps_status, tps_checked_at,
                             source, created_by, stage_id)
  values (p_workspace_id, c.id, tc, c.first_name, c.last_name, c.job_title, c.seniority,
          c.email, c.mobile_e164, c.direct_dial_e164, c.linkedin_url, c.country_code, c.city, c.tps_status, c.tps_checked_at,
          'database', auth.uid(),
          (select id from public.pipeline_stages where workspace_id = p_workspace_id and position = 1))
  returning * into p;

  insert into public.credit_transactions (workspace_id, user_id, delta, reason, reference_id)
  values (p_workspace_id, auth.uid(), -1, 'reveal', c.id);

  insert into public.activities (workspace_id, person_id, actor_id, kind, payload)
  values (p_workspace_id, p.id, auth.uid(), 'revealed', jsonb_build_object('contact_id', c.id));

  if p_list_id is not null then
    insert into public.list_members (list_id, person_id, workspace_id, added_by)
    values (p_list_id, p.id, p_workspace_id, auth.uid()) on conflict do nothing;
  end if;
  return p;
end $$;

-- 12c. Can this person be dialled right now? Used by the client before connect and by twilio-voice server-side.
create or replace function public.can_dial(p_workspace_id uuid, p_person_id uuid)
returns table (allowed boolean, reason text) language plpgsql security definer set search_path = public as $$
declare p public.people; ws public.workspaces;
begin
  if not public.is_member(p_workspace_id) then return query select false, 'forbidden'; return; end if;
  select * into p  from public.people     where id = p_person_id and workspace_id = p_workspace_id;
  select * into ws from public.workspaces where id = p_workspace_id;
  if p.id is null                       then return query select false, 'person_not_found'; return; end if;
  if p.mobile_e164 is null              then return query select false, 'no_mobile'; return; end if;
  if p.do_not_call                      then return query select false, 'do_not_call'; return; end if;
  if p.tps_status in ('tps_listed','ctps_listed') then return query select false, 'tps_listed'; return; end if;
  if exists (select 1 from public.dnc_entries d where d.workspace_id = p_workspace_id and d.e164 = p.mobile_e164)
                                        then return query select false, 'dnc_list'; return; end if;
  if ws.plan = 'trial' and ws.trial_ends_at < now() then return query select false, 'trial_expired'; return; end if;
  if ws.minute_balance_seconds <= 0 and ws.stripe_customer_id is null
                                        then return query select false, 'no_minutes'; return; end if;
  return query select true, null::text;
end $$;

-- 12d. Accept an invitation
create or replace function public.accept_invitation(p_token text)
returns public.workspaces language plpgsql security definer set search_path = public as $$
declare inv public.invitations; ws public.workspaces; me public.profiles;
begin
  select * into me from public.profiles where id = auth.uid();
  select * into inv from public.invitations where token = p_token;
  if not found or inv.status <> 'pending' or inv.expires_at < now() then raise exception 'invalid_invitation'; end if;
  if lower(inv.email) <> lower(me.email) then raise exception 'email_mismatch'; end if;
  insert into public.workspace_members (workspace_id, user_id, role) values (inv.workspace_id, me.id, inv.role)
  on conflict (workspace_id, user_id) do update set role = excluded.role;
  update public.invitations set status = 'accepted', accepted_at = now() where id = inv.id;
  update public.profiles set last_workspace_id = inv.workspace_id where id = me.id;
  select * into ws from public.workspaces where id = inv.workspace_id;
  return ws;
end $$;

-- 12e. Today queue for the current user
create or replace function public.today_queue(p_workspace_id uuid, p_limit integer default 50)
returns setof public.people language sql stable security definer set search_path = public as $$
  select p.* from public.people p
  where p.workspace_id = p_workspace_id
    and public.is_member(p_workspace_id)
    and (p.owner_id = auth.uid() or p.owner_id is null)
    and p.do_not_call = false
    and p.mobile_e164 is not null
    and p.tps_status not in ('tps_listed','ctps_listed')
    and (p.next_call_at is null or p.next_call_at <= now())
    and not exists (select 1 from public.pipeline_stages s where s.id = p.stage_id and (s.is_won or s.is_lost))
  order by p.priority desc, p.next_call_at nulls last, p.last_called_at nulls first, p.created_at
  limit p_limit
$$;

-- ---------------------------------------------------------------------------
-- 13. Reporting views
-- ---------------------------------------------------------------------------
create view public.call_stats_daily
with (security_invoker = true) as
select workspace_id, user_id, (started_at at time zone 'Europe/London')::date as day,
       count(*) filter (where kind = 'standard' and direction = 'outbound')            as dials,
       count(*) filter (where outcome = 'connected' or outcome = 'meeting_booked')     as connects,
       count(*) filter (where outcome = 'meeting_booked')                              as meetings,
       sum(talk_seconds)                                                               as talk_seconds,
       sum(duration_seconds)                                                           as duration_seconds
from public.calls
group by workspace_id, user_id, (started_at at time zone 'Europe/London')::date;

create view public.workspace_seat_counts
with (security_invoker = true) as
select workspace_id, count(*) as seats from public.workspace_members group by workspace_id;

-- ---------------------------------------------------------------------------
-- 14. Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.workspaces          enable row level security;
alter table public.workspace_members   enable row level security;
alter table public.invitations         enable row level security;
alter table public.business_profiles   enable row level security;
alter table public.icp_profiles        enable row level security;
alter table public.subscriptions       enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.phone_numbers       enable row level security;
alter table public.industries          enable row level security;
alter table public.companies           enable row level security;
alter table public.contacts            enable row level security;
alter table public.tenant_companies    enable row level security;
alter table public.pipeline_stages     enable row level security;
alter table public.people              enable row level security;
alter table public.lists               enable row level security;
alter table public.list_members        enable row level security;
alter table public.saved_searches      enable row level security;
alter table public.dnc_entries         enable row level security;
alter table public.calls               enable row level security;
alter table public.recordings          enable row level security;
alter table public.notes               enable row level security;
alter table public.tasks               enable row level security;
alter table public.activities          enable row level security;
alter table public.imports             enable row level security;
alter table public.audit_log           enable row level security;

-- profiles: self, plus anyone sharing a workspace (for avatars/names)
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or exists (
    select 1 from public.workspace_members a join public.workspace_members b on a.workspace_id = b.workspace_id
    where a.user_id = auth.uid() and b.user_id = profiles.id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- workspaces (insert goes through create_workspace(); no direct insert policy)
create policy workspaces_select on public.workspaces for select to authenticated
  using (public.is_member(id));
create policy workspaces_update on public.workspaces for update to authenticated
  using (public.has_role(id, 'admin')) with check (public.has_role(id, 'admin'));
create policy workspaces_delete on public.workspaces for delete to authenticated
  using (public.has_role(id, 'owner'));

-- workspace_members
create policy members_select on public.workspace_members for select to authenticated
  using (public.is_member(workspace_id));
create policy members_update on public.workspace_members for update to authenticated
  using (public.has_role(workspace_id, 'admin') and role <> 'owner')
  with check (public.has_role(workspace_id, 'admin') and role <> 'owner');
create policy members_delete on public.workspace_members for delete to authenticated
  using ((public.has_role(workspace_id, 'admin') and role <> 'owner') or user_id = auth.uid());

-- invitations
create policy invitations_select on public.invitations for select to authenticated
  using (public.has_role(workspace_id, 'admin'));
create policy invitations_insert on public.invitations for insert to authenticated
  with check (public.has_role(workspace_id, 'admin') and invited_by = auth.uid());
create policy invitations_update on public.invitations for update to authenticated
  using (public.has_role(workspace_id, 'admin'));
create policy invitations_delete on public.invitations for delete to authenticated
  using (public.has_role(workspace_id, 'admin'));

-- generic tenant tables: members read and write
do $$
declare t text;
begin
  foreach t in array array['people','lists','list_members','notes','tasks','tenant_companies','calls','saved_searches']
  loop
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_member(workspace_id))', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.is_member(workspace_id))', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.is_member(workspace_id)) with check (public.is_member(workspace_id))', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.is_member(workspace_id))', t, t);
  end loop;
end $$;

-- admin-managed tenant tables: members read, admins write
do $$
declare t text;
begin
  foreach t in array array['business_profiles','icp_profiles','pipeline_stages','phone_numbers','dnc_entries','imports']
  loop
    execute format('create policy %I_select on public.%I for select to authenticated using (public.is_member(workspace_id))', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (public.has_role(workspace_id, ''admin''))', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (public.has_role(workspace_id, ''admin'')) with check (public.has_role(workspace_id, ''admin''))', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (public.has_role(workspace_id, ''admin''))', t, t);
  end loop;
end $$;

-- read-only for members; written only by service role / triggers
create policy subscriptions_select on public.subscriptions for select to authenticated using (public.is_member(workspace_id));
create policy credit_tx_select     on public.credit_transactions for select to authenticated using (public.is_member(workspace_id));
create policy recordings_select    on public.recordings for select to authenticated using (public.is_member(workspace_id));
create policy activities_select    on public.activities for select to authenticated using (public.is_member(workspace_id));
create policy audit_select         on public.audit_log for select to authenticated using (public.has_role(workspace_id, 'admin'));

-- global database: readable by any authenticated user; the browser only gets the masked view (grants below)
create policy industries_select on public.industries for select to authenticated using (true);
create policy companies_select  on public.companies  for select to authenticated using (true);
create policy contacts_select   on public.contacts   for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- 15. Grants (lock the raw contacts table away from the browser)
-- ---------------------------------------------------------------------------
revoke all on public.contacts from anon, authenticated;
grant select on public.contacts_public to authenticated;
grant select on public.companies, public.industries to authenticated;
grant execute on function public.reveal_contact(uuid, uuid, uuid)              to authenticated;
grant execute on function public.can_dial(uuid, uuid)                           to authenticated;
grant execute on function public.create_workspace(text, text, text, text)       to authenticated;
grant execute on function public.accept_invitation(text)                        to authenticated;
grant execute on function public.today_queue(uuid, integer)                     to authenticated;
revoke execute on function public.reveal_contact(uuid, uuid, uuid) from anon;

-- ---------------------------------------------------------------------------
-- 16. Storage buckets and policies (object path: {bucket}/{workspace_id}/...)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('recordings', 'recordings', false),
  ('imports',    'imports',    false),
  ('avatars',    'avatars',    true)
on conflict (id) do nothing;

create policy recordings_read on storage.objects for select to authenticated
  using (bucket_id = 'recordings' and public.is_member((storage.foldername(name))[1]::uuid));
create policy imports_rw on storage.objects for all to authenticated
  using (bucket_id = 'imports' and public.is_member((storage.foldername(name))[1]::uuid))
  with check (bucket_id = 'imports' and public.is_member((storage.foldername(name))[1]::uuid));
create policy avatars_read on storage.objects for select to public using (bucket_id = 'avatars');
create policy avatars_write on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- 17. Realtime
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.calls;
alter publication supabase_realtime add table public.people;
alter publication supabase_realtime add table public.tasks;

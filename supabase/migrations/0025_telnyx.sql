-- 0025: telephony moves from Twilio to Telnyx.
--
-- One Telnyx account serves every workspace (Telnyx numbers can only be presented as caller ID
-- from the account that owns them, so sub-accounts would break calling). Each purchased number is
-- tagged with its workspace; each rep gets a Telnyx telephony credential for browser calling.
-- Calls run through Telnyx Call Control: the browser's leg is parked, the telnyx-webhook function
-- dials the destination it looks up itself (never what the browser asks for), plays the
-- recording notice to the callee only, records, then bridges the two legs.
--
-- Provider-neutral names replace the Twilio ones. The old Twilio sub-account ids are kept in
-- legacy_twilio_accounts so the remaining Twilio number can still be released there.

-- ---------------------------------------------------------------------------
-- 1. Keep what is needed to wind Twilio down, then drop the Twilio columns
-- ---------------------------------------------------------------------------
create table if not exists public.legacy_twilio_accounts (
  workspace_id    uuid primary key references public.workspaces(id) on delete cascade,
  subaccount_sid  text,
  twiml_app_sid   text,
  api_key_sid     text,
  vault_secret_id uuid,
  account_mode    text,
  saved_at        timestamptz not null default now()
);
alter table public.legacy_twilio_accounts enable row level security;
revoke all on public.legacy_twilio_accounts from anon, authenticated;

insert into public.legacy_twilio_accounts (workspace_id, subaccount_sid, twiml_app_sid, api_key_sid, vault_secret_id, account_mode)
select id, twilio_subaccount_sid, twilio_twiml_app_sid, twilio_api_key_sid, twilio_secret_vault_id, twilio_account_mode
  from public.workspaces
 where twilio_subaccount_sid is not null or twilio_twiml_app_sid is not null or twilio_secret_vault_id is not null
on conflict (workspace_id) do nothing;

drop function if exists public.set_workspace_twilio_secret(uuid, jsonb);
drop function if exists public.get_workspace_twilio_secret(uuid);
alter table public.workspaces drop column if exists twilio_subaccount_sid;
alter table public.workspaces drop column if exists twilio_twiml_app_sid;
alter table public.workspaces drop column if exists twilio_api_key_sid;
alter table public.workspaces drop column if exists twilio_secret_vault_id;
alter table public.workspaces drop column if exists twilio_account_mode;

-- ---------------------------------------------------------------------------
-- 2. Numbers
-- ---------------------------------------------------------------------------
alter type public.phone_number_kind rename value 'twilio_local' to 'local';
alter type public.phone_number_kind rename value 'twilio_national' to 'national';
alter type public.phone_number_kind rename value 'twilio_mobile' to 'mobile';

alter table public.phone_numbers rename column twilio_sid to provider_id;            -- Telnyx phone number id
alter table public.phone_numbers rename column regulatory_bundle_sid to requirement_group_id;
alter table public.phone_numbers rename column address_sid to address_id;
alter table public.phone_numbers add column if not exists provider text not null default 'telnyx'
  check (provider in ('telnyx', 'twilio'));
alter table public.phone_numbers add column if not exists number_order_id text;
alter table public.phone_numbers add column if not exists status_detail text;          -- e.g. a reviewer's comment

-- the remaining Twilio number cannot be used from Telnyx: take it out of service here (it is still
-- rented on Twilio until released there)
update public.phone_numbers
   set provider = 'twilio', status = 'released', is_default = false, released_at = coalesce(released_at, now()),
       status_detail = 'Moved to Telnyx: this Twilio number is no longer used by Decibel. Release it in Twilio to stop its rental.'
 where kind <> 'verified_caller_id' and status <> 'released' and provider_id like 'PN%';
-- a Twilio-verified caller ID must be verified again with Telnyx before it can be presented
update public.phone_numbers
   set provider = 'twilio', status = 'released', is_default = false, released_at = coalesce(released_at, now()),
       status_detail = 'Verify this number again to use it as caller ID.'
 where kind = 'verified_caller_id' and status <> 'released' and provider_id like 'PN%';

-- ---------------------------------------------------------------------------
-- 3. Calls and recordings
-- ---------------------------------------------------------------------------
alter table public.calls rename column twilio_call_sid to provider_call_id;            -- the rep's (browser) leg
alter table public.calls rename column twilio_child_call_sid to provider_child_call_id; -- the PSTN / far leg
alter table public.calls add column if not exists call_session_id text;
alter table public.calls add column if not exists from_user_id uuid references public.profiles(id) on delete set null;
alter table public.calls add column if not exists practice boolean not null default false;   -- practice calls skip the setup-test greeting
create index if not exists calls_session_idx on public.calls (call_session_id) where call_session_id is not null;

alter table public.recordings rename column twilio_recording_sid to provider_recording_id;
alter table public.recordings rename column twilio_deleted_at to provider_deleted_at;

-- ---------------------------------------------------------------------------
-- 4. Browser calling credentials (one Telnyx telephony credential per rep)
-- ---------------------------------------------------------------------------
create table if not exists public.telnyx_credentials (
  user_id        uuid primary key references public.profiles(id) on delete cascade,
  credential_id  text not null unique,
  sip_username   text not null unique,
  created_at     timestamptz not null default now()
);
alter table public.telnyx_credentials enable row level security;
revoke all on public.telnyx_credentials from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Regulatory details for buying UK numbers (one requirement group per workspace and type)
-- ---------------------------------------------------------------------------
create table if not exists public.number_requirement_groups (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references public.workspaces(id) on delete cascade,
  phone_number_type  text not null check (phone_number_type in ('local', 'national', 'mobile')),
  telnyx_group_id    text not null unique,
  status             text not null default 'unapproved',   -- Telnyx: unapproved | pending-approval | approved | declined | expired
  business_name      text,
  status_detail      text,
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (workspace_id, phone_number_type)
);
alter table public.number_requirement_groups enable row level security;
drop policy if exists number_requirement_groups_read on public.number_requirement_groups;
create policy number_requirement_groups_read on public.number_requirement_groups
  for select to authenticated using (workspace_id in (select public.my_workspace_ids()));
revoke insert, update, delete, truncate on public.number_requirement_groups from authenticated;
revoke all on public.number_requirement_groups from anon;

-- ---------------------------------------------------------------------------
-- 6. Webhook de-duplication (Telnyx may deliver an event more than once, and out of order)
-- ---------------------------------------------------------------------------
create table if not exists public.telnyx_events (
  id           text primary key,
  event_type   text not null,
  received_at  timestamptz not null default now()
);
create index if not exists telnyx_events_received_idx on public.telnyx_events (received_at);
alter table public.telnyx_events enable row level security;
revoke all on public.telnyx_events from anon, authenticated;

-- claims an event id; false when it was already processed
create or replace function public.claim_telnyx_event(p_id text, p_type text)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  insert into public.telnyx_events (id, event_type) values (p_id, p_type);
  return true;
exception when unique_violation then
  return false;
end $$;
revoke execute on function public.claim_telnyx_event(text, text) from public, anon, authenticated;
grant  execute on function public.claim_telnyx_event(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. Housekeeping: every 10 minutes, follow pending number orders and requirement groups,
--    tidy stale calls and old webhook ids (the telnyx-sync function)
-- ---------------------------------------------------------------------------
select cron.unschedule(jobname) from cron.job where jobname = 'decibel-telnyx-sync';
select cron.schedule('decibel-telnyx-sync', '*/10 * * * *', $$select public.invoke_scheduled_function('telnyx-sync')$$);

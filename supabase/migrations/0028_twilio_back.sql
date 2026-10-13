-- 0028: telephony moves back from Telnyx to Twilio.
--
-- Undoes the schema side of 0025 so the Twilio functions run exactly as before: each workspace's
-- Twilio sub-account (kept in legacy_twilio_accounts, its vault secret untouched) is restored onto
-- the workspace, the Twilio column and enum names come back, and the Twilio number 0025 took out of
-- service is active again (it stayed rented on Twilio throughout). The Telnyx tables are left in
-- place, unused; the Telnyx housekeeping job stops.

-- ---------------------------------------------------------------------------
-- 1. Workspace Twilio sub-accounts
-- ---------------------------------------------------------------------------
alter table public.workspaces add column if not exists twilio_subaccount_sid  text unique;
alter table public.workspaces add column if not exists twilio_twiml_app_sid   text;
alter table public.workspaces add column if not exists twilio_api_key_sid     text;
alter table public.workspaces add column if not exists twilio_secret_vault_id uuid;
alter table public.workspaces add column if not exists twilio_account_mode    text not null default 'pending'
  check (twilio_account_mode in ('pending', 'subaccount', 'parent'));

update public.workspaces w
   set twilio_subaccount_sid  = l.subaccount_sid,
       twilio_twiml_app_sid   = l.twiml_app_sid,
       twilio_api_key_sid     = l.api_key_sid,
       twilio_secret_vault_id = l.vault_secret_id,
       twilio_account_mode    = coalesce(l.account_mode, 'pending')
  from public.legacy_twilio_accounts l
 where l.workspace_id = w.id;

-- vault helpers (service role only), as in 0003
create or replace function public.set_workspace_twilio_secret(p_workspace_id uuid, p_secret jsonb)
returns uuid language plpgsql security definer set search_path = public, vault as $$
declare sid uuid;
begin
  select twilio_secret_vault_id into sid from public.workspaces where id = p_workspace_id;
  if sid is null then
    sid := vault.create_secret(p_secret::text, 'twilio_ws_' || p_workspace_id::text, 'Decibel workspace Twilio credentials');
    update public.workspaces set twilio_secret_vault_id = sid where id = p_workspace_id;
  else
    perform vault.update_secret(sid, p_secret::text);
  end if;
  return sid;
end $$;

create or replace function public.get_workspace_twilio_secret(p_workspace_id uuid)
returns jsonb language sql stable security definer set search_path = public, vault as $$
  select s.decrypted_secret::jsonb
    from public.workspaces w
    join vault.decrypted_secrets s on s.id = w.twilio_secret_vault_id
   where w.id = p_workspace_id
$$;

revoke execute on function public.set_workspace_twilio_secret(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.get_workspace_twilio_secret(uuid)        from public, anon, authenticated;
grant  execute on function public.set_workspace_twilio_secret(uuid, jsonb) to service_role;
grant  execute on function public.get_workspace_twilio_secret(uuid)        to service_role;

-- ---------------------------------------------------------------------------
-- 2. Twilio names back on numbers, calls and recordings
-- ---------------------------------------------------------------------------
alter type public.phone_number_kind rename value 'local' to 'twilio_local';
alter type public.phone_number_kind rename value 'national' to 'twilio_national';
alter type public.phone_number_kind rename value 'mobile' to 'twilio_mobile';

alter table public.phone_numbers rename column provider_id to twilio_sid;
alter table public.phone_numbers rename column requirement_group_id to regulatory_bundle_sid;
alter table public.phone_numbers rename column address_id to address_sid;
alter table public.phone_numbers alter column provider set default 'twilio';

alter table public.calls rename column provider_call_id to twilio_call_sid;
alter table public.calls rename column provider_child_call_id to twilio_child_call_sid;

alter table public.recordings rename column provider_recording_id to twilio_recording_sid;
alter table public.recordings rename column provider_deleted_at to twilio_deleted_at;

-- ---------------------------------------------------------------------------
-- 3. The Twilio number(s) 0025 took out of service are live again; Telnyx numbers can't be used
-- ---------------------------------------------------------------------------
update public.phone_numbers
   set status = 'active', released_at = null, status_detail = null, updated_at = now()
 where provider = 'twilio' and status = 'released'
   and (status_detail like 'Moved to Telnyx%' or status_detail like 'Verify this number again%');

-- each workspace gets its default back when it has none
update public.phone_numbers p
   set is_default = true
 where p.id in (
   select distinct on (workspace_id) id
     from public.phone_numbers
    where provider = 'twilio' and status = 'active'
    order by workspace_id, (kind = 'verified_caller_id'), created_at
 )
   and not exists (select 1 from public.phone_numbers d where d.workspace_id = p.workspace_id and d.is_default);

update public.phone_numbers
   set status = 'released', is_default = false, released_at = coalesce(released_at, now()), updated_at = now(),
       status_detail = 'Decibel moved back to Twilio: this Telnyx number is no longer used. Release it in Telnyx to stop its rental.'
 where provider = 'telnyx' and status <> 'released';

-- ---------------------------------------------------------------------------
-- 4. Stop the Telnyx housekeeping job
-- ---------------------------------------------------------------------------
select cron.unschedule(jobname) from cron.job where jobname = 'decibel-telnyx-sync';

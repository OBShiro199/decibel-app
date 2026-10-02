-- =============================================================================
-- Decibel — 0006_cron_jobs.sql
-- Schedules the nightly Edge Functions with pg_cron + pg_net.
--   nightly       02:15 UTC  recording retention, onboarding reminders, invite expiry, stale calls
--   stripe-usage  02:45 UTC  report yesterday's call minutes to Stripe
-- The bearer secret is generated here and kept in Supabase Vault. It is never in
-- the repo or in env files; the functions verify it with verify_cron_secret().
-- =============================================================================

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'decibels_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'decibels_cron_secret', 'Bearer token for scheduled Edge Functions');
  end if;
end $$;

create or replace function public.verify_cron_secret(p_token text)
returns boolean language sql stable security definer set search_path = public, vault as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'decibels_cron_secret' and decrypted_secret = p_token)
$$;
revoke execute on function public.verify_cron_secret(text) from public, anon, authenticated;
grant  execute on function public.verify_cron_secret(text) to service_role;

-- calls a function with the vault secret; runs as the cron job owner
create or replace function public.invoke_scheduled_function(p_name text)
returns bigint language plpgsql security definer set search_path = public, vault, extensions as $$
declare token text; base text := 'https://fkjwglvztyyerewldnty.supabase.co/functions/v1/';
begin
  select decrypted_secret into token from vault.decrypted_secrets where name = 'decibels_cron_secret';
  return net.http_post(
    url := base || p_name,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;
revoke execute on function public.invoke_scheduled_function(text) from public, anon, authenticated;

select cron.unschedule(jobname) from cron.job where jobname in ('decibel-nightly', 'decibel-stripe-usage');
select cron.schedule('decibel-nightly', '15 2 * * *', $$select public.invoke_scheduled_function('nightly')$$);
select cron.schedule('decibel-stripe-usage', '45 2 * * *', $$select public.invoke_scheduled_function('stripe-usage')$$);

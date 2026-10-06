-- 0014: low-credit emails, at the same points the sidebar's credits bar changes colour.
--
--   low: the balance drops below 20% of everything the workspace has received
--   out: the balance reaches zero
--
-- A statement-level trigger on the ledger checks each affected workspace once per insert
-- (a bulk reveal of 500 rows is one check), after the row triggers have updated the balance.
-- Crossing a line asks the `credit-alerts` function to email the workspace's owners and
-- admins through pg_net, which only sends once the transaction commits. Each email goes once
-- per dip; adding credits back above the line re-arms it.

create table public.credit_alerts (
  workspace_id  uuid primary key references public.workspaces(id) on delete cascade,
  low_sent_at   timestamptz,
  out_sent_at   timestamptz
);
alter table public.credit_alerts enable row level security;
revoke all on public.credit_alerts from anon, authenticated;

-- "everything received" is the sum of the ledger's credits; this keeps that sum cheap
create index if not exists credit_transactions_ws_credits_idx
  on public.credit_transactions (workspace_id) include (delta) where delta > 0;

create or replace function public.check_credit_alerts()
returns trigger
language plpgsql
security definer
set search_path = public, vault, extensions
as $$
declare
  ws uuid;
  bal integer;
  granted bigint;
  alert public.credit_alerts%rowtype;
  level text;
  token text;
begin
  for ws in select distinct workspace_id from new_rows loop
    select credit_balance into bal from public.workspaces where id = ws;
    if bal is null then continue; end if;
    select coalesce(sum(delta), 0) into granted from public.credit_transactions where workspace_id = ws and delta > 0;
    if granted <= 0 then continue; end if;

    insert into public.credit_alerts (workspace_id) values (ws) on conflict do nothing;
    select * into alert from public.credit_alerts where workspace_id = ws for update;

    -- topped back up: re-arm the emails
    if bal > 0 and alert.out_sent_at is not null then
      update public.credit_alerts set out_sent_at = null where workspace_id = ws;
    end if;
    if bal >= granted * 0.2 and alert.low_sent_at is not null then
      update public.credit_alerts set low_sent_at = null where workspace_id = ws;
    end if;

    level := null;
    if bal <= 0 and alert.out_sent_at is null then
      level := 'out';
      update public.credit_alerts set out_sent_at = now(), low_sent_at = coalesce(low_sent_at, now()) where workspace_id = ws;
    elsif bal > 0 and bal < granted * 0.2 and alert.low_sent_at is null then
      level := 'low';
      update public.credit_alerts set low_sent_at = now() where workspace_id = ws;
    end if;

    if level is not null then
      select decrypted_secret into token from vault.decrypted_secrets where name = 'decibels_cron_secret';
      if token is not null then
        perform net.http_post(
          url := 'https://fkjwglvztyyerewldnty.supabase.co/functions/v1/credit-alerts',
          headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || token),
          body := jsonb_build_object('workspace_id', ws, 'level', level, 'balance', bal, 'granted', granted),
          timeout_milliseconds := 30000
        );
      end if;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.check_credit_alerts() from public, anon, authenticated;

drop trigger if exists credit_alerts_check on public.credit_transactions;
create trigger credit_alerts_check
  after insert on public.credit_transactions
  referencing new table as new_rows
  for each statement execute function public.check_credit_alerts();

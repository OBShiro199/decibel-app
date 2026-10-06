-- 0013: "come back" email for people who have not used Decibel for two days.
--
-- profiles.last_seen_at is touched by the app (touch_last_seen, at most every 10 minutes).
-- The hourly `lifecycle-emails` function claims everyone whose last visit is more than
-- 48 hours old and who has not had a come-back email since that visit, so each lapse
-- produces one email and someone who never returns is not emailed again. Accounts quiet
-- for over 30 days are left alone. Anyone can opt out from the link in the email.

alter table public.profiles add column if not exists last_seen_at timestamptz;
alter table public.profiles add column if not exists comeback_email_sent_at timestamptz;
alter table public.profiles add column if not exists email_opt_out_at timestamptz;

-- start from each account's last sign-in so existing users are not treated as brand new
update public.profiles p
   set last_seen_at = coalesce(u.last_sign_in_at, u.created_at)
  from auth.users u
 where u.id = p.id and p.last_seen_at is null;

create index if not exists profiles_last_seen_idx on public.profiles (last_seen_at);

create or replace function public.touch_last_seen()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles set last_seen_at = now()
   where id = auth.uid() and (last_seen_at is null or last_seen_at < now() - interval '10 minutes');
$$;
revoke all on function public.touch_last_seen() from public, anon;
grant execute on function public.touch_last_seen() to authenticated;

-- service role only: marks up to p_limit people as emailed and returns who to email
create or replace function public.claim_comeback_emails(p_limit int default 200)
returns table (user_id uuid, email text, full_name text, credit_balance numeric)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select p.id
      from public.profiles p
     where p.email_opt_out_at is null
       and p.last_seen_at < now() - interval '48 hours'
       and p.last_seen_at > now() - interval '30 days'
       and (p.comeback_email_sent_at is null or p.comeback_email_sent_at < p.last_seen_at)
     order by p.last_seen_at
     limit p_limit
     for update skip locked
  ), claimed as (
    update public.profiles p set comeback_email_sent_at = now()
      from due where p.id = due.id
    returning p.id, p.email::text, p.full_name, p.last_workspace_id
  )
  select c.id, c.email, c.full_name, coalesce(w.credit_balance, 0)::numeric
    from claimed c
    left join public.workspaces w on w.id = c.last_workspace_id;
end;
$$;
revoke all on function public.claim_comeback_emails(int) from public, anon, authenticated;

select cron.schedule('decibel-lifecycle-emails', '20 * * * *', $$select public.invoke_scheduled_function('lifecycle-emails')$$);

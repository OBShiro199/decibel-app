-- 0012: belt and braces for 0011. RLS already blocks these writes (there are no write
-- policies), but signed-in users should not hold the privileges either: support rows are
-- written only by the `support` Edge Function, and the log tables only by the service role.
revoke insert, update, delete, truncate on public.support_threads, public.support_messages from authenticated;
revoke all on public.support_admin_logins, public.email_log from authenticated, anon;

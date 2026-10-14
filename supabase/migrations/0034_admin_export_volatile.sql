-- 0034: admin_export_leads writes an audit row, so it must be volatile (0033 declared it stable,
-- which Postgres rejects at the INSERT).
alter function public.admin_export_leads(uuid, uuid[]) volatile;

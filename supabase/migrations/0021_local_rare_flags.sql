-- 0021: rare "missing" flags on local listings (almost every listing has a website and phone),
-- so asking for the few without one is an index lookup instead of a full scan.
create index if not exists local_search_no_website_idx on public.local_search (place_id) where not has_website;
create index if not exists local_search_no_phone_idx   on public.local_search (place_id) where not has_phone;
create index if not exists lead_search_no_email_idx    on public.lead_search (contact_id) where not has_email;

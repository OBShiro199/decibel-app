# Lead search on Typesense

Leads are searched on a Typesense server (Hetzner CAX21, Falkenstein, `https://2-31-47-40.sslip.io`)
instead of Postgres. `data_list` in Supabase stays the source of truth: Typesense returns matching ids
and exact counts; the app fetches each page's full rows (masked or revealed contact details, DNC flags)
from Supabase as before.

- `leads-schema.json`: the collection. Exact-match values (country, industry, seniority…) are crc32
  numbers (`*_h` fields), about a sixth of the memory of text. Roughly 1.6 KB per lead, so ~4 GB for 2.5M.
- `load-leads.py`: streams `search_export.leads` (read-only view, no phone numbers or emails) into a new
  collection, then swaps the `leads` alias, so reloads never interrupt search. Stops above 6 GB of memory.

Server layout (`/opt/typesense`, root only): `docker-compose.yml` (Typesense 30.2 on 127.0.0.1:8108,
Caddy 2.10.2 on 443 with Let's Encrypt), `.env` (API key), `reader.env` (read-only database login
`decibel_search_reader`, can only select from `search_export.leads`). SSH is key-only (`~/.ssh/decibel_search`).
Supabase secrets: `TYPESENSE_URL`, `TYPESENSE_API_KEY`.

Run a load by hand on the server: `cd /opt/typesense && python3 load-leads.py --max-rate 4000`
(run it at night: it reads all of data_list).

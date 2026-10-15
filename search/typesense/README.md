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
The Typesense service sets `ulimits: nofile: 1048576` (soft and hard): with Docker's default of 1024 open
files, a snapshot at 3.1M leads failed with "Too many open files" and the node went into an error state
(search down) on 2026-10-15.
Supabase secrets: `TYPESENSE_URL`, `TYPESENSE_API_KEY`.

New leads reach search automatically: a systemd timer (`decibel-leads-nightly`) runs
`load-leads.py --in-place --max-rate 1500` at 01:00 UTC, adding new leads and refreshing existing ones in
the live collection (log: `/var/log/decibel-leads-nightly.log`). To send them over straight away after an
import, on the server: `cd /opt/typesense && python3 load-leads.py --in-place --max-rate 1500` (~30 min,
read-only on Supabase; the app stayed fast at this rate). Quicker after an import: put the new contact_ids (one per line,
e.g. the first column of the CSVs) in a file on the server and run `python3 load-leads.py --ids-file ids.txt`,
which looks them up 1,000 at a time by index (87k leads in about 2 minutes, no full read of data_list). A full rebuild into a fresh collection (drops
leads deleted from data_list) is the same command without `--in-place`; it briefly needs twice the memory.

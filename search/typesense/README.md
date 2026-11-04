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

## US leads (separate project)

The US leads (`us_data_list`, scraped from Blitz) are **not** part of Decibel. They have their own collection behind the
alias `us_leads`, built from the view `search_export.leads_us` (migration 0046, same shape as `search_export.leads`):

    python3 load-leads.py --view search_export.leads_us --alias us_leads --max-rate 1500

The loader only accepts `--view search_export.leads --alias leads` or `--view search_export.leads_us --alias us_leads`, so the
two can never mix. The nightly top-up (`decibel-leads-nightly`) is unchanged and only touches `leads`. Run US loads at night;
the 1.35M US leads add about 1.3 GB of Typesense memory.

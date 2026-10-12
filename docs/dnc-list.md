# DNC list

A workspace's own do-not-call numbers, at `/app/dnc` (sidebar, Outbound section). Numbers on the list can never be dialled, and nobody with one of them can be added: not a person, a revealed lead or a saved local business. The database enforces all of this (migrations `0026_dnc_list.sql` and `0027_dnc_counts.sql`), so every path is covered, including ones the UI doesn't know about.

## Adding numbers

| Way | Limit | Source tag |
| --- | --- | --- |
| Upload a file (CSV, XLSX, TSV, TXT with a header row) | 200,000 rows, 20 MB | Upload |
| Paste numbers (one per line, or commas/semicolons) | 200,000 | Pasted |
| Add one number | 1 | Added |
| From a TPS/CTPS check ("Add do-not-call rows to DNC list") | the check's rows | TPS check |
| A call outcome of do not call (existing behaviour) | 1 | From a call |

Uploads pick the phone column automatically and, if there is one, a name or company column (stored as the entry's label). A reason applies to every number in an upload. The browser sends numbers in chunks of 5,000 under one upload record (`dnc_import_begin` → `dnc_add` × n → `dnc_import_finish`) and shows progress. Recent uploads lists each one with added / already listed / invalid counts. Anyone in the workspace can add; a user can start up to 30 uploads an hour.

Numbers are normalised to E.164 by the database (`dnc_e164`: UK formats like `07…`, `0044…`, `+44 (0)…` and any valid international number). Rows that aren't phone numbers count as invalid; numbers already listed count as duplicates.

## Removing numbers

Owners and admins only (`dnc_remove`). Removing a number un-flags people with that mobile, unless their last call outcome was do not call.

## Where the list is enforced

| Place | What happens |
| --- | --- |
| `people` insert or number change | `people_before_write` raises `dnc_listed: +44… is on your DNC list`; the app shows it in plain words (`explainDnc`) in Quick call, Add person and person edit |
| Adding a number | People already holding it are set to `do_not_call` |
| `can_dial` / `can_dial_for` | DNC is checked first, reason `dnc_list` ("On your DNC list") |
| `telnyx-call` | Test and direct calls to a listed number are refused with `blocked: dnc_list` |
| CSV import of people (`import-csv`) | Rows whose mobile or direct dial is listed are skipped and counted (`imports.dnc_skipped_count`) |
| Lead search and reveal | `search_leads` returns `on_dnc`; the row shows a DNC tag; `reveal_leads` skips those leads and doesn't charge for them |
| Local businesses | `search_local` returns `on_dnc`; the phone is struck through; saving to a list leaves listed numbers out (`dnc_check`) |
| Power dialler / Save as list / Export counts | DNC rows are left out with a toast linking to the DNC list |

## Tests

```
SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @decibels/web test:dnc
SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @decibels/web test:dnc-ui http://localhost:3005
```

`test:dnc` (30 checks) covers the RPCs, limits, normalisation, every enforcement point and workspace isolation. `test:dnc-ui` (28 checks) drives the page in headless Chrome with a 12,000-row upload, paste, single add, search, paging, removal, the settings link and the warnings on Leads, Quick call, Add person and the softphone; it needs `NEXT_PUBLIC_E2E=1`.

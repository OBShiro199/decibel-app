# TPS/CTPS checks

Members upload a list (CSV, XLSX, TSV or TXT, up to 1,000 rows with a header row). Decibel checks every UK number in the chosen column against the TPS and Corporate TPS registers and gives the file back with four extra columns:

| Column | Values |
|---|---|
| TPS status | `VALID`, `DNC (TPS)`, `DNC (CTPS)`, `DNC (TPS + CTPS)`, `INVALID NUMBER`, `NOT UK (NOT CHECKED)`, `NO NUMBER`, `NOT CHECKED` |
| TPS registered | Date the number joined TPS, when known |
| CTPS registered | Date the number joined CTPS, when known |
| Checked on | Date of the check (results are treated as good for 28 days) |

The page lives at `/app/tps` (sidebar, Outbound section). Members can follow a check live, filter the results, and download the whole file or just the valid or do-not-call rows, as CSV or Excel. They can also re-download or delete any past check from Recent checks.

## Credits

- Every account gets **2,500 check credits once**. They are separate from the 5,000 data (reveal) credits.
- **1 credit per unique UK number** in a file. Duplicates are checked once. Blank, invalid and non-UK numbers are free.
- A number the workspace checked in the **last 28 days** is reused for free and keeps its original check date.
- Credits are **reserved when a check starts** and settled when it ends. Anything that did not produce a result is **refunded automatically**: invalid numbers, cancelled checks, and checks that stopped because the provider was unreachable.
- **Top up** opens the founder chat and sends: "Hi, I'd like to top-up my TPS/CTPS number check credits." There is no Stripe yet, so grant credits by hand in the Supabase SQL editor:

  ```sql
  select public.tps_grant_credits('<workspace id>', 1000, 'topup-2026-10-08-acme', 'Top-up by email');
  ```

  The reference must be unique, so running the same grant twice fails instead of doubling it. A negative amount records an adjustment.

## How it works

```
browser ── tps_quote ───────────► exact cost, nothing charged
browser ── tps_create_job ──────► stores rows, works out unique numbers, reserves credits
                                  └─ pg_net (after commit) ─► tps-check Edge Function
tps-check: tps_claim (20 at a time, SKIP LOCKED) → Provero ×6 in parallel → tps_save → … → tps_finish_job (refund)
pg_cron every minute: tps_sweep_kick → tps-check {} → tps_sweep resumes any check whose worker went quiet
browser polls tps_jobs (700 ms) and the latest answers while a check runs; tps_job_results when it ends
```

- **Migration:** `supabase/migrations/0023_tps_checks.sql`
- **Worker:** `supabase/functions/tps-check/index.ts`. It only accepts the vault cron secret or the service role key. It hands over to a fresh invocation after 100 s, and on a 401/402 from the provider it stops the check, refunds it and emails `SUPPORT_INBOX_EMAIL`.
- **Page:** `apps/web/components/app/tps-checks.tsx`
- **Parsing and downloads:** `apps/web/lib/tps.ts`
- **Excel:** `read-excel-file` (pinned to 9.3.10) and `write-excel-file`, both loaded only when used.

### Tables

| Table | What it holds |
|---|---|
| `tps_credit_transactions` | Append-only ledger: `welcome`, `reserve`, `refund`, `topup`, `adjustment`. It drives `workspaces.tps_credit_balance`. |
| `tps_jobs` | One row per uploaded file: status, counters and credits reserved/refunded. |
| `tps_job_rows` | The uploaded rows (cells as a JSON array), the raw phone cell, the normalised number and its kind (`uk`, `not_uk`, `invalid`, `missing`). |
| `tps_job_numbers` | The unique numbers to check, which are the unit of work and of charge. Status runs `pending → checking → done / invalid / error`, or `skipped` when a check is cancelled. |

### Reading phone numbers

`public.tps_classify(text)` accepts all of these:

- `07…`, `+44 7…`, `0044 7…`, `44 7…`, `+44 (0)7…` and `+44 07…`
- spaces, dots, dashes and brackets, and an extension at the end
- UK numbers whose leading 0 a spreadsheet dropped (`7…`, `1…`)

A UK number is `+44` followed by 9 or 10 digits starting 1, 2, 3, 7 or 8. Other international numbers are `not_uk` and are never sent to the provider. Cells containing letters, such as `4.47E+11` or `n/a`, are `invalid`.

## Guarantees (enforced in the database)

1. Check credits move only through the ledger. Rows cannot be updated, deleted or truncated (not even by the service role). The balance changes only as a side effect of a ledger insert, and a check constraint stops it going below zero. `tps_ledger_check()` lists any workspace whose balance differs from its ledger, and it should always return nothing.
2. Browsers cannot write the ledger, balances, jobs, rows or results. Members can call only `tps_quote`, `tps_create_job`, `tps_cancel_job`, `tps_delete_job` and `tps_job_results`. The worker functions are service role only.
3. A check reserves its whole cost under the workspace row lock, so two uploads at once cannot overspend. If the balance is too low, nothing is saved or charged.
4. Workers claim numbers with `FOR UPDATE SKIP LOCKED`, and `tps_save` writes only numbers still in `checking`. Two workers on one check therefore never double-check or double-charge, and a refund can happen only once per check (unique index on job + reason).
5. The welcome grant is claimed by a single UPDATE on `profiles.tps_credits_granted_at`. Extra workspaces, or deleting and recreating one, give nothing.
6. Limits: 1,000 rows, 200 columns and 2 MB per file; text cells only; 3 running checks per workspace; 30 uploads per user per hour.
7. Uploaded rows are personal data. They are visible only to the workspace, a member can delete a check, and rows are purged 90 days after a check ends (pg_cron `decibel-tps-purge`). The ledger keeps the credit history.

## Operations

- **Secret:** `PROVERO_API_KEY`, stored in Supabase secrets and the gitignored `supabase/functions/.env`. It is never committed, because the repo is public.
- **Provider:** Provero (`POST https://api.provero.io/api/validate/phone-tps`). It costs about £0.004 per check. A batch of 5 numbers takes about 2–3 s, and 1,000 numbers take a few minutes.
- **Provider balance:** keep it topped up in Provero. If it runs out, running checks stop, users are refunded, and you get an email saying "TPS/CTPS checks are paused".
- **Stuck checks:** the sweeper resumes any check whose worker has been silent for 45 s. A number gets 3 attempts before it is marked not checked (and refunded).

## Tests

```bash
cd apps/web
export SUPABASE_SERVICE_ROLE_KEY=$(supabase projects api-keys --project-ref fkjwglvztyyerewldnty -o json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).find(k=>k.name==="service_role").api_key))')
pnpm test:tps                                # credits, attacks, real checks in batches of 5 (44 checks)
pnpm test:tps-ui http://localhost:3005       # the page in headless Chrome against a production build (24 checks)
```

Both use the sample leads at `~/Downloads/decibel-leads-2026-10-08.csv`, or pass another path as the last argument. Each run makes about a dozen real Provero checks (a few pence). The UI test intercepts the support chat, so Top up never emails anyone.

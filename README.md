# Decibel

Turn up your outbound. A multi-tenant SaaS for UK/EU B2B teams: a lead database with credit-based mobile reveals, a browser dialler on Telnyx, and an Attio-style pipeline.

```
apps/web/                 Next.js 15 app (marketing, auth, onboarding, /app)
packages/design-tokens/   CSS variables + Tailwind preset (PRD section 12)
supabase/migrations/      0001 schema, 0002 seed, 0003 app support
supabase/functions/       Edge Functions (Telnyx calling and numbers, Stripe, email, import, nightly)
scripts/                  deploy-supabase.sh
docs/                     feature docs (tps-checks.md: TPS/CTPS list checks)
```

## Run it locally

```bash
pnpm install
pnpm dev
```

The app reads `apps/web/.env.local` (Supabase URL + publishable key). Open http://localhost:3000.

## Deploy the backend

The web app works against the database as soon as migration `0003_app_support.sql` is applied. Calling, number purchase, invites by email, CSV import and billing also need the Edge Functions.

```bash
supabase login
bash scripts/deploy-supabase.sh
```

The script links the project, pushes secrets from `supabase/functions/.env` (gitignored), deploys all functions and applies `0003`. If you prefer the SQL editor, paste `supabase/migrations/0003_app_support.sql` and run it; it is safe to run more than once.

### Secrets (`supabase/functions/.env`)

| Secret | Needed for |
| --- | --- |
| `TELNYX_API_KEY` | All calling, numbers, recordings and the free phone checker |
| `TELNYX_CC_APP_ID`, `TELNYX_CREDENTIAL_CONNECTION_ID`, `TELNYX_OVP_ID` | Printed by `node scripts/telnyx-setup.mjs`, which creates them (see [docs/telephony.md](docs/telephony.md)) |
| `TELNYX_PUBLIC_KEY` | Webhook signature checks (Telnyx portal > Keys & credentials > Public key). Without it, webhooks are confirmed against the Telnyx API instead |
| `APP_URL` | Links in emails and Stripe return URLs |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `STRIPE_METER_EVENT_NAME` | Billing. Without them the UI says billing is not connected |
| `RESEND_API_KEY`, `EMAIL_FROM` | Invite and number-status emails. Without it invite links are shown for copying |
| `CRON_SECRET` | Bearer token for the scheduled functions |

### Webhooks to register

| Service | URL |
| --- | --- |
| Stripe | `https://<project>.supabase.co/functions/v1/stripe-webhook` (events: `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`) |
| Telnyx | Nothing to do. `scripts/telnyx-setup.mjs` points the Call Control app and the browser-calling connection at `telnyx-webhook` |

### Scheduled jobs

Run `stripe-usage` and `nightly` once a day (Supabase Dashboard > Integrations > Cron, or `pg_cron` + `pg_net`) with header `Authorization: Bearer <CRON_SECRET>`.

## How a call flows

Full detail, setup and operations: [docs/telephony.md](docs/telephony.md).

1. The rep clicks Call. `telnyx-call` runs every check (membership, `can_dial_for()`: DNC, TPS, minutes, trial), picks the caller ID and writes the `calls` row with the number stored on the person. A blocked call stops here with its reason.
2. The browser (Telnyx WebRTC SDK, logged in with a token from `telnyx-token`) places its leg with the call id in a SIP header. Telnyx parks it: it never goes where the browser asked.
3. `telnyx-webhook` sees the parked leg, checks the call id is fresh, unused and belongs to that rep, and dials the stored number from the Call Control app, recording from answer when the workspace records.
4. When the callee answers, the recording notice is spoken to them only; then the two legs are bridged. The notice is at the start of the recording.
5. Hang-ups on either side end the other leg and settle the row (status, cause, duration). The recording is copied to the private `recordings` bucket and deleted from Telnyx.
6. The rep picks an outcome. Database triggers roll it up onto the person, write the activity, move the pipeline stage and add do-not-call numbers to the DNC list.

## Edge Functions

| Function | Caller | Purpose |
| --- | --- | --- |
| `telnyx-token` | App | Login token for the browser SDK, from the rep's own telephony credential |
| `telnyx-call` | App | Authorise a call before anything rings and write its row |
| `telnyx-webhook` | Telnyx | Every call event: dial, notice, bridge, inbound routing, voicemail, recordings |
| `telnyx-numbers` | App (admin) | Search, buy, business details and documents, caller-ID verification, default, assign, release |
| `telnyx-sync` | Cron (10 min) | Activate approved numbers, refresh reviews, tidy stale calls |
| `billing` | App | Stripe Checkout, credit packs, Customer Portal, seat sync, invoices |
| `stripe-webhook` | Stripe | Subscriptions, plan, credit grants |
| `stripe-usage` | Cron | Report call minutes to Stripe metered billing |
| `import-csv` | App (admin) | Import people from an uploaded CSV with dedupe and TPS check |
| `send-email` | App (admin) | Invite emails through Resend |
| `nightly` | Cron | Recording retention, onboarding reminders, expire invites |

All functions run with `verify_jwt = false` and authenticate themselves: user JWT via `auth.getUser()`, Telnyx's Ed25519 signature, `Stripe-Signature`, or `CRON_SECRET`.

## Not legal advice

The compliance features (TPS/CTPS blocking, DNC list, recording notice, LIA template) describe how the product behaves. Have a UK data-protection lawyer review the legal pages, which are marked as drafts, before launch.

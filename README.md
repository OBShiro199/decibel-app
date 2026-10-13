# Decibel

Turn up your outbound. A multi-tenant SaaS for UK/EU B2B teams: a lead database with credit-based mobile reveals, a browser dialler on Twilio, and an Attio-style pipeline.

```
apps/web/                 Next.js 15 app (marketing, auth, onboarding, /app)
packages/design-tokens/   CSS variables + Tailwind preset (PRD section 12)
supabase/migrations/      0001 schema, 0002 seed, 0003 app support
supabase/functions/       Edge Functions (Twilio, Stripe, email, import, nightly)
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
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | All calling. Parent account; each workspace gets a subaccount whose credentials live in Supabase Vault |
| `TWILIO_USE_SUBACCOUNTS` | `true` by default. Set `false` to run every workspace on the parent account |
| `APP_URL` | Links in emails and Stripe return URLs |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `STRIPE_METER_EVENT_NAME` | Billing. Without them the UI says billing is not connected |
| `RESEND_API_KEY`, `EMAIL_FROM` | Invite and number-status emails. Without it invite links are shown for copying |
| `CRON_SECRET` | Bearer token for the scheduled functions |

### Webhooks to register

| Service | URL |
| --- | --- |
| Stripe | `https://<project>.supabase.co/functions/v1/stripe-webhook` (events: `checkout.session.completed`, `customer.subscription.*`, `invoice.paid`) |
| Twilio | Nothing to do. The TwiML App, number voice URLs and bundle callbacks are set by the functions when a workspace is provisioned |

### Scheduled jobs

Run `stripe-usage` and `nightly` once a day (Supabase Dashboard > Integrations > Cron, or `pg_cron` + `pg_net`) with header `Authorization: Bearer <CRON_SECRET>`.

## How a call flows

1. The rep clicks Call. The browser runs `can_dial()` (DNC, TPS, minutes) and stops with the reason if blocked.
2. `twilio-token` verifies the user and workspace, provisions the workspace's Twilio subaccount, TwiML App and API key on first use, and returns a 1-hour Voice access token.
3. `device.connect()` makes Twilio call `twilio-voice`. It validates the signature, repeats the dial check server-side with `can_dial_for()`, inserts the `calls` row, and returns TwiML that dials the number stored on the person (never the number sent by the browser).
4. If recording is on, the notice is whispered to the callee when they answer, so they hear it and it is captured at the start of the recording.
5. `twilio-status` moves the row through ringing, in progress and completed. `twilio-recording` copies the MP3 to the private `recordings` bucket and deletes it from Twilio.
6. The rep picks an outcome. Database triggers roll it up onto the person, write the activity, move the pipeline stage and add do-not-call numbers to the DNC list.

## Edge Functions

| Function | Caller | Purpose |
| --- | --- | --- |
| `twilio-token` | App | Mint Voice access token (60/min per user) |
| `create-twilio-subaccount` | App | Provision Twilio for a new workspace |
| `twilio-voice` | Twilio | TwiML for outbound calls, DNC/TPS check, call row |
| `twilio-status` | Twilio | Call status callbacks |
| `twilio-recording` | Twilio | Copy recording to Storage, delete from Twilio |
| `twilio-inbound` | Twilio | Ring the assigned member's browser, then voicemail |
| `twilio-numbers` | App (admin) | Search, buy, regulatory bundle, caller-ID verification, default, release |
| `twilio-bundle-status` | Twilio | Bundle approved or rejected, buy the number, email the owner |
| `billing` | App | Stripe Checkout, credit packs, Customer Portal, seat sync, invoices |
| `stripe-webhook` | Stripe | Subscriptions, plan, credit grants |
| `stripe-usage` | Cron | Report call minutes to Stripe metered billing |
| `import-csv` | App (admin) | Import people from an uploaded CSV with dedupe and TPS check |
| `send-email` | App (admin) | Invite emails through Resend |
| `nightly` | Cron | Recording retention, onboarding reminders, expire invites |

All functions run with `verify_jwt = false` and authenticate themselves: user JWT via `auth.getUser()`, `X-Twilio-Signature`, `Stripe-Signature`, or `CRON_SECRET`.

## Not legal advice

The compliance features (TPS/CTPS blocking, DNC list, recording notice, LIA template) describe how the product behaves. Have a UK data-protection lawyer review the legal pages, which are marked as drafts, before launch.

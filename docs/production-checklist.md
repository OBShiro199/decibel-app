# Production checklist

What stands between Decibel and selling Pro at £149 a month, as of 26 October 2026. Ticked items are done.
The offer itself (no trial, 3-day setup, 1,000 minutes then 5p, 300 visitor identifications) is defined in
`apps/web/lib/constants.ts`; the country-priced test page lives in `apps/web/lib/regional-pricing.ts`.

## 1. Billing (biggest piece)

Stripe Checkout, the webhook, the customer portal and nightly minute metering already exist
(`supabase/functions/billing`, `stripe-webhook`, `stripe-usage`).

- [ ] Create the £149/month price in Stripe and set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_GROWTH_MONTHLY` as Supabase secrets
- [ ] Decide per workspace or per seat (checkout currently bills one seat per member)
- [ ] Paywall: sign up → pay → app unlocks; unpaid or `past_due` workspaces see a billing screen (today only calling stops when the 14-day trial ends)
- [ ] Remove the 5,000 welcome credits for new accounts; paid workspaces get the whole database
- [ ] Minutes: 1,000 a month reset on the billing date; past that, report usage to the Stripe meter at 5p a minute (today a card on file means unlimited)
- [ ] Website visitor identifications: count per workspace per month and stop at 300
- [ ] Emails: payment failed, subscription cancelled, minutes nearly used

## 2. Features the pricing promises

- [ ] Call transcription (recordings are stored in the `recordings` bucket; `calls.transcript` exists, unused)
- [ ] AI call analysis: summary, score and coaching notes per call, plus a per-rep view
- [ ] Analytics: add visitor and AI-score panels to the dashboard (calls, connects, meetings and talk time already exist)
- [x] Recording retention: the site says 1 year on Pro; `nightly` deletes after 365 days on growth (Pro's tier)

## 3. Telephony go-live

- [ ] Set `TEST_ROUTING = false` in `apps/web/lib/dialler.ts`
- [ ] Manual check on a real phone: outbound, inbound, recording, voicemail
- [ ] Decide on the 31 empty test Twilio sub-accounts (closing is irreversible)

## 4. Monitoring

- [ ] Error reporting (Sentry or similar) in the web app and the edge functions
- [ ] Uptime checks: usedecibel.com, the Supabase API, the search server (2.31.47.40)
- [ ] Set `NEXT_PUBLIC_POSTHOG_KEY` so product analytics records anything
- [x] Friendly error pages (root, global and in-app) with an error reference

## 5. Tests and security

- [x] GitHub Actions type-check the web app and every edge function on each push (`.github/workflows/checks.yml`)
- [ ] Run the existing suites in CI too (they need a service-role key as a GitHub secret)
- [ ] Extend `test:isolation` to the newer tables: `visitor_*`, `dnc_entries`, enrichment tables
- [ ] Rewrite `test:credits` for the paid model once billing changes
- [x] Security headers: nosniff, referrer policy, same-origin framing, microphone only on our own pages
- [ ] Content Security Policy (needs a tested allow-list for Twilio, Stripe, PostHog, Supabase)

## 6. Onboarding

- [ ] Payment as the first step, then a "your 3-day setup" checklist
- [ ] A step for the website visitor snippet
- [ ] Confirm "email confirmation required" is on in Supabase Auth

## 7. Emails

- [x] Invite, welcome, first export, come-back, low credits, visitor alert, password reset
- [x] Per-person switch for visitor alerts (Settings › General › Emails)
- [ ] Billing emails (above) and an "account ready" email at the end of the setup

# Telephony (Telnyx)

Decibel calls, numbers, recordings and the free phone checker run on Telnyx (moved from Twilio on 2026-10-11, migration `0025_telnyx.sql`). The browser never holds Telnyx credentials and never chooses who is called.

## Architecture

```
browser (Telnyx WebRTC SDK)                Supabase Edge Functions                    Telnyx
──────────────────────────                 ───────────────────────                    ──────
telnyx-token  ────────────────────────────▶ mint a JWT from the rep's own credential ─▶ /telephony_credentials/{id}/token
telnyx-call   ────────────────────────────▶ checks + writes calls row (destination
                                            = the number stored on the person)
newCall(sip:decibel-parked@…, X-Decibel-Call) ─────────────────────────────────────────▶ credential connection: PARKED
                                            telnyx-webhook ◀── call.initiated ─────────
                                            POST /calls (Call Control app) ────────────▶ dials the stored number, records
                                            ◀── call.answered (far leg) ───────────────
                                            speak notice (target_legs: self) ──────────▶ callee hears the notice
                                            ◀── call.speak.ended
                                            answer rep leg + bridge ───────────────────▶ rep and callee connected
                                            ◀── call.hangup / call.recording.saved ────
                                            settle row, copy MP3 to Storage, delete it at Telnyx
```

### Account-level resources (one Telnyx account for every workspace)

Created and kept in shape by `node scripts/telnyx-setup.mjs` (safe to re-run; prints the ids to store as secrets):

| Resource | Name | What it does |
| --- | --- | --- |
| Outbound voice profile | Decibel outbound | Destinations GB, IE, NL, DE, FR only; max $0.10/min (blocks premium rate); $50/day spend limit |
| Call Control application | Decibel voice | Owns purchased numbers, dials the far leg of every call, London anchorsite, webhooks → `telnyx-webhook` (API v2) |
| Credential connection | Decibel browser calling | What reps' browsers log in to. Outbound calls are **parked** (never routed to the browser's destination); SIP URI calls are internal only; webhooks → `telnyx-webhook` |
| Telephony credentials | `decibel-<user id>` | One per rep, created on first use (`telnyx_credentials` table); the browser gets a 24-hour JWT minted from it |

Why one account: Telnyx only lets an account present its own numbers as caller ID (error D36), so per-workspace sub-accounts would break calling. Numbers are tagged per workspace (`customer_reference` = workspace id, tag `ws-<id>`).

### Secrets

| Secret | Value |
| --- | --- |
| `TELNYX_API_KEY` | API v2 key |
| `TELNYX_CC_APP_ID`, `TELNYX_CREDENTIAL_CONNECTION_ID`, `TELNYX_OVP_ID` | From `scripts/telnyx-setup.mjs` |
| `TELNYX_PUBLIC_KEY` | Portal > Keys & credentials > Public key. With it, every webhook's Ed25519 signature (`telnyx-signature-ed25519` over `<telnyx-timestamp>|<body>`, ≤ 5 minutes old) must verify. Without it, webhooks are accepted but anything that costs money is confirmed against the API first (the leg is live on our account; recording links come from `GET /recordings/{id}`) |

## Calls

### Outbound (`telnyx-call`, then `telnyx-webhook`)

1. `telnyx-call` (user JWT): membership and rate limit (40/min); the checks for the call kind (below); caller ID = the rep's assigned number, else the workspace default, else any active number; writes the `calls` row (`status: queued`) with the destination the **server** chose. Blocked calls get a row with `blocked_reason` and stop.
2. The browser places a call to `sip:decibel-parked@sip.telnyx.com` with header `X-Decibel-Call: <call id>`. The credential connection parks it.
3. `telnyx-webhook` on `call.initiated` (credential connection): the row must be `queued`, unclaimed and under 2 minutes old; the leg must come from this rep's credential; it is claimed atomically (`provider_call_id`). Then `POST /calls` from the Call Control app to the stored destination, `link_to` the rep's leg, `client_state` = `{call_id, leg: 'far', ws, notice}`, recording from answer (dual channel, MP3) when the row says the call is recorded.
4. Far leg `call.answered` → `in_progress`; if there is a notice (recording, or the setup-test greeting), `speak` it with `target_legs: 'self'` (callee only; voice `AWS.Polly.Amy-Neural`). On `call.speak.ended` (or straight away without a notice): answer the rep's parked leg, then `bridge` it to the far leg.
5. `call.hangup` on the far leg settles the row: answered → `completed` with `duration_seconds` from answer to hang-up; otherwise `busy` (`user_busy`, `call_rejected`), `no_answer` (`timeout`, `no_answer`), `canceled` (`originator_cancel`) or `failed`. The rep's leg is hung up too. A rep hang-up before answer → `canceled`, and the far leg is hung up.
6. `call.recording.saved` → the MP3 is downloaded (links last 10 minutes), stored at `recordings/{ws}/{call}.mp3`, upserted into `recordings`, and deleted from Telnyx (`provider_deleted_at`).

Call kinds checked by `telnyx-call`:

| Kind | Allowed when | Dials |
| --- | --- | --- |
| standard | `can_dial_for()` passes (DNC, TPS/CTPS, minutes, trial) | the person's stored mobile |
| standard + `test_route` (power dialler testing) | as above, and `to` is the rep's own mobile or a workspace number | `to` |
| test / practice | minutes left, and `to` is the rep's own mobile or a workspace number | `to` (setup test plays "This is Decibel. Your setup works.") |
| `to_user_id` (internal) | the target is a member of the workspace | the teammate's browser (`sip:<their credential>`), free, no number needed |

### Inbound

`call.initiated` with `direction: incoming` on the Call Control app → the number is looked up (`phone_numbers.e164`, Telnyx, not released) → a `calls` row (`direction: inbound`, matched person by mobile) → `transfer` to the assigned rep's browser (`assigned_user_id`, else the workspace creator), 25 s timeout, with the call id in a header. The softphone rings, reads the row for the caller and person, and answers. If the rep doesn't answer (or has never logged in), the caller hears "Sorry, nobody is available…", a beep, and can leave up to 2 minutes; the voicemail is saved like a recording and the row becomes `kind: voicemail`.

### Reliability

- Every event id is processed once (`telnyx_events`, `claim_telnyx_event()`); a failure releases the claim and returns 500 so Telnyx retries.
- Every command carries a `command_id` (`dial:<call>`, `bridge:<call>`…), so a repeated webhook can't dial or bridge twice (Telnyx ignores repeats for 60 s).
- Final call states are never overwritten (webhooks arrive out of order).
- `telnyx-sync` (every 10 min) fails rows still `queued` after 10 minutes (`never_connected`); `nightly` fails anything live after 6 hours (`stale`).

## Numbers (`telnyx-numbers`, owner/admin)

UK numbers need Telnyx regulatory approval. For both local (01/02) and national (03) numbers Telnyx asks for: company website, contact (name, business, phone), a use-case description, an address, a company registration certificate (or passport for a sole trader) and a proof of address from the last 3 months. Mobile (07) numbers are not offered: the account can't buy them yet.

| Action | What happens |
| --- | --- |
| `search` | `GET /available_phone_numbers` (GB, local with an area code such as 20 / 161 / 121, or national), with the monthly and one-off price |
| `buy` | Uses the workspace's requirement group for that number type. None yet (or declined) → `needs_documents` and the app shows the details form |
| `submit_documents` | Creates the address, uploads both documents (from the private `imports` bucket; Telnyx deletes unlinked uploads after 30 minutes), creates the requirement group with all six values (the use case is written for the customer), submits it for approval, then orders the chosen number against it. The row is `pending_review` with the order id |
| `refresh` / `telnyx-sync` | Follows the order: when the number is active it is pointed at the Call Control app, tagged, marked `active` (default if the workspace has none) and the owner is emailed; a failed or cancelled order is `rejected` with the reason |
| `verify_start` / `verify_check` | Verified caller ID: Telnyx texts (or calls) a code; once entered, the number can be presented as caller ID. The quickest way to start calling |
| `set_default`, `assign`, `release` | Default caller ID, assign to a rep (also routes inbound calls), release (`DELETE /phone_numbers/{id}` or `/verified_numbers/{e164}`) |

Prices seen on 2026-10-11 (USD): local and national $1 one-off + $1/month. Telnyx reviews take up to about 72 hours; once a group is approved, later numbers of that type activate in minutes.

## Costs (Telnyx public pricing, 2026-10-11, USD)

UK landline about $0.0042/min and main mobile networks $0.02/min with a UK caller ID; Call Control adds $0.002/min; recording $0.002/min. Inbound to a local number $0.005/min. Telnyx adds a surcharge if 15% or more of outbound calls last 6 seconds or less.

## Account limits to check before launch

A new (L1/Paid) Telnyx account prefixes spoken audio with an automated-call notice and caps outbound calls (100/day, 10/hour, 5 concurrent). Verified accounts lift these. Mobile numbers need a higher tier.

## Tests

```bash
cd apps/web
export SUPABASE_SERVICE_ROLE_KEY=$(supabase projects api-keys --project-ref fkjwglvztyyerewldnty -o json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>process.stdout.write(JSON.parse(s).find(k=>k.name==="service_role").api_key))')
node scripts/telnyx-calls.mjs                      # real Telnyx calls browser→browser: park, dial, notice, bridge, recording, hang-up, replay and forgery (15 checks)
NEXT_PUBLIC_E2E=1 NEXT_DIST_DIR=.next-e2e npx next build && NEXT_PUBLIC_E2E=1 NEXT_DIST_DIR=.next-e2e npx next start -p 3005 &
node scripts/telnyx-ui.mjs http://localhost:3005   # the app's softphone calls a teammate; number search and the details form (10 checks)
```

Both use throwaway users and internal SIP calls between two browsers, so they need no phone number and ring no phones. Headless Chrome on macOS can hang on `getUserMedia`, so the test pages use a generated tone as the microphone.

Not covered automatically: calls to real phone numbers and inbound calls (they need a number or a verified caller ID).

## Winding down Twilio

Migration 0025 kept the Twilio sub-account ids in `legacy_twilio_accounts` and marked the one remaining Twilio number (+447426913647, workspace "Oliver's Test Team") as released in Decibel. It is still rented on Twilio until released there.

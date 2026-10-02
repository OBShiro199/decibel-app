# Decibel UX Audit

Phase 0 (recon) and Phase 1 (diagnostic audit) of the Dashboard UX Overhaul brief. No code has been changed for this audit.

Audited 2 October 2026 against the working tree in `apps/web` and `supabase/functions`.

## How this audit was done, and its limits

- **Code audit:** every route, the shell, the softphone and the two Twilio webhook functions were read line by line, and the Phase 1.1 grep checklist was run across `app`, `components` and `lib`.
- **Runtime, public pages:** layout shift was measured in the browser (PerformanceObserver, buffered, 1280×800) on `/`, `/signup`, `/login` and `/compliance`. Dev server, no throttling.
- **Runtime, signed-in pages: not measured.** Every `/app` and `/onboarding` route needs a signed-in session, and I cannot sign in to the hosted Supabase auth. Throttled cold loads, Layout Shift Regions, the React Profiler and the refetch test (Phase 1.2) still need to be run on these routes by someone signed in.
- **Lighthouse: not run.** It is not installed in the repo.

Findings for signed-in routes are therefore from reading the code. Each one names the exact line and the mechanism, but the visible size of each jump has not been measured.

---

## Phase 0: Recon

### Stack

| Area | What is used |
| --- | --- |
| Framework | Next.js 15.5, App Router, React 19, TypeScript |
| Rendering | Marketing and auth pages: static (SSG). `/app/*` and `/onboarding/*`: server layout (`force-dynamic`) that reads the session, then client components for every page |
| Data fetching | TanStack Query v5 for almost all reads, through the Supabase browser client. One page (`/invite/[token]`) fetches in `useEffect`. Supabase Realtime on `calls` and `people` |
| State | React Context: `AppProvider` (workspace, profile, role) and `SoftphoneProvider` (call state machine via `useReducer`). No other store |
| Styling | Tailwind 3 with a custom token preset (`packages/design-tokens`), global component classes in `app/globals.css`. Home-made primitives in `components/ui`, no UI library |
| Charts / tables / animation | None. The bar chart is hand-built divs. Tables are plain `<table>`. Motion is CSS only. Landing ASCII art is `<canvas>` |
| Voice | `@twilio/voice-sdk` 2.18, loaded with a dynamic import on first use |
| Fonts | `next/font/google` Geist + Geist Mono, `display: swap`, automatic fallback metrics |

Query client defaults (`components/providers.tsx:10`): `staleTime` 30s, `refetchOnWindowFocus: false`, `retry: 1`. No default `placeholderData`.

### Route inventory

| Route | Data regions | Requests |
| --- | --- | --- |
| `/` and legal pages | Static | None |
| `/login`, `/signup` | Auth form | None until submit |
| `/invite/[token]` | Invite card | `get_invitation` RPC, `auth.getUser` (both in `useEffect`) |
| `/onboarding/[step]` | Wizard rail, step form | Server: `getUser`, profile, memberships. Client per step: business profile, industries, ICP, phone numbers |
| `/app` (Today) | Header + caller-ID slot, 4 stat tiles, queue table, suggested leads | `today_queue` RPC then `tenant_companies`; `call_stats_daily`; `saved_searches` + `people` then `contacts_public` (up to twice); `phone_numbers` |
| `/app/leads` | Filter rail, results table, pagination, bulk bar | `business_profiles`, `industries`, `saved_searches`, `lists`; then `contacts_public` page, then `people` for revealed rows |
| `/app/people`, `/app/pipeline`, `/app/lists/[id]` | Toolbar, table or kanban, bulk bar | `people` (up to 1,000 rows) or `list_members` join; `pipeline_stages`; `workspace_members`; kanban also `tasks` |
| `/app/people/[id]` | Top bar, header + chips, tabs, timeline, attribute rail | `people`, `calls`+`recordings`, `notes`, `tasks`, `activities` (parallel); `pipeline_stages`; `workspace_members`. Realtime on `calls` and `people` |
| `/app/companies` | Table, detail drawer | `tenant_companies` with people count; drawer: `people` by company |
| `/app/lists` | Card grid | `lists` with counts; `calls` (last called per list) |
| `/app/calls` | Filters, table, detail drawer, inline players | `calls` + person + recordings (paged); `workspace_members`; `lists`. Realtime on all workspace `calls` |
| `/app/dashboard` | Period picker, 6 tiles, bar chart, per-rep table | `call_stats_daily`, `credit_transactions` (parallel) |
| `/app/settings/*` (15 pages) | Settings rail, one form per page | One to three queries per page |
| Softphone (every `/app` route) | Drawer or minimised bar, two quick-call widgets | `can_dial` RPC, `twilio-token` function, Twilio Voice SDK, `calls` row polling, Realtime |

### Request waterfalls

| Where | Chain | Effect |
| --- | --- | --- |
| Hard load of any `/app` route | middleware `auth.getUser` → layout `auth.getUser` → profile + memberships → HTML → hydrate → page queries | The shell cannot paint until two auth round trips and two queries finish on the server |
| Today queue (`app/app/page.tsx:44-49`) | `today_queue` → `tenant_companies` | Two sequential round trips inside one query |
| Today suggestions (`app/app/page.tsx:73`) | `saved_searches` + `people` → `contacts_public` → sometimes `contacts_public` again | Up to three sequential round trips |
| Leads (`app/app/leads/page.tsx:104`) | `business_profiles` gates `contacts_public` (`enabled: !!allowed`), which then fetches `people` (line 116); also waits one frame for the row-fit measurement | Three sequential steps before the first row |
| **First call** (`components/softphone/provider.tsx`, `lib/twilio/device.ts`, `supabase/functions/twilio-token`, `twilio-voice`) | `can_dial` RPC → drawer opens → microphone permission → SDK import ‖ `twilio-token` (Edge cold start, then `getUser` → `getRole` → rate limit → `loadWorkspace` → Vault read, each sequential) → `device.register()` → `device.connect()` → Twilio → `twilio-voice` (signature lookup + Vault → `phone_numbers` → `can_dial_for` → `people` → insert `calls`) → TwiML | Roughly ten sequential network hops, two of them Edge Function cold starts, before the phone rings |

### Shell

- `app/app/layout.tsx` is a server layout. It persists across client navigation inside `/app` and does not re-run.
- `components/app/shell.tsx` renders the sidebar (fixed 240px, 56px collapsed), the 48px top bar and the softphone provider. These persist across navigation.
- **Exception:** any `/app/settings/*` route renders without the sidebar and top bar (`shell.tsx:64`), so entering or leaving Settings swaps the whole frame.

---

## Phase 1: Findings

Severity follows the brief. "Fix" refers to the brief's phase and section numbers.

### A. The call flow (the reported problem)

These explain "slow, janky, doesn't save properly, then janks and saves". They are listed first because they are the worst experience in the product.

| ID | Where | What is wrong | What the user sees | Sev | Fix |
| --- | --- | --- | --- | --- | --- |
| A1 | `components/softphone/provider.tsx:313-341` | `finish()` only writes the outcome if the call's database row has been found (`if (row)`). If it hasn't, it skips every write, closes the drawer and invalidates caches as if it had saved. No error, no retry | **Outcomes and notes silently lost.** The drawer closes as if saved, the person's record never updates | P0 | 3.3 |
| A2 | `provider.tsx:89-109`, `155-167` | The app learns the call's row ID by polling `calls` for the Twilio CallSid, up to 6 times on ring/answer and 4 times after hang-up, with delays from 400ms to 1.9s. The CallSid isn't known until Twilio signals ringing, so a call cancelled before ringing has no SID and the lookup returns nothing. Pressing Save during the polling window hits A1 | The outcome sometimes saves and sometimes doesn't, depending on timing | P0 | 3.2, 3.3 |
| A3 | `provider.tsx:158-166` | On hang-up the drawer shows the outcome grid at once, then up to 3.4s later the polling result arrives and either preselects an outcome or replaces the whole grid with a "blocked" error | Content changes under the cursor after the call ends | P0 | 4.1, 7.7 |
| A4 | `components/app/shell.tsx:82-85` | When the drawer opens, `<main>` gains 360px of right padding at ≥1280px; when it closes the padding is removed | **Every page reflows** sideways on call start and again on close | P0 | 2.5, 7.6 |
| A5 | `provider.tsx:210-231` | `callPerson` waits for the `can_dial` round trip before opening the drawer | Click Call, nothing happens for a beat, then the drawer appears | P1 | 3.3, 5 |
| A6 | `lib/twilio/device.ts:73-77` | `getDevice` awaits `device.register()` (needed only for inbound) before returning, so the first outbound call waits for inbound registration | First call sits on "Connecting" noticeably longer | P1 | 3.2 |
| A7 | `supabase/functions/twilio-token/index.ts:14-23` | Membership check, rate limit, workspace load and Vault read run one after another | Adds latency to every token fetch, worst on cold start | P1 | 3.2 |
| A8 | `supabase/functions/twilio-voice/index.ts:14-90` | Webhook does signature lookup, phone number, `can_dial_for`, person read and insert sequentially before returning TwiML | Delay between Twilio connecting and the phone ringing | P1 | 3.2 |
| A9 | `provider.tsx:356-358` | The softphone context value includes the whole call `state`, so every keystroke in the notes box re-renders every consumer: the People table (up to 1,000 rows), Today, both quick-call widgets and the shell's `<main>` | **Typing notes lags** on busy pages | P0 | 8 |
| A10 | `provider.tsx:315-342` | Saving does up to four sequential writes (call, note, task, person), then invalidates nine query families. Database triggers then fire more `people` updates, which arrive over Realtime and invalidate the record page again | Save takes a second or more, then lists and the record re-render in several bursts | P0 | 3.3, 3.5 |
| A11 | `app/app/page.tsx:96-100` | Today refetches the queue twice after every call (once from the invalidation, once from `CALL_FINISHED_EVENT`) and the finished row disappears abruptly | Queue jumps after each call | P1 | 3.3, 7.2 |
| A12 | `app/app/people/[id]/page.tsx:72-73` | Every `calls` change for the person (initiated, ringing, in progress, completed, outcome) and every `people` change refetches all five record queries, unthrottled | Record timeline re-renders six to eight times per call | P1 | 3.5 |
| A13 | `components/softphone/drawer.tsx:150-230` | The drawer's middle section changes structure per phase: controls row, keypad that pushes notes down, error box, outcome grid, follow-up field, close button | The notes box and buttons move between Connecting, In call and Ended | P1 | 2.5, 4.1 |
| A14 | `components/ui/button.tsx:44` | `loading` prepends a spinner, widening the button. Affects Save and close and 59 other buttons | Buttons grow when pressed | P1 | 7.1 |

### B. Layout stability

| ID | Where | What is wrong | Symptom | Sev | Fix |
| --- | --- | --- | --- | --- | --- |
| B1 | `components/app/shell.tsx:64` | Settings renders without the app sidebar and top bar | Whole frame changes when entering or leaving Settings | P1 | 2.4 (see open question 1) |
| B2 | `app/app/page.tsx` welcome banner | `?welcome=1` banner sits in the flow above the stats | Stats and queue jump down on first arrival and up on dismiss | P1 | 2.5 |
| B3 | `app/app/leads/page.tsx:316`, `324` | "Adding to list" and Germany/Austria banners appear inside the flow when a filter is chosen | Table jumps down when you tick DE or AT | P1 | 2.5 |
| B4 | `components/onboarding/steps.tsx:218` | DACH warning inserts mid-form when the market is picked | Fields below move | P2 | 2.5 |
| B5 | `globals.css` `.tbl` | No `table-layout: fixed` or set column widths on any table | Columns resize as rows arrive or pages change | P1 | 7.2 |
| B6 | `components/app/people-view.tsx:66`, `70`, `216` | Up to 1,000 rows rendered at once, no virtualisation; kanban the same | Slow mount and scroll on larger workspaces | P1 | 7.2 |
| B7 | `components/ui/form.tsx:143` | Switch knob uses `transition-all` (animates `left`) | Minor jank | P2 | 5.2 |
| B8 | `components/app/mic-test.tsx:159` | Level meter animates `width` | Minor jank in onboarding step 5 | P2 | 5.2 |
| B9 | `components/marketing/faq.tsx:40` | FAQ animates `max-height` | Minor jank | P2 | 5.2 |
| B10 | `components/onboarding/steps.tsx` TestStep | Microphone card swaps from permission prompt to device controls (different heights) | Test call card moves down on allow | P2 | 4.1 |

### C. Data layer

| ID | Where | What is wrong | Symptom | Sev | Fix |
| --- | --- | --- | --- | --- | --- |
| C1 | `app/app/dashboard/page.tsx:57` | Period is part of the query key with no `placeholderData` | **Changing period swaps tiles and chart for skeletons** | P0 | 3.2, 7.5 |
| C2 | `components/providers.tsx:10` | No default `placeholderData`; any query whose key changes without its own setting blanks to a skeleton | Same flash anywhere a key changes (People list, Leads page size change) | P1 | 3.1 |
| C3 | `app/app/calls/page.tsx:64` | Realtime on every workspace call invalidates the whole call log, unthrottled | Call log refetches on every status event of every rep | P1 | 3.5 |
| C4 | Sidebar links, table rows | No data prefetch on hover or focus | Every first visit to a tab shows skeletons | P1 | 3.4 |
| C5 | Today, Leads (waterfalls above) | Sequential requests where one round trip would do | Slower first content | P1 | 3.2 |
| C6 | `app/(auth)/invite/[token]/page.tsx:28-29` | Fetches in `useEffect` | Not cached; fine in practice but outside the query layer | P2 | 3.1 |
| C7 | `app/app/layout.tsx:12`, `lib/supabase/middleware.ts:23` | Two `auth.getUser` round trips on every hard load before the shell renders | Slow first paint; blank until the server responds | P1 | 2.4 |

### D. Loading states

| ID | Where | What is wrong | Symptom | Sev | Fix |
| --- | --- | --- | --- | --- | --- |
| D1 | All regions | No shared four-state wrapper; each page hand-rolls loading, empty and error. Empty and error states are not sized to match content (for example `EmptyState` is ~260px tall regardless of the table it replaces) | Height changes between loading, empty and error | P1 | 4.1 |
| D2 | `globals.css` `.skeleton` | Pulse only, no shimmer, no visually hidden "Loading" label | Inconsistent with brief | P2 | 4.2 |
| D3 | Whole app | No `useDeferredLoading`; refetch indicators don't exist (good) but button spinners show instantly even for 50ms saves | Spinner flicker on fast actions | P1 | 4.3 |
| D4 | Whole app | No "reveal once" fade; content pops in when the skeleton is replaced | Content pops rather than fades | P2 | 5.2 |
| D5 | `app/app/loading.tsx` | One generic table skeleton for every `/app` route | Wrong shape briefly on routes that aren't tables (Today, Dashboard, record page) | P1 | 4.4 |

### E. Things that are already right

- Public pages measured **zero layout shift** (`/`, `/signup`, `/login`, `/compliance`).
- Fonts use `next/font` with fallback metrics. No theme flash (light only).
- Scrollbar space is reserved on `<main>`, Settings, onboarding and public pages.
- Toasts are a fixed overlay.
- Most queries already use `isLoading` (first load only) rather than `isFetching`, and the Calls and Leads pages keep previous data while paging.
- Avatars have fixed sizes; the only `<img>` has width and height.
- Onboarding steps switch on the client inside a fixed frame with a fixed action bar (done in the previous round).

---

## Summary

| Severity | Count |
| --- | --- |
| P0 | 7 (A1, A2, A3, A4, A9, A10, C1) |
| P1 | 21 |
| P2 | 8 |

### Top 10 worst offenders

1. **A1 + A2. Call outcomes silently dropped** when the row lookup hasn't finished or never succeeds.
2. **A9. Every notes keystroke re-renders whole pages**, including a table of up to 1,000 rows.
3. **A4. Opening the softphone reflows the page** by 360px, and again on close.
4. **A10. Save takes four sequential writes**, then nine cache invalidations and trigger-driven Realtime bursts.
5. **A3 + A13. The drawer rearranges itself** after hang-up and between phases.
6. **First-call latency** (A5–A8): about ten sequential hops before the phone rings.
7. **C1. Dashboard period change flashes skeletons.**
8. **A12 + C3. Unthrottled Realtime invalidation** of the record page and call log during calls.
9. **B5. No fixed table column widths** anywhere.
10. **B1. Settings swaps the whole app frame.**

### Per-route scorecard

| Route | CLS (measured) | Notes |
| --- | --- | --- |
| `/` | 0.000 | Dev, unthrottled. Hero animates with CSS, canvases in fixed boxes |
| `/signup`, `/login` | 0.000 | Suspense skeleton matches the form |
| `/compliance` | 0.000 | Static |
| `/onboarding/*` | Not measured | Fixed frame already in place; B4, B10 remain |
| `/app` (Today) | Not measured | B2, A11, C5; softphone issues apply |
| `/app/leads` | Not measured | B3, C5, B5 |
| `/app/people`, `/pipeline`, `/lists/[id]` | Not measured | A9 worst here, B6, B5 |
| `/app/people/[id]` | Not measured | A12, A9 |
| `/app/calls` | Not measured | C3, B5 |
| `/app/dashboard` | Not measured | C1 |
| `/app/settings/*` | Not measured | B1, D1 |

### Proposed fix order

The brief's default order is Phase 2 → 9. I recommend moving the call flow to the front, because it causes data loss and is the experience being complained about.

1. **Call flow rebuild (closes A1–A14).**
   - The browser generates the call's ID up front and passes it to Twilio. `twilio-voice` inserts the row with that ID. This removes the polling entirely, so notes and outcome always have a row to attach to. *This adds one parameter to the browser-to-`twilio-voice` contract, which is our own code.*
   - Save becomes one database function call that writes the outcome, note, task and next-call date in a single transaction. The drawer closes at once and shows "Saved" or "Couldn't save, retry". Nothing is ever dropped silently. *This adds one new RPC.*
   - The drawer opens instantly in a "Checking" state while the TPS/DNC check runs alongside microphone and device setup. Inbound registration stops blocking outbound calls.
   - The drawer gets fixed regions: header, number and timer, a controls slot that becomes the outcome grid in the same footprint, notes, and a fixed footer. It overlays the page instead of pushing it.
   - Softphone context is split into state and actions, so typing notes only re-renders the drawer.
   - After saving, the affected caches are updated directly instead of invalidating nine families. Realtime updates are throttled and written into the cache.
   - The two Edge Functions run their independent lookups in parallel.
2. **Phase 2: global stability.** Fixed table layouts, banners moved into reserved slots or overlays, transitions on transform and opacity only.
3. **Phase 3: data layer.** Default `placeholderData`, Dashboard period fix, hover prefetch on sidebar links and rows, collapse the Today and Leads waterfalls.
4. **Phase 4: loading system.** A shared `DataRegion` wrapper with same-size empty and error states, shimmer skeletons, `useDeferredLoading`, route-specific `loading.tsx` files.
5. **Phase 5: reveal.** Fade in once per region, never on refetch.
6. **Phase 6–8: lazy loading, component rules, render performance.** Virtualise People and kanban past ~100 rows, button pending state that keeps its width.
7. **Phase 9: verification.** Needs someone signed in to run the throttled checks on `/app` routes.

## Open questions

1. **Settings frame.** The PRD asked for Attio's full-screen Settings layout, which deliberately hides the app sidebar. The brief asks for a shell that never changes. Keep the full-screen Settings, or show it inside the normal sidebar and top bar?
2. **Drawer position.** Should the softphone overlay the page (nothing moves, but it covers the right 360px) or keep a permanently reserved column on wide screens (nothing moves, but tables are always narrower)? The audit recommends overlay.
3. **Refetch on window focus.** It is off today. The brief recommends on. Turning it on means lists quietly refresh when you come back to the tab. Fine to enable?
4. **Closing without an outcome.** Today a rep can close the drawer after a call without logging an outcome. Should an outcome be required for standard calls?
5. **Signed-in verification.** Phase 9 needs throttled runs on `/app` routes. Can you run those, or provide a test login that I can use against a local Supabase instead of the hosted one?

---

## Status after the first fix pass (2 October 2026)

Decisions from the open questions: Settings now sits inside the normal sidebar and top bar; the softphone is a permanent column at 1280px and wider (an overlay below that); data refreshes quietly on window focus; standard calls need an outcome before the panel closes.

| ID | Status | What changed |
| --- | --- | --- |
| A1, A2 | Fixed | The browser picks the call's row id and passes it to Twilio; `twilio-voice` inserts the row with it. Polling removed. Saving goes through one transaction (`log_call_outcome`, migration 0004), is queued in local storage, retried with backoff and on reconnect, and reported with a Retry toast if it still fails |
| A3 | Fixed | Late results only preselect an outcome if none is picked; blocked calls are known before dialling |
| A4 | Fixed | Docked column at ≥1280px, overlay below. Opening a call moves nothing |
| A5 | Fixed | Panel opens instantly in a Checking state; TPS/DNC check, microphone and device setup run in parallel |
| A6 | Fixed | Inbound registration no longer blocks outbound calls; the device warms up shortly after page load |
| A7, A8 | Fixed | Independent lookups in `twilio-token` and `twilio-voice` run in parallel |
| A9 | Fixed | Softphone split into actions, status and full-state contexts. Typing notes re-renders only the panel |
| A10, A11 | Fixed | Panel closes immediately; the person's row updates in place everywhere; Today moves or removes the row without a refetch; one targeted refresh after the save |
| A12 | Fixed | Record page batches Realtime events and refreshes only the affected queries, at most once a second |
| A13 | Fixed | Panel has fixed regions: header, dial block, action area, notes, footer. Phases swap content in place |
| A14 | Fixed | Pending buttons keep their width; the spinner appears only after 200ms and stays at least 400ms |
| B1 | Fixed | Settings inside the app frame |
| B2, B3, B4 | Fixed | Welcome note is a toast; Leads notices are chips in the toolbar; the DACH warning reuses the field's hint line |
| B5 | Fixed | Leads, People, Pipeline, Lists, Calls, Companies and Today tables use fixed column widths |
| C1, C2 | Fixed | Default `placeholderData: keepPreviousData`; record and list-detail queries opt out so one record never shows under another |
| C3 | Fixed | Call log Realtime refresh throttled to once per 1.5s |
| C4 | Fixed | Sidebar links prefetch their page's data on hover and focus, and all tabs warm 2.5s after load |
| C5 | Partly | Today queue is one request (company embedded). Leads still waits for the markets lookup |
| D2 | Fixed | One slow shimmer, `aria-busy` and a hidden "Loading" label |
| D4 | Fixed | Tables fade in once per session and never replay on refetch or back-navigation |
| D5 | Fixed | Route-specific loading screens for Today, Leads, People, Pipeline, Calls, Companies, Dashboard and the record page |
| B6, B7–B10, C6, C7, D1, D3 | Open | Virtualising long tables, small layout animations, the invite page fetch, the double auth check on hard load, a shared four-state region wrapper |

Also done in this pass, at the user's request: Geist Mono removed everywhere (labels and numbers use Geist with tabular figures); softer gridlines inside the app; recordings play inline in the call log at a fixed size; a softphone connection indicator; audit-log triggers (migration 0005); nightly jobs scheduled with pg_cron (migration 0006); a tenant-isolation test script.

### Still to verify while signed in

Phase 9 needs a signed-in session, which I can't use. Suggested check, Chrome DevTools open, Network on "Slow 4G", Rendering → "Layout Shift Regions" on:

1. Load Today cold. Nothing should flash blue.
2. Call a seeded contact. The panel should open instantly, the page should not move, and typing notes should feel instant.
3. Hang up, press a number key for the outcome, Save. The panel should close at once and the row should update in place.
4. Switch tabs by hovering then clicking. Real content should appear without skeletons after the first visit.
5. Change the Dashboard period. Tiles should update in place.

# Search with AI (removed 2026-10-13)

Search with AI let a rep describe who they wanted to call in plain English ("CEOs of software companies with 50–100 employees, who have a mobile") and turned it into the same filters Leads and Local businesses use. It was removed on 2026-10-13, together with a database stabilisation (the database was overloaded, though AI search wasn't the cause). This page keeps everything needed to bring it back.

**Last commit that contains it:** `a03ff93`. Restore the code with:

```bash
git checkout a03ff93 -- apps/web/app/app/ai apps/web/app/dev-preview/ai apps/web/components/app/ai-search.tsx apps/web/scripts/ai-ui.mjs supabase/functions/ai-search
```

Then follow [Restoring it](#restoring-it) below.

## How it worked

```
Rep types a request on /app/ai (picks "Local businesses" or "B2B decision-makers")
        │
        ▼
ai-search Edge Function (POST, user JWT)
  1. checks membership and rate limits (30 per user per hour, 300 per workspace per day)
  2. loads the real filter values from search_facets (cached 10 min per instance)
     and probes for impossible yes/no filters (e.g. "no website" when every listing has one)
  3. calls Claude (claude-opus-5-5, effort low, JSON-schema structured output,
     cached system prompt, server-side fallback on a policy decline)
  4. sanitises the answer: only whitelisted filters, valid types, and enum values that
     exist in the data (a confused or manipulated answer can only produce a normal search)
  5. records the search in ai_searches (prompt, filters, tokens, ok)
        │
        ▼
Browser opens the normal LeadsView / LocalView with those filters as editable chips,
plus a banner with the AI's title, summary and notes (what couldn't be expressed).
Saving, exporting, reveals and the power dialler work exactly as on Leads / Local.
```

Key design points:

- **Claude only proposes filters; it never queries data.** Everything goes back through `search_leads` / `search_local`, so permissions, credits and DNC rules are unchanged.
- **Both databases are filled every time.** The model also says which one fits better (`suggested_mode`, `mode_reason`). If that isn't the one the rep picked, the UI offers to switch without asking the AI again.
- **Output is a list of `{ field, values }` pairs**, not one property per filter. Fifty-five separate properties compiled to a grammar too large for structured outputs.
- **The system prompt contains the live facet values** (industries, countries, seniorities…) and is prompt-cached. It only changes when the facets do.
- **Cost tracking:** input tokens include cache reads and writes; both counts are stored per search.

### Response shape

`POST /functions/v1/ai-search` with `{ workspace_id, mode: 'leads' | 'local', prompt }` returns:

```json
{ "id": "…", "mode": "leads", "suggested_mode": "leads", "mode_reason": "…", "title": "Software CEOs, 50–100 staff, with mobiles",
  "summary": "…", "notes": ["…"], "leads_filters": { "titles": ["CEO", "Chief Executive"], "employeesMin": 50, "employeesMax": 100, "hasMobile": true },
  "local_filters": {} }
```

Errors come back as `{ error, message }`:

| Error | Status |
| --- | --- |
| `empty_prompt` | 400 |
| `forbidden` | 403 |
| `ai_not_configured` | 503 (no `ANTHROPIC_API_KEY`) |
| `slow_down` / `daily_limit` | 429 |
| `busy` | 429 (Anthropic rate limit) |
| `refused` | 422 |
| `ai_error` | 502 |

### The UI (`components/app/ai-search.tsx`, ~500 lines, in commit `a03ff93`)

- **Start screen:** pick a database (Local businesses, about 365k listings, or B2B decision-makers, about 690k at the time). Then a prompt box with six example prompts per database, and **Recent searches** (last 6 successful `ai_searches` rows for the workspace) that re-open instantly without calling the AI again.
- **Working dialog:** an `ai-orb` pulse and four stages (reading → matching → searching → preparing). The first page of results is prefetched before the dialog closes. If the AI suggests the other database, the dialog asks "switch or keep".
- **Results:** `<LeadsView initialFilters={…} banner={…}>` or `<LocalView …>`. The banner shows the title, summary and notes, with Edit (back to the prompt) and New search.
- **Analytics:** `track('ai_search', { mode, suggested })`.
- **Test:** `scripts/ai-ui.mjs` (headless Chrome; intercepts the function so no Claude cost) and `supabase/functions/ai-search/translate_test.ts` (Deno unit tests for the sanitiser).

## Restoring it

1. Restore the code with the `git checkout` command at the top.
2. Add the sidebar item back in `apps/web/components/app/shell.tsx` (first nav group, after Leads):
   `{ href: '/app/ai', label: 'Search with AI', icon: Globe }`, and import `Globe` from `@phosphor-icons/react`.
3. Add to `supabase/config.toml`:
   ```toml
   [functions.ai-search]
   verify_jwt = false
   ```
4. Recreate the `ai_searches` table with the SQL under [Database](#database), as a new migration.
5. Make sure the `ANTHROPIC_API_KEY` secret is set in Supabase. Then deploy: `supabase functions deploy ai-search --project-ref fkjwglvztyyerewldnty`.
6. Update the record counts in the system prompt and the UI blurbs (`MODES` in the component) if the data has grown. They said 690k leads and 365k listings.
7. Check that the filter whitelist (`LEAD_FIELDS` / `LOCAL_FIELDS`) still matches the keys in `apps/web/lib/lead-search.ts` and the search RPCs, especially if Leads has moved to a different search backend.

## Database

From migration `0022_ai_search.sql` (the table is dropped by a later migration):

```sql
-- 0022: Search with AI. A prompt is turned into the same filters Leads and Local businesses use
-- (by the `ai-search` Edge Function, which calls Claude). Each search is recorded here: it powers
-- "recent searches", per-user and per-workspace rate limits, and cost tracking. Rows are written
-- only by the function (service role); members can read their own searches.

create table public.ai_searches (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  mode            text not null check (mode in ('leads', 'local')),
  prompt          text not null check (char_length(prompt) between 1 and 1000),
  suggested_mode  text check (suggested_mode in ('leads', 'local')),
  title           text not null default '',
  summary         text not null default '',
  leads_filters   jsonb not null default '{}',
  local_filters   jsonb not null default '{}',
  notes           text[] not null default '{}',
  model           text not null default '',
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  ok              boolean not null default true,
  created_at      timestamptz not null default now()
);
create index ai_searches_user_idx on public.ai_searches (user_id, created_at desc);
create index ai_searches_ws_idx on public.ai_searches (workspace_id, created_at desc);

alter table public.ai_searches enable row level security;
create policy ai_searches_own on public.ai_searches
  for select to authenticated using (user_id = (select auth.uid()));
revoke insert, update, delete, truncate on public.ai_searches from authenticated;
revoke all on public.ai_searches from anon;
```

## Edge function: `supabase/functions/ai-search/index.ts`

```ts
// Search with AI. POST with the user's JWT:
//   { workspace_id, mode: 'leads' | 'local', prompt }
//   -> { id, mode, suggested_mode, mode_reason, title, summary, notes, leads_filters, local_filters }
//
// Claude (claude-opus-5-5, structured output) turns the prompt into filters for both
// databases and says which one fits. The filters are sanitised against the whitelist and the
// real values in search_facets (translate.ts) and then searched by the browser through the
// same search_leads / search_local functions as Leads and Local businesses.
// Uses the official SDK (unlike the fetch-only Twilio/Stripe functions): this call is seconds
// long anyway, so the SDK's cold-start cost does not matter here.
import Anthropic from 'npm:@anthropic-ai/sdk';
import { admin, corsHeaders, fail, getRole, getUser, json } from '../_shared/http.ts';
import { clip, OUTPUT_SCHEMA, sanitize, systemPrompt, type Facets, type Mode } from './translate.ts';

const MODEL = 'claude-opus-5-5';
const PER_USER_HOUR = 30;
const PER_WORKSPACE_DAY = 300;
const KEY = Deno.env.get('ANTHROPIC_API_KEY') ?? '';

let cached: { at: number; prompt: string; facets: { leads: Facets; local: Facets } } | null = null;

/** Facet values for both databases, refreshed every 10 minutes per function instance. */
async function vocabulary() {
  if (cached && Date.now() - cached.at < 10 * 60_000) return cached;
  // PostgREST returns at most 1,000 rows per request, so page through (about 2,800 rows)
  const rows: { source: string; facet: string; value: string }[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await admin().from('search_facets').select('source,facet,value,n').order('n', { ascending: false }).order('value').range(from, from + 999);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < 1000) break;
  }
  const facets: { leads: Facets; local: Facets } = { leads: {}, local: {} };
  for (const r of rows) {
    const bucket = facets[r.source as Mode];
    (bucket[r.facet] ??= []).push(r.value);
  }
  // Yes/no filters that cannot match anything in the data right now (e.g. every local listing
  // has a website), so the AI explains that in a note instead of building an empty search.
  // Each probe uses a partial index from 0021, so these are instant.
  const probes = [
    { table: 'local_search', column: 'has_website', gap: 'Every local listing has a website, so "no website" cannot be searched. Do not use hasWebsite "no"; add a note saying so.' },
    { table: 'local_search', column: 'has_phone', gap: 'Every local listing has a phone number, so "no phone" cannot be searched. Do not use hasPhone "no"; add a note saying so.' },
    { table: 'lead_search', column: 'has_email', gap: 'Every lead has a work email, so "no email" cannot be searched. Do not use hasEmail "no"; add a note saying so.' },
  ];
  const gaps = (
    await Promise.all(
      probes.map(async (p) => {
        const { data, error } = await admin().from(p.table).select(p.column).eq(p.column, false).limit(1);
        return !error && (data ?? []).length === 0 ? p.gap : null;
      }),
    )
  ).filter((g): g is string => !!g);
  cached = { at: Date.now(), prompt: systemPrompt(facets, gaps), facets };
  return cached;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const input = await req.json().catch(() => ({}));
  const workspaceId = String(input.workspace_id ?? '');
  const mode: Mode = input.mode === 'local' ? 'local' : 'leads';
  const prompt = clip(input.prompt, 1000);
  if (!prompt) return fail('empty_prompt', 400, { message: 'Describe who you want to find.' });
  if (!(await getRole(user.id, workspaceId))) return fail('forbidden', 403);
  if (!KEY) return fail('ai_not_configured', 503, { message: 'Search with AI is not switched on yet.' });

  const db = admin();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const [{ count: mine }, { count: theirs }] = await Promise.all([
    db.from('ai_searches').select('id', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', hourAgo),
    db.from('ai_searches').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).gte('created_at', dayAgo),
  ]);
  if ((mine ?? 0) >= PER_USER_HOUR) return fail('slow_down', 429, { message: 'You have run a lot of AI searches this hour. Try again shortly, or use the filters on Leads.' });
  if ((theirs ?? 0) >= PER_WORKSPACE_DAY) return fail('daily_limit', 429, { message: 'Your workspace has reached today’s AI search limit. It resets tomorrow.' });

  const vocab = await vocabulary();
  const today = new Date().toISOString().slice(0, 10);
  const client = new Anthropic({ apiKey: KEY });

  let response;
  try {
    response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // on a policy decline the API re-runs the request on Anthropic's recommended fallback model
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema: OUTPUT_SCHEMA as unknown as Record<string, unknown> } },
      system: [{ type: 'text', text: vocab.prompt, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `Selected search: ${mode === 'leads' ? 'leads (B2B decision-makers)' : 'local (local businesses)'}\nToday: ${today}\n\nRequest:\n${prompt}`,
        },
      ],
    });
  } catch (e) {
    console.error('ai-search claude error', e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : (e as Error).message);
    if (e instanceof Anthropic.RateLimitError) return fail('busy', 429, { message: 'Search with AI is busy right now. Try again in a moment.' });
    if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError) return fail('ai_not_configured', 503, { message: 'Search with AI is not set up correctly.' });
    return fail('ai_error', 502, { message: 'The AI could not build that search. Try again or rephrase it.' });
  }

  const record = async (fields: Record<string, unknown>) =>
    db
      .from('ai_searches')
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        mode,
        prompt,
        model: response.model ?? MODEL,
        input_tokens: (response.usage.input_tokens ?? 0) + (response.usage.cache_read_input_tokens ?? 0) + (response.usage.cache_creation_input_tokens ?? 0),
        output_tokens: response.usage.output_tokens ?? 0,
        ...fields,
      })
      .select('id')
      .single();

  if (response.stop_reason === 'refusal') {
    await record({ ok: false, notes: ['refused'] });
    return fail('refused', 422, { message: 'That request can’t be turned into a search. Try describing the people or businesses you want to call.' });
  }
  const text = response.content.find((b) => b.type === 'text');
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = text && text.type === 'text' ? JSON.parse(text.text) : null;
  } catch {
    parsed = null;
  }
  if (!parsed) {
    await record({ ok: false, notes: [`unparsed: ${response.stop_reason}`] });
    return fail('ai_error', 502, { message: 'The AI could not build that search. Try again or rephrase it.' });
  }

  const leads = sanitize('leads', parsed.leads, vocab.facets.leads);
  const local = sanitize('local', parsed.local, vocab.facets.local);
  const suggested: Mode = parsed.suggested_mode === 'local' ? 'local' : 'leads';
  const notes = (Array.isArray(parsed.notes) ? parsed.notes : []).map((n) => clip(n, 200)).filter(Boolean).slice(0, 5);
  const title = clip(parsed.title, 80) || prompt.slice(0, 60);
  const summary = clip(parsed.summary, 300);

  const { data: row } = await record({
    suggested_mode: suggested,
    title,
    summary,
    leads_filters: leads.filters,
    local_filters: local.filters,
    notes,
  });

  return json({
    id: row?.id ?? null,
    mode,
    suggested_mode: suggested,
    mode_reason: clip(parsed.mode_reason, 200),
    title,
    summary,
    notes,
    leads_filters: leads.filters,
    local_filters: local.filters,
  });
});
```

## Prompt, output schema and sanitiser: `supabase/functions/ai-search/translate.ts`

```ts
// Search with AI: the prompt, output schema and sanitiser for turning a sentence into the
// filters Leads (search_leads) and Local businesses (search_local) understand.
//
// Claude only ever proposes filters. Everything it returns is re-checked here against the
// filter whitelist and the real values in the data (search_facets) before it reaches the
// database or the browser, so a confused or manipulated answer can only ever produce an
// ordinary, valid search.

export type Mode = 'leads' | 'local';
export type Facets = Record<string, string[]>;
export type Filters = Record<string, unknown>;

// ---- filter whitelist (keys match lib/lead-search.ts and the RPCs) --------------------
type Kind = 'text' | 'enum' | 'bool' | 'int' | 'num';
interface Field { kind: Kind; facet?: string; min?: number; max?: number; describe: string }

export const LEAD_FIELDS: Record<string, Field> = {
  titles: { kind: 'text', describe: 'Job title words or phrases; a lead matches if its title contains ANY of them. Include common variants (e.g. "CEO", "Chief Executive"; "Head of Sales", "Sales Director").' },
  titlesNot: { kind: 'text', describe: 'Title words to exclude, e.g. "assistant", "intern".' },
  seniorities: { kind: 'enum', facet: 'seniority', describe: 'Seniority levels.' },
  departments: { kind: 'enum', facet: 'department', describe: 'Departments.' },
  industries: { kind: 'enum', facet: 'industry', describe: 'Company industries (pick every value that fits the request, e.g. software → "Software Development", "IT Services and IT Consulting", "Technology; Information and Internet").' },
  industriesNot: { kind: 'enum', facet: 'industry', describe: 'Industries to exclude.' },
  sizes: { kind: 'enum', facet: 'size', describe: 'Employee-count bands. Use only for vague sizes ("small", "SMEs", "enterprise"); for numbers use employeesMin/employeesMax.' },
  employeesMin: { kind: 'int', min: 1, max: 1000000, describe: 'Minimum exact headcount, for numeric ranges like "50-100 employees".' },
  employeesMax: { kind: 'int', min: 1, max: 1000000, describe: 'Maximum exact headcount.' },
  revenues: { kind: 'enum', facet: 'revenue', describe: 'Revenue bands.' },
  countries: { kind: 'enum', facet: 'country', describe: 'Country the person is based in.' },
  hqCountries: { kind: 'enum', facet: 'hq_country', describe: 'Country of the company headquarters.' },
  cities: { kind: 'text', describe: 'City or region names the person is located in, e.g. "London", "Manchester", "Greater London".' },
  companies: { kind: 'text', describe: 'Company names (or parts of names) to include.' },
  companiesNot: { kind: 'text', describe: 'Company names to exclude.' },
  domains: { kind: 'text', describe: 'Company website domains or parts, e.g. ".co.uk".' },
  hasMobile: { kind: 'bool', describe: 'Yes when the user wants people with a mobile number ("with a mobile", "who I can call").' },
  mobileCodes: { kind: 'enum', facet: 'mobile_code', describe: 'Mobile dial codes, e.g. "+44" for UK mobiles.' },
  hasEmail: { kind: 'bool', describe: 'Yes when the user wants a work email.' },
  emailStatus: { kind: 'enum', facet: 'email_status', describe: 'Email verification status.' },
  hasPersonalEmail: { kind: 'bool', describe: 'Has a personal email.' },
  hasLinkedin: { kind: 'bool', describe: 'Has a LinkedIn profile.' },
  openToWork: { kind: 'bool', describe: 'Person is open to work.' },
  isHiring: { kind: 'bool', describe: 'Company is hiring now.' },
  tenureMin: { kind: 'int', min: 0, max: 600, describe: 'Minimum months in current role ("over 2 years" → 24).' },
  tenureMax: { kind: 'int', min: 0, max: 600, describe: 'Maximum months in current role ("new in role" → 6).' },
  foundedMin: { kind: 'int', min: 1700, max: 2100, describe: 'Earliest company founding year.' },
  foundedMax: { kind: 'int', min: 1700, max: 2100, describe: 'Latest company founding year.' },
  funding: { kind: 'enum', facet: 'funding', describe: 'Last funding round type.' },
  hasFunding: { kind: 'bool', describe: 'Company has raised funding ("VC-backed", "funded").' },
  skills: { kind: 'text', describe: 'Skills listed on the profile.' },
  languages: { kind: 'text', describe: 'Languages the person speaks.' },
  tech: { kind: 'text', describe: 'Technologies in the company tech stack, e.g. "HubSpot", "Salesforce", "AWS".' },
  tags: { kind: 'enum', facet: 'tag', describe: 'Career and company signals.' },
};

export const LOCAL_FIELDS: Record<string, Field> = {
  keywords: { kind: 'enum', facet: 'keyword', describe: 'Exact search terms the listings were collected under (only when one clearly matches).' },
  categories: { kind: 'text', describe: 'Business category words; matches the main or any secondary category containing ANY of them. Use singular trade words, e.g. "plumber", "electrician", "accountant", "dentist", "cafe".' },
  domains: { kind: 'text', describe: 'Website domains or parts.' },
  cities: { kind: 'text', describe: 'Town, city or area names, e.g. "London", "Shoreditch", "Leeds".' },
  postcodes: { kind: 'text', describe: 'UK postcode areas or districts (start of the postcode), e.g. "E1", "M1", "LS".' },
  countries: { kind: 'enum', facet: 'country', describe: 'Country code of the listing.' },
  minRating: { kind: 'num', min: 0, max: 5, describe: 'Minimum Google rating, 0–5 ("well reviewed" → 4.5).' },
  maxRating: { kind: 'num', min: 0, max: 5, describe: 'Maximum Google rating ("poorly rated" → 3.5).' },
  hasRating: { kind: 'bool', describe: 'Has a Google rating.' },
  hasPhone: { kind: 'bool', describe: 'Yes when the user wants businesses they can call.' },
  mobileOnly: { kind: 'bool', describe: 'Yes when the user wants a UK mobile number (+44 7).' },
  hasEmail: { kind: 'bool', describe: 'Has an email address.' },
  hasWebsite: { kind: 'bool', describe: 'No for "no website" (e.g. selling web design), yes for "has a website".' },
  hasWhatsapp: { kind: 'bool', describe: 'On WhatsApp.' },
  hasFacebook: { kind: 'bool', describe: 'Has a Facebook page.' },
  hasInstagram: { kind: 'bool', describe: 'Has an Instagram account.' },
  hasLinkedin: { kind: 'bool', describe: 'Has a LinkedIn page.' },
  openSaturday: { kind: 'bool', describe: 'Open on Saturdays.' },
  openSunday: { kind: 'bool', describe: 'Open on Sundays.' },
};

const fieldsFor = (m: Mode) => (m === 'leads' ? LEAD_FIELDS : LOCAL_FIELDS);

// ---- output schema --------------------------------------------------------------
// Each mode is a list of { field, values } pairs rather than one property per filter: a
// property per filter (55 of them) compiles to a grammar too large for structured outputs.
// Lists use every value; yes/no filters use "yes" or "no"; numbers use one numeric string.
// The field meanings live in the system prompt (cached), and fromEntries/sanitize check it all.
function filterSchema(fields: Record<string, Field>) {
  return {
    type: 'array',
    items: {
      type: 'object',
      additionalProperties: false,
      required: ['field', 'values'],
      properties: {
        field: { type: 'string', enum: Object.keys(fields) },
        values: { type: 'array', items: { type: 'string' } },
      },
    },
  };
}

/** Turns the model's [{ field, values }] list into the filter object sanitize expects. */
export function fromEntries(mode: Mode, raw: unknown): Record<string, unknown> {
  if (!Array.isArray(raw)) return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const fields = fieldsFor(mode);
  const out: Record<string, unknown> = {};
  for (const e of raw.slice(0, 60)) {
    if (!e || typeof e !== 'object') continue;
    const { field, values } = e as { field?: unknown; values?: unknown };
    const f = typeof field === 'string' && Object.hasOwn(fields, field) ? fields[field] : undefined;
    if (!f || !Array.isArray(values) || !values.length) continue;
    const first = String(values[0]).trim().toLowerCase();
    if (f.kind === 'bool') {
      if (first === 'yes' || first === 'true') out[field as string] = true;
      else if (first === 'no' || first === 'false') out[field as string] = false;
    } else if (f.kind === 'int' || f.kind === 'num') {
      const n = Number(first.replace(/[,£$€+]/g, ''));
      if (first && Number.isFinite(n)) out[field as string] = n;
    } else {
      out[field as string] = [...((out[field as string] as unknown[]) ?? []), ...values];
    }
  }
  return out;
}

export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggested_mode', 'mode_reason', 'title', 'summary', 'notes', 'leads', 'local'],
  properties: {
    suggested_mode: { type: 'string', enum: ['leads', 'local'], description: 'Which database fits the request best.' },
    mode_reason: { type: 'string', description: 'One short sentence on why, written to the user (no jargon).' },
    title: { type: 'string', description: 'A short list name, under 60 characters, e.g. "Software CEOs, 50–100 staff, with mobiles".' },
    summary: { type: 'string', description: 'One plain sentence describing exactly what is being searched for.' },
    notes: { type: 'array', items: { type: 'string' }, description: 'Parts of the request that cannot be expressed with these filters, each as a short sentence. Empty if none.' },
    leads: filterSchema(LEAD_FIELDS),
    local: filterSchema(LOCAL_FIELDS),
  },
} as const;

// ---- system prompt (stable per facet snapshot, so it caches) --------------------------
const list = (v: string[] | undefined, n: number) => (v ?? []).slice(0, n).map((x) => `- ${x}`).join('\n');

const KIND_LABEL: Record<Kind, string> = { text: 'list, free text', enum: 'list, allowed values below', bool: 'yes/no', int: 'number', num: 'number' };
const fieldList = (fields: Record<string, Field>) => Object.entries(fields).map(([k, f]) => `- ${k} (${KIND_LABEL[f.kind]}): ${f.describe}`).join('\n');

export function systemPrompt(facets: { leads: Facets; local: Facets }, gaps: string[] = []): string {
  const L = facets.leads;
  const G = facets.local;
  return `You turn a sales rep's request into search filters for Decibel, a UK and EU outbound sales tool. You never answer in prose: you only return the JSON object described by the schema.

There are two databases:
1. "leads": B2B decision-makers (people at companies), about 690,000, mostly UK, also Germany, Netherlands, Italy, France and more. Each has a job title, seniority, department, company, industry, headcount, revenue, location, and often a mobile and work email.
2. "local": local businesses from map listings, about 365,000, mostly UK (GB) with some US. Each has a name, category, town, postcode, Google rating, phone, email, website, social links and opening hours. There are no people or job titles here.

How to choose suggested_mode:
- Requests about people, job titles, roles, decision-makers, companies by industry or headcount → "leads".
- Requests about trades, shops, venues, local services, high-street or map-style businesses (plumbers, cafés, dentists, salons, garages, electricians, gyms, estate agents in a town) → "local".
- If both could work, prefer the mode the user selected.

Fill filters for the selected mode, always. If suggested_mode differs from the selected mode, ALSO fill the other mode's filters so the user can switch without asking again. Each filter is one { field, values } entry; leave out every filter you do not need. List filters take every value; yes/no filters take ["yes"] or ["no"]; number filters take one number, e.g. ["50"]. Never invent filters the request did not ask for, except: when the user asks for people "with a mobile" or "to call", set hasMobile "yes" (leads) or hasPhone "yes" (local).

Rules for leads:
- Job titles: put the role words in titles, with common variants and abbreviations (CEO → "CEO", "Chief Executive"; founder → "Founder", "Co-Founder", "Owner"; MD → "Managing Director"; IT manager → "IT Manager", "Head of IT", "IT Director"). Use seniorities as well only when the request is about a level ("directors", "C-level", "senior people") rather than a specific role.
- Headcount numbers ("50-100 employees", "over 200 staff") go in employeesMin/employeesMax. Use sizes only for vague words ("small companies" → 1 to 10 and 11 to 50, "SMEs" → 11 to 50, 51 to 200, 201 to 500, "enterprise" → 1001 to 5000, 5001 to 10000, 10001+).
- Locations: a country goes in countries (exact value from the list); a city or region goes in cities ("London" → "London").
- Pick industries only from the list below, choosing every value that fits.
- Enum filters must use values exactly as written in the lists below.

Rules for local:
- Trades and business types go in categories as simple singular words ("plumbing companies" → "plumber"; "coffee shops" → "cafe", "coffee shop").
- Towns and areas go in cities; postcode areas go in postcodes. "UK" means countries ["GB"].
- "No website" → hasWebsite "no". "Mobile number" → mobileOnly "yes". "Good reviews" / "well rated" → minRating 4.5.

Write title and summary in plain British English, sentence case, no emoji.
${gaps.length ? `\nLimits of the data right now:\n${gaps.map((g) => `- ${g}`).join('\n')}\n` : ''}

Lead filter fields:
${fieldList(LEAD_FIELDS)}

Local filter fields:
${fieldList(LOCAL_FIELDS)}

Allowed values for leads:
seniorities:
${list(L.seniority, 20)}
departments:
${list(L.department, 40)}
sizes:
${list(L.size, 20)}
revenues:
${list(L.revenue, 20)}
countries:
${list(L.country, 60)}
hqCountries:
${list(L.hq_country, 60)}
emailStatus:
${list(L.email_status, 10)}
funding:
${list(L.funding, 40)}
mobileCodes:
${list(L.mobile_code, 40)}
tags:
${list(L.tag, 60)}
industries:
${list(L.industry, 400)}

Allowed values for local:
countries:
${list(G.country, 20)}
keywords (only use when one clearly matches; otherwise use categories and cities):
${list(G.keyword, 400)}
common categories (for reference; categories is free text):
${list(G.category, 200)}`;
}

// ---- sanitiser ---------------------------------------------------------------------
const canon = (values: string[] | undefined) => new Map((values ?? []).map((v) => [v.toLowerCase(), v]));

/** Keeps only whitelisted filters with valid types, and enum values that exist in the data. */
export function sanitize(mode: Mode, raw: unknown, facets: Facets): { filters: Filters; dropped: string[] } {
  const fields = fieldsFor(mode);
  const out: Filters = {};
  const dropped: string[] = [];
  if (!raw || typeof raw !== 'object') return { filters: out, dropped };
  for (const [k, v] of Object.entries(fromEntries(mode, raw))) {
    const f = fields[k];
    if (!f || v === null || v === undefined) continue;
    if (f.kind === 'bool') {
      if (typeof v === 'boolean') out[k] = v;
    } else if (f.kind === 'int' || f.kind === 'num') {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) out[k] = f.kind === 'int' ? Math.round(Math.min(Math.max(n, f.min ?? -Infinity), f.max ?? Infinity)) : Math.min(Math.max(n, f.min ?? -Infinity), f.max ?? Infinity);
    } else if (Array.isArray(v)) {
      const strings = [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 80)).filter(Boolean))].slice(0, 20);
      if (f.kind === 'enum') {
        const allowed = canon(facets[f.facet!]);
        const kept: string[] = [];
        for (const s of strings) {
          const hit = allowed.get(s.toLowerCase());
          if (hit) kept.push(hit);
          else dropped.push(s);
        }
        if (kept.length) out[k] = kept;
      } else if (strings.length) out[k] = strings;
    }
  }
  // a range given back to front is still what the person meant
  for (const [lo, hi] of mode === 'leads' ? [['employeesMin', 'employeesMax'], ['tenureMin', 'tenureMax'], ['foundedMin', 'foundedMax']] : [['minRating', 'maxRating']]) {
    if (typeof out[lo] === 'number' && typeof out[hi] === 'number' && (out[lo] as number) > (out[hi] as number)) [out[lo], out[hi]] = [out[hi], out[lo]];
  }
  return { filters: out, dropped };
}

export const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');
```

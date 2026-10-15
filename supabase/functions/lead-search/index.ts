// Lead search on Typesense. POST with the user's JWT:
//   { workspace_id, filters, offset?, limit? (0–500, 0 = count only), ids_only? }
//   -> { rows, count: { n, exact: true }, took_ms }        or, with ids_only (limit up to 1,000): { ids, count }
// Typesense returns at most 250 hits per request, so bigger pages are fetched in 250-hit steps.
//
// Typesense (search/typesense) finds the matching lead ids and the exact total from the same
// filter keys Leads already sends (lib/lead-search.ts). The full rows for the page come from
// Supabase (leads_by_ids), so contact details stay masked until revealed and the DNC flag is live.
// Exact-match values are stored in Typesense as crc32 numbers (fields ending _h); hashed here the
// same way as load-leads.py.
import { admin, corsHeaders, fail, getRole, getUser, json, SUPABASE_URL } from '../_shared/http.ts';
import { crc } from '../_shared/crc.ts';

const TS_URL = (Deno.env.get('TYPESENSE_URL') ?? '').replace(/\/$/, '');
const TS_KEY = Deno.env.get('TYPESENSE_API_KEY') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

type Filters = Record<string, unknown>;

// ---- filters -> Typesense --------------------------------------------------------------
/** every per-lead cap the email/mobile finders offer, now or before (USD) */
const CHECK_CAPS = [0, 0.005, 0.01, 0.02, 0.03, 0.05, 0.1, 0.15, 0.25, 0.3, 0.75];
const list = (f: Filters, k: string): string[] =>
  Array.isArray(f[k]) ? (f[k] as unknown[]).filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, 50) : [];
const bool = (f: Filters, k: string): boolean | null => (typeof f[k] === 'boolean' ? (f[k] as boolean) : null);
const int = (f: Filters, k: string): number | null => (typeof f[k] === 'number' && Number.isFinite(f[k]) ? Math.round(f[k] as number) : null);
// characters that mean something in a Typesense filter or query
const clean = (s: string) => s.replace(/[`[\],:()|&!=<>*"\\-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/** "contains any of these" on a text field: one word matches as a prefix, several words must all appear */
function contains(field: string, values: string[]): string | null {
  const parts = values.map(clean).filter(Boolean).map((v) => (v.includes(' ') ? `\`${v}\`` : `${v}*`));
  return parts.length ? `${field}:[${parts.join(', ')}]` : null;
}
const exact = (field: string, values: string[]) => (values.length ? `${field}:=[${values.map(crc).join(', ')}]` : null);

function daysSinceEpochMonthsAgo(months: number): number {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - months);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86_400_000);
}

export function toTypesense(f: Filters): { q: string; queryBy: string; filterBy: string; text: boolean } {
  const c: (string | null)[] = [];
  c.push(contains('current_title', list(f, 'titles')));
  c.push(exact('seniority_h', list(f, 'seniorities')));
  c.push(exact('department_h', list(f, 'departments')));
  const ind = list(f, 'industries');
  if (ind.length) c.push(`(${exact('main_industry_h', ind)} || ${exact('company_industry_h', ind)})`);
  const indNot = list(f, 'industriesNot');
  if (indNot.length) c.push(`main_industry_h:!=[${indNot.map(crc).join(', ')}] && company_industry_h:!=[${indNot.map(crc).join(', ')}]`);
  c.push(exact('size_h', list(f, 'sizes')));
  const eMin = int(f, 'employeesMin');
  const eMax = int(f, 'employeesMax');
  if (eMin !== null) c.push(`employees:>=${eMin}`);
  if (eMax !== null) c.push(`employees:<=${eMax}`);
  c.push(exact('revenue_h', list(f, 'revenues')));
  c.push(exact('country_h', list(f, 'countries')));
  c.push(exact('hq_country_h', list(f, 'hqCountries')));
  c.push(contains('location', list(f, 'cities')));
  c.push(contains('company', list(f, 'companies')));
  c.push(contains('company_domain', list(f, 'domains')));
  const codes = list(f, 'mobileCodes').filter((x) => /^\+[0-9]{1,4}$/.test(x));
  c.push(exact('mobile_codes_h', codes));
  c.push(exact('email_status_h', list(f, 'emailStatus')));
  c.push(exact('funding_h', list(f, 'funding')));
  for (const [key, field] of [
    ['hasMobile', 'has_mobile'], ['hasEmail', 'has_email'], ['hasPersonalEmail', 'has_personal_email'], ['hasLinkedin', 'has_linkedin'],
    ['openToWork', 'open_to_work'], ['isHiring', 'is_hiring'], ['hasFunding', 'has_funding'], ['hasWebsite', 'has_website'],
  ]) {
    const v = bool(f, key);
    if (v !== null) c.push(`${field}:=${v}`);
  }
  // admin finders: leave out leads already looked up at this cap or higher (lead-enrich marks mobile_checked /
  // email_checked with the cap in micro-dollars plus one); leads never looked up have no mark and stay in
  for (const [key, field] of [['mobileUncheckedAt', 'mobile_checked'], ['emailUncheckedAt', 'email_checked']]) {
    const cap = typeof f[key] === 'number' && Number.isFinite(f[key]) ? (f[key] as number) : null;
    if (cap === null) continue;
    const codes = CHECK_CAPS.filter((c) => c >= cap - 1e-9).map((c) => Math.round(c * 1e6) + 1);
    if (codes.length) c.push(`${field}:!=[${codes.join(', ')}]`);
  }
  const tMin = int(f, 'tenureMin');
  const tMax = int(f, 'tenureMax');
  if (tMin !== null) c.push(`role_start:<=${daysSinceEpochMonthsAgo(tMin)}`);
  if (tMax !== null) c.push(`role_start:>=${daysSinceEpochMonthsAgo(tMax)}`);
  const fMin = int(f, 'foundedMin');
  const fMax = int(f, 'foundedMax');
  if (fMin !== null) c.push(`founded:>=${fMin}`);
  if (fMax !== null) c.push(`founded:<=${fMax}`);
  c.push(contains('smart_tags', list(f, 'tags')));
  c.push(contains('skills', list(f, 'skills')));
  c.push(contains('languages', list(f, 'languages')));
  c.push(contains('tech', list(f, 'tech')));

  // free text and exclusions go in the query: "-word" leaves out anything containing that word
  const text = typeof f.q === 'string' ? clean(f.q) : '';
  const not = (vals: string[]) => vals.map(clean).filter(Boolean).map((v) => (v.includes(' ') ? `-"${v}"` : `-${v}`));
  const titlesNot = not(list(f, 'titlesNot'));
  const companiesNot = not(list(f, 'companiesNot'));
  const by = [
    ...(text ? ['full_name', 'current_title', 'company'] : []),
    ...(!text && titlesNot.length ? ['current_title'] : []),
    ...(!text && companiesNot.length ? ['company'] : []),
  ];
  return {
    q: [text || '*', ...titlesNot, ...companiesNot].join(' '),
    queryBy: by.join(','),
    filterBy: c.filter(Boolean).join(' && '),
    text: !!text,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  if (!TS_URL || !TS_KEY) return fail('search_not_configured', 503);
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const input = await req.json().catch(() => ({}));
  const workspaceId = String(input.workspace_id ?? '');
  const filters: Filters = input.filters && typeof input.filters === 'object' ? input.filters : {};
  const idsOnly = input.ids_only === true;
  const limit = Math.min(Math.max(Number.isFinite(input.limit) ? Math.round(input.limit) : 100, 0), idsOnly ? 1000 : 500);
  const offset = Math.min(Math.max(Number.isFinite(input.offset) ? Math.round(input.offset) : 0, 0), 1_000_000);

  const [role, rate] = await Promise.all([
    getRole(user.id, workspaceId),
    admin().rpc('check_rate_limit', { p_key: `lead-search:${user.id}`, p_limit: 240, p_window_seconds: 60 }),
  ]);
  if (!role) return fail('forbidden', 403);
  if (rate.data === false) return fail('rate_limited', 429);

  const t = toTypesense(filters);
  const started = Date.now();
  const ids: string[] = [];
  let found = 0;
  // at least one request (it carries the count), then 250-hit steps until the page is full or the results run out
  for (;;) {
    const step = Math.min(250, limit - ids.length);
    const params = new URLSearchParams({
      q: t.q,
      filter_by: t.filterBy,
      sort_by: t.text ? '_text_match:desc,rank:asc' : 'rank:asc',
      offset: String(offset + ids.length),
      limit: String(step),
      include_fields: 'id',
      num_typos: '0',
      prefix: 'true',
      drop_tokens_threshold: '0',
      typo_tokens_threshold: '0',
      exhaustive_search: 'true',
    });
    if (t.queryBy) params.set('query_by', t.queryBy);
    const res = await fetch(`${TS_URL}/collections/leads/documents/search?${params}`, { headers: { 'X-TYPESENSE-API-KEY': TS_KEY } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error('typesense', res.status, body?.message, t.filterBy);
      return fail('search_failed', 502, { message: 'Search is unavailable right now. Try again in a moment.' });
    }
    found = body.found ?? 0;
    const hits: string[] = (body.hits ?? []).map((h: { document: { id: string } }) => h.document.id);
    ids.push(...hits);
    if (step === 0 || hits.length < step || ids.length >= limit) break;
  }
  const count = { n: found, exact: true };
  if (idsOnly) return json({ ids, count, took_ms: Date.now() - started });
  if (!ids.length) return json({ rows: [], count, took_ms: Date.now() - started });

  // full rows for this page, as the user (membership checked again by the function)
  const rowsRes = await fetch(`${SUPABASE_URL}/rest/v1/rpc/leads_by_ids`, {
    method: 'POST',
    headers: { apikey: ANON, authorization: req.headers.get('authorization') ?? '', 'content-type': 'application/json' },
    body: JSON.stringify({ p_workspace_id: workspaceId, p_ids: ids }),
  });
  if (!rowsRes.ok) {
    console.error('leads_by_ids', rowsRes.status, await rowsRes.text());
    return fail('search_failed', 502, { message: 'Search is unavailable right now. Try again in a moment.' });
  }
  return json({ rows: await rowsRes.json(), count, took_ms: Date.now() - started });
});

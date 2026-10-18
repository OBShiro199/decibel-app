// Website visitors for the app (migration 0042). POST with the user's JWT:
//   { workspace_id, site_id?, offset?, limit? (≤ 50) }
//   -> { companies: [{ ...visitor company, people: [decision makers], people_found }], total }
// Companies come from visitor_companies through RLS (as the user). The decision makers at each company are
// found on the search server (Typesense, by exact company domain, C-level → Manager) in one multi_search
// request, and their rows come from leads_by_ids as the user, so emails and mobiles stay masked until the
// lead is revealed and the DNC flag is live.
import { corsHeaders, fail, getRole, getUser, json, SUPABASE_URL } from '../_shared/http.ts';
import { crc } from '../_shared/crc.ts';

const TS_URL = (Deno.env.get('TYPESENSE_URL') ?? '').replace(/\/$/, '');
const TS_KEY = Deno.env.get('TYPESENSE_API_KEY') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SENIORITY = ['c-level', 'vp', 'director', 'manager'];
const PER_COMPANY = 3;
// candidates per seniority level: the ones with a mobile or an email are shown first
const CANDIDATES = 6;

/** a PostgREST call as the signed-in user, so RLS and membership checks apply */
async function asUser<T>(req: Request, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    ...init,
    headers: { apikey: ANON, authorization: req.headers.get('authorization') ?? '', 'content-type': 'application/json', Prefer: 'count=exact', ...(init?.headers ?? {}) },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(String(body?.message ?? `${path} failed`));
  return body as T;
}

const tick = (s: string) => `\`${s.replace(/`/g, '')}\``;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const input = await req.json().catch(() => ({}));
  const workspaceId = String(input.workspace_id ?? '');
  if (!(await getRole(user.id, workspaceId))) return fail('forbidden', 403);
  const limit = Math.min(Math.max(Math.round(Number(input.limit) || 25), 1), 50);
  const offset = Math.min(Math.max(Math.round(Number(input.offset) || 0), 0), 100_000);
  const siteId = typeof input.site_id === 'string' ? input.site_id : null;

  try {
    const q = new URLSearchParams({
      select: 'id,site_id,domain,organization,country,region,city,isp,last_ip,page_views,visits,pages,first_seen,last_seen',
      workspace_id: `eq.${workspaceId}`,
      order: 'last_seen.desc',
      offset: String(offset),
      limit: String(limit),
    });
    if (siteId) q.set('site_id', `eq.${siteId}`);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/visitor_companies?${q}`, {
      headers: { apikey: ANON, authorization: req.headers.get('authorization') ?? '', Prefer: 'count=exact' },
    });
    if (!res.ok) return fail('visitors_failed', 500, { message: (await res.text()).slice(0, 200) });
    const companies = (await res.json()) as { domain: string }[];
    const total = Number((res.headers.get('content-range') ?? '').split('/')[1] ?? companies.length) || companies.length;
    if (!companies.length || !TS_URL || !TS_KEY) return json({ companies: companies.map((c) => ({ ...c, people: [], people_found: 0 })), total });

    // decision makers at each company, most senior first: one search per company and seniority level (C-level
    // first), sent to the search server in batches of 50 (its multi_search limit)
    const searches = companies.flatMap((c) => {
      const d = c.domain.toLowerCase();
      const variants = [d, `www.${d}`, `https://${d}`, `http://${d}`, `https://www.${d}`, `http://www.${d}`];
      const domainFilter = `company_domain:=[${variants.map(tick).join(', ')}]`;
      return SENIORITY.map((s) => ({ collection: 'leads', q: '*', filter_by: `${domainFilter} && seniority_h:=${crc(s)}`, per_page: CANDIDATES, include_fields: 'id' }));
    });
    const chunks: (typeof searches)[] = [];
    for (let i = 0; i < searches.length; i += 50) chunks.push(searches.slice(i, i + 50));
    const results = (
      await Promise.all(
        chunks.map(async (chunk) => {
          const ms = await fetch(`${TS_URL}/multi_search`, {
            method: 'POST',
            headers: { 'X-TYPESENSE-API-KEY': TS_KEY, 'content-type': 'application/json' },
            body: JSON.stringify({ searches: chunk }),
          });
          const body = await ms.json().catch(() => ({}));
          return (body.results ?? []) as { found?: number; hits?: { document: { id: string } }[] }[];
        }),
      )
    ).flat();
    const perCompany = companies.map((_, ci) => {
      const levels = results.slice(ci * SENIORITY.length, (ci + 1) * SENIORITY.length);
      const ids = levels.flatMap((r) => (r?.hits ?? []).map((h) => h.document.id));
      return { ids, found: levels.reduce((a, r) => a + (r?.found ?? 0), 0) };
    });

    const allIds = perCompany.flatMap((p) => p.ids);
    const rows = allIds.length
      ? await asUser<Record<string, unknown>[]>(req, '/rest/v1/rpc/leads_by_ids', { method: 'POST', body: JSON.stringify({ p_workspace_id: workspaceId, p_ids: allIds }) })
      : [];
    const byId = new Map(rows.map((r) => [String(r.lead_id), r]));
    const out = companies.map((c, i) => {
      const p = perCompany[i] ?? { ids: [], found: 0 };
      // most senior first; within a level, people with a mobile, then an email, come first
      const rankOf = (r: Record<string, unknown>) => SENIORITY.indexOf(String(r.seniority_level)) * 4 + (r.has_mobile ? 0 : 2) + (r.has_email ? 0 : 1);
      const people = p.ids
        .map((id) => byId.get(id))
        .filter((r): r is Record<string, unknown> => !!r)
        .sort((a, b) => rankOf(a) - rankOf(b))
        .slice(0, PER_COMPANY)
        .map((r) => ({
          lead_id: r!.lead_id,
          full_name: r!.full_name,
          title: r!.current_title,
          seniority: r!.seniority_level,
          email: r!.email,
          has_email: r!.has_email,
          mobile: r!.mobile,
          has_mobile: r!.has_mobile,
          linkedin_url: r!.linkedin_url,
          person_id: r!.person_id,
          on_dnc: r!.on_dnc,
        }));
      return { ...c, people, people_found: p.found };
    });
    return json({ companies: out, total });
  } catch (e) {
    console.error('visitor-companies', (e as Error).message);
    return fail('visitors_failed', 500, { message: 'Could not load visitors. Try again in a moment.' });
  }
});

// Find missing work emails (migration 0035) or mobiles (0036) through treg, for platform admins. POST with the user's JWT:
//   { ids: string[] (≤ 12), kind?: 'email' | 'mobile', max_cost?: number (USD per lead, default 0.03 for email,
//     0.005 for mobile = QuickEnrich alone), verify?: boolean (default true for email, false for mobile) }
//   -> { results: [{ id, email, verdict, saved, cost_micro }], cost_micro, pending: string[], retry: string[] }
// `retry` (mobiles): leads where a provider was rate-limited or failed; send them again with round: 1, 2…
// A treg lookup with verification can take most of a minute when it falls back across providers, and the
// gateway drops a request after about two, so each call stops starting new leads after START_BUDGET_MS and
// returns the ones it did not start as `pending` for the browser to send again; each lookup is cut off at
// LOOKUP_TIMEOUT_MS.
// Each lead goes to treg.people.email.find (LinkedIn URL plus name and domain, so treg can fall back
// across providers within the per-lead cap). Only emails the mailbox check rates valid or catch-all are
// saved, into leads with no work email yet; the search index is updated straight away.
// Mobiles go to treg.people.phone.find; misses are free there, so the cap decides which providers are asked
// (cheapest first). With verify, a found number gets a live-line check and a dead line is not saved.
import { corsHeaders, fail, getUser, json, SUPABASE_URL } from '../_shared/http.ts';
import { crc } from '../_shared/crc.ts';

const TREG = Deno.env.get('TREG_TOKEN') ?? '';
const TS_URL = (Deno.env.get('TYPESENSE_URL') ?? '').replace(/\/$/, '');
const TS_KEY = Deno.env.get('TYPESENSE_API_KEY') ?? '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const CONCURRENCY = 4;
const START_BUDGET_MS = 40_000;
const LOOKUP_TIMEOUT_MS = 55_000;

interface Input {
  contact_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  domain: string | null;
  linkedin_url: string | null;
  work_email: string | null;
  mobile_phone?: string | null;
}

interface Found {
  email?: string | null;
  phone?: string | null;
  line_type?: string | null;
  verdict: string;
  served_by: string | null;
  cost_micro: number;
  call_id: string | null;
}

async function rpc<T>(req: Request, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, authorization: req.headers.get('authorization') ?? '', 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(String(body?.message ?? `${fn} failed`));
  return body as T;
}

/** one routed treg call with the per-lead cap; null when it ran past LOOKUP_TIMEOUT_MS */
async function treg(endpoint: string, body: Record<string, string>, maxCost: number, verify: boolean, key: string) {
  const res = await fetch(`https://treg.to/call/${endpoint}`, {
    method: 'POST',
    headers: {
      'X-Treg-Token': TREG,
      'content-type': 'application/json',
      'X-Treg-Route-Max-Cost': String(maxCost),
      ...(verify ? { 'X-Treg-Route-Verify': 'true' } : {}),
      // a retry of this exact lookup returns the stored answer instead of paying again
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  }).catch((e) => {
    if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') return null;
    throw e;
  });
  if (!res) return null;
  const cost = Number(res.headers.get('X-Treg-Cost-Micro') ?? 0) || 0;
  const callId = res.headers.get('X-Treg-Call-Id');
  if (!res.ok) {
    const text = await res.text();
    // out of treg balance stops the whole run
    if (res.status === 402 && !text.includes('route_max_cost')) throw new Error('treg_balance');
    return { ok: false as const, cost, callId, servedBy: null, d: null };
  }
  const d = await res.json().catch(() => ({}));
  // a routed call can skip providers for lack of balance and still answer 200; that is the balance running out,
  // not a miss (logging it as a miss would keep the lead out of later runs)
  const tried: { outcome?: string; detail?: string }[] = d?._treg?.tried ?? [];
  if (!d?.output?.email && !d?.output?.phone && tried.some((t) => /balance|insufficient|top.?up/i.test(t.detail ?? '')))
    throw new Error('treg_balance');
  return { ok: true as const, cost, callId, servedBy: (d?._treg?.served_by ?? res.headers.get('X-Treg-Served-By')) as string | null, d };
}

/** who the lead is, in the shapes treg's finders accept */
function identity(lead: Input): Record<string, string> {
  const body: Record<string, string> = {};
  if (lead.linkedin_url) body.linkedin_url = lead.linkedin_url;
  if (lead.domain) {
    body.domain = lead.domain;
    if (lead.first_name && lead.last_name) {
      body.first_name = lead.first_name;
      body.last_name = lead.last_name;
    } else if (lead.full_name) body.full_name = lead.full_name;
  }
  return body;
}

async function findMobile(lead: Input, maxCost: number, verify: boolean, round: number): Promise<Found> {
  const body = identity(lead);
  if (lead.work_email) body.email = lead.work_email;
  if (!Object.keys(body).length) return { phone: null, verdict: 'miss', served_by: null, cost_micro: 0, call_id: null };
  // a retry round gets its own key, or treg would replay the throttled answer
  const key = `decibel-mobile-${lead.contact_id}-${maxCost}-${verify ? 'v' : 'n'}${round ? `-r${round}` : ''}`;
  const r = await treg('treg.people.phone.find', body, maxCost, verify, key);
  if (!r) return { phone: null, verdict: 'timeout', served_by: null, cost_micro: 0, call_id: null };
  if (!r.ok) return { phone: null, verdict: 'miss', served_by: null, cost_micro: r.cost, call_id: r.callId };
  const phone: string | null = r.d?.output?.phone ?? null;
  // no number because a provider refused or failed (rate limit, outage), not because it had none: try again later
  const tried: { outcome?: string; status?: number | null }[] = r.d?._treg?.tried ?? [];
  if (!phone && tried.some((t) => t.status === 429 || (t.status ?? 0) >= 500 || t.outcome === 'error' || t.outcome === 'timeout'))
    return { phone: null, verdict: 'retry', served_by: null, cost_micro: r.cost, call_id: r.callId };
  const v = r.d?._treg?.verification;
  // a live-line check that says dead is not saved; live or no answer is
  const verdict = !phone ? 'miss' : verify && v?.checked && String(v.verdict) === 'dead' ? 'dead' : 'found';
  return { phone, line_type: r.d?.output?.line_type ?? null, verdict, served_by: r.servedBy, cost_micro: r.cost, call_id: r.callId };
}

async function findEmail(lead: Input, maxCost: number, verify: boolean): Promise<Found> {
  const body = identity(lead);
  if (!Object.keys(body).length) return { email: null, verdict: 'miss', served_by: null, cost_micro: 0, call_id: null };
  const r = await treg('treg.people.email.find', body, maxCost, verify, `decibel-enrich-${lead.contact_id}-${maxCost}-${verify ? 'v' : 'n'}`);
  if (!r) return { email: null, verdict: 'timeout', served_by: null, cost_micro: 0, call_id: null };
  if (!r.ok) return { email: null, verdict: 'miss', served_by: null, cost_micro: r.cost, call_id: r.callId };
  const email: string | null = r.d?.output?.email ?? null;
  const v = r.d?._treg?.verification;
  // with verification on, trust the mailbox check; without it, a provider-verified hit counts as valid
  const verdict: string = !email ? 'miss' : verify ? (v?.checked ? String(v.verdict) : 'unknown') : r.d?.output?.verified ? 'valid' : 'unknown';
  return { email, verdict, served_by: r.servedBy, cost_micro: r.cost, call_id: r.callId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  if (!TREG) return fail('treg_not_configured', 503);
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const input = await req.json().catch(() => ({}));
  const ids: string[] = (Array.isArray(input.ids) ? input.ids : []).filter((x: unknown) => typeof x === 'string').slice(0, 12);
  const mobile = input.kind === 'mobile';
  const maxCost = mobile
    ? Math.min(Math.max(Number(input.max_cost) || 0.005, 0.005), 0.75)
    : Math.min(Math.max(Number(input.max_cost) || 0.03, 0.005), 0.15);
  const verify = mobile ? input.verify === true : input.verify !== false;
  const round = Math.min(Math.max(Math.round(Number(input.round) || 0), 0), 3);
  if (!ids.length) return json({ results: [], cost_micro: 0 });

  try {
    if (!(await rpc<boolean>(req, 'is_platform_admin', {}))) return fail('forbidden', 403);
    const leads = await rpc<Input[]>(req, mobile ? 'admin_mobile_inputs' : 'admin_enrich_inputs', { p_ids: ids });
    const todo = leads.filter((l) => (mobile ? !l.mobile_phone : !l.work_email));
    const results: { id: string; email?: string | null; phone?: string | null; verdict: string; saved: boolean; cost_micro: number }[] = [];
    let next = 0;
    let stop: Error | null = null;
    const retry: string[] = [];
    const started = Date.now();
    const worker = async () => {
      while (next < todo.length && !stop && Date.now() - started < START_BUDGET_MS) {
        const lead = todo[next++];
        try {
          if (mobile) {
            const r = await findMobile(lead, maxCost, verify, round);
            if (r.verdict === 'retry') {
              retry.push(lead.contact_id);
              results.push({ id: lead.contact_id, phone: null, verdict: 'retry', saved: false, cost_micro: r.cost_micro });
              continue;
            }
            const phone = await rpc<string | null>(req, 'admin_save_mobile', {
              p_contact_id: lead.contact_id,
              p_phone: r.phone,
              p_line_type: r.line_type,
              p_verdict: r.verdict,
              p_served_by: r.served_by,
              p_cost_micro: r.cost_micro,
              p_call_id: r.call_id,
              p_max_cost: maxCost,
            });
            if (phone && TS_URL && TS_KEY) {
              // the same dialling-code prefixes the loader indexes ("+4", "+44", "+447", "+4474")
              const p = phone.replace(/[^0-9+]/g, '').slice(0, 5);
              await fetch(`${TS_URL}/collections/leads/documents/${lead.contact_id}`, {
                method: 'PATCH',
                headers: { 'X-TYPESENSE-API-KEY': TS_KEY, 'content-type': 'application/json' },
                body: JSON.stringify({ has_mobile: true, mobile_codes_h: Array.from({ length: p.length - 1 }, (_, n) => crc(p.slice(0, n + 2))) }),
              }).catch(() => {});
            }
            results.push({ id: lead.contact_id, phone, verdict: r.verdict, saved: !!phone, cost_micro: r.cost_micro });
            continue;
          }
          const r = await findEmail(lead, maxCost, verify);
          const saved = await rpc<boolean>(req, 'admin_save_enrichment', {
            p_contact_id: lead.contact_id,
            p_email: r.email,
            p_verdict: r.verdict,
            p_served_by: r.served_by,
            p_cost_micro: r.cost_micro,
            p_call_id: r.call_id,
            p_max_cost: maxCost,
          });
          if (saved && TS_URL && TS_KEY) {
            await fetch(`${TS_URL}/collections/leads/documents/${lead.contact_id}`, {
              method: 'PATCH',
              headers: { 'X-TYPESENSE-API-KEY': TS_KEY, 'content-type': 'application/json' },
              body: JSON.stringify({ has_email: true, email_status_h: crc(r.verdict === 'valid' ? 'VALID' : 'CATCH_ALL') }),
            }).catch(() => {});
          }
          results.push({ id: lead.contact_id, email: saved ? r.email : null, verdict: r.verdict, saved, cost_micro: r.cost_micro });
        } catch (e) {
          if ((e as Error).message === 'treg_balance') stop = e as Error;
          else console.error('lead-enrich', lead.contact_id, (e as Error).message);
          if (!stop) results.push({ id: lead.contact_id, email: null, verdict: 'error', saved: false, cost_micro: 0 });
        }
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, worker));
    const cost = results.reduce((a, r) => a + r.cost_micro, 0);
    if (stop) return fail('treg_balance', 402, { message: 'The treg balance has run out. Top it up in treg (Team → Billing) to continue.', results, cost_micro: cost });
    const pending = todo.slice(next).map((l) => l.contact_id);
    return json({ results, cost_micro: cost, skipped: leads.length - todo.length, pending, retry });
  } catch (e) {
    const m = (e as Error).message;
    console.error('lead-enrich', m);
    return fail(m.includes('forbidden') ? 'forbidden' : 'enrich_failed', m.includes('forbidden') ? 403 : 500, { message: m });
  }
});

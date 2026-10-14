// Find missing work emails through treg, for platform admins (migration 0035). POST with the user's JWT:
//   { ids: string[] (≤ 12), max_cost?: number (USD per lead, default 0.03), verify?: boolean (default true) }
//   -> { results: [{ id, email, verdict, saved, cost_micro }], cost_micro, pending: string[] }
// A treg lookup with verification can take most of a minute when it falls back across providers, and the
// gateway drops a request after about two, so each call stops starting new leads after START_BUDGET_MS and
// returns the ones it did not start as `pending` for the browser to send again; each lookup is cut off at
// LOOKUP_TIMEOUT_MS.
// Each lead goes to treg.people.email.find (LinkedIn URL plus name and domain, so treg can fall back
// across providers within the per-lead cap). Only emails the mailbox check rates valid or catch-all are
// saved, into leads with no work email yet; the search index is updated straight away.
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

async function find(lead: Input, maxCost: number, verify: boolean) {
  const body: Record<string, string> = {};
  if (lead.linkedin_url) body.linkedin_url = lead.linkedin_url;
  if (lead.domain) {
    body.domain = lead.domain;
    if (lead.first_name && lead.last_name) {
      body.first_name = lead.first_name;
      body.last_name = lead.last_name;
    } else if (lead.full_name) body.full_name = lead.full_name;
  }
  if (!Object.keys(body).length) return { email: null, verdict: 'miss', served_by: null, cost_micro: 0, call_id: null };
  const res = await fetch('https://treg.to/call/treg.people.email.find', {
    method: 'POST',
    headers: {
      'X-Treg-Token': TREG,
      'content-type': 'application/json',
      'X-Treg-Route-Max-Cost': String(maxCost),
      ...(verify ? { 'X-Treg-Route-Verify': 'true' } : {}),
      // a retry of this exact lookup returns the stored answer instead of paying again
      'Idempotency-Key': `decibel-enrich-${lead.contact_id}-${maxCost}-${verify ? 'v' : 'n'}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
  }).catch((e) => {
    if ((e as Error).name === 'TimeoutError' || (e as Error).name === 'AbortError') return null;
    throw e;
  });
  if (!res) return { email: null, verdict: 'timeout', served_by: null, cost_micro: 0, call_id: null };
  const cost = Number(res.headers.get('X-Treg-Cost-Micro') ?? 0) || 0;
  const callId = res.headers.get('X-Treg-Call-Id');
  if (!res.ok) {
    const text = await res.text();
    // out of treg balance stops the whole run
    if (res.status === 402 && !text.includes('route_max_cost')) throw new Error('treg_balance');
    return { email: null, verdict: 'miss', served_by: null, cost_micro: cost, call_id: callId };
  }
  const d = await res.json().catch(() => ({}));
  const email: string | null = d?.output?.email ?? null;
  const v = d?._treg?.verification;
  // with verification on, trust the mailbox check; without it, a provider-verified hit counts as valid
  const verdict: string = !email ? 'miss' : verify ? (v?.checked ? String(v.verdict) : 'unknown') : d?.output?.verified ? 'valid' : 'unknown';
  return { email, verdict, served_by: d?._treg?.served_by ?? res.headers.get('X-Treg-Served-By'), cost_micro: cost, call_id: callId };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  if (!TREG) return fail('treg_not_configured', 503);
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const input = await req.json().catch(() => ({}));
  const ids: string[] = (Array.isArray(input.ids) ? input.ids : []).filter((x: unknown) => typeof x === 'string').slice(0, 12);
  const maxCost = Math.min(Math.max(Number(input.max_cost) || 0.03, 0.005), 0.15);
  const verify = input.verify !== false;
  if (!ids.length) return json({ results: [], cost_micro: 0 });

  try {
    if (!(await rpc<boolean>(req, 'is_platform_admin', {}))) return fail('forbidden', 403);
    const leads = await rpc<Input[]>(req, 'admin_enrich_inputs', { p_ids: ids });
    const todo = leads.filter((l) => !l.work_email);
    const results: { id: string; email: string | null; verdict: string; saved: boolean; cost_micro: number }[] = [];
    let next = 0;
    let stop: Error | null = null;
    const started = Date.now();
    const worker = async () => {
      while (next < todo.length && !stop && Date.now() - started < START_BUDGET_MS) {
        const lead = todo[next++];
        try {
          const r = await find(lead, maxCost, verify);
          const saved = await rpc<boolean>(req, 'admin_save_enrichment', {
            p_contact_id: lead.contact_id,
            p_email: r.email,
            p_verdict: r.verdict,
            p_served_by: r.served_by,
            p_cost_micro: r.cost_micro,
            p_call_id: r.call_id,
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
    return json({ results, cost_micro: cost, skipped: leads.length - todo.length, pending });
  } catch (e) {
    const m = (e as Error).message;
    console.error('lead-enrich', m);
    return fail(m.includes('forbidden') ? 'forbidden' : 'enrich_failed', m.includes('forbidden') ? 403 : 500, { message: m });
  }
});

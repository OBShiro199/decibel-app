// TPS/CTPS checks worker. Never called from the browser: tps_create_job (migration 0023) starts
// it through pg_net with the vault cron secret, and the pg_cron sweeper restarts any check whose
// worker went quiet.
//   POST { job_id }  -> works through that check in the background
//   POST {}          -> sweep: settles finished checks and resumes stalled ones
//
// Numbers are claimed in batches with SKIP LOCKED (tps_claim) and saved with tps_save, which only
// writes numbers this worker holds, so two workers on one check can't double-check or double-charge.
// Credits were reserved when the check was created; the database refunds anything that didn't
// produce a result when the check settles. Fetch only, like the other functions.
import { admin, corsHeaders, fail, FUNCTIONS_URL, isCron, json } from '../_shared/http.ts';
import { esc, layout, p, sendEmail } from '../_shared/email.ts';

const KEY = Deno.env.get('PROVERO_API_KEY') ?? '';
const ENDPOINT = 'https://api.provero.io/api/validate/phone-tps';
const BATCH = 20;          // numbers claimed per round
const PARALLEL = 6;        // requests in flight at once
const RUN_FOR_MS = 100_000; // then hand over to a fresh invocation (wall-clock limits)

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void };

type Outcome =
  | { e164: string; status: 'done'; on_tps: boolean; on_ctps: boolean; tps_since: string | null; ctps_since: string | null }
  | { e164: string; status: 'invalid' | 'error' | 'retry'; error: string };

/** Thrown when the provider can't serve anyone (bad key, out of balance): stop the whole check. */
class ProviderDown extends Error {}

const date = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

async function check(e164: string): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ phone: e164 }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    return { e164, status: 'retry', error: `network: ${(e as Error).message}` };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok && typeof body.onTps === 'boolean' && typeof body.onCtps === 'boolean') {
    return { e164, status: 'done', on_tps: body.onTps, on_ctps: body.onCtps, tps_since: date(body.tpsRegisteredDate), ctps_since: date(body.ctpsRegisteredDate) };
  }
  if (res.status === 422) return { e164, status: 'invalid', error: String(body.message ?? 'Not a valid UK number').slice(0, 200) };
  if (res.status === 401 || res.status === 403) throw new ProviderDown('provider_auth');
  if (res.status === 402) throw new ProviderDown('provider_balance');
  if (res.status === 429 || res.status >= 500) return { e164, status: 'retry', error: `provider ${res.status}` };
  return { e164, status: 'error', error: String(body.message ?? `provider ${res.status}`).slice(0, 200) };
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  let down: unknown = null;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length && !down) {
        const k = i++;
        try {
          out[k] = await fn(items[k]);
        } catch (e) {
          down = e;
        }
      }
    }),
  );
  if (down) throw down;
  return out;
}

async function alertFounder(jobId: string, reason: string) {
  const to = Deno.env.get('SUPPORT_INBOX_EMAIL');
  if (!to) return;
  const what = reason === 'provider_balance' ? 'The Provero balance has run out.' : 'Provero rejected the API key.';
  await sendEmail(
    to,
    'TPS/CTPS checks are paused',
    layout(
      'TPS/CTPS checks are paused',
      p(`${esc(what)} A customer's check (${esc(jobId)}) stopped and their unused credits were refunded automatically.`) +
        p('Top up or fix the key in Provero, then ask them to run the file again.'),
    ),
  ).catch(() => false);
}

async function run(jobId: string) {
  const db = admin();
  const until = Date.now() + RUN_FOR_MS;
  while (Date.now() < until) {
    const { data: claimed, error } = await db.rpc('tps_claim', { p_job_id: jobId, p_limit: BATCH });
    if (error) {
      console.error('tps claim', jobId, error.message);
      return;
    }
    const numbers = (claimed ?? []).map((r: { e164: string }) => r.e164);
    if (!numbers.length) {
      await db.rpc('tps_finish_job', { p_job_id: jobId });
      return;
    }
    let results: Outcome[];
    try {
      results = await pool(numbers, PARALLEL, check);
    } catch (e) {
      if (e instanceof ProviderDown) {
        console.error('tps provider down', jobId, e.message);
        // hand the batch back first so nothing is left marked as in progress, then fail the check
        await db.rpc('tps_save', { p_job_id: jobId, p_results: numbers.map((n: string) => ({ e164: n, status: 'retry', error: e.message })) });
        await db.rpc('tps_finish_job', { p_job_id: jobId, p_error: e.message });
        await alertFounder(jobId, e.message);
        return;
      }
      throw e;
    }
    const { data: job, error: saveErr } = await db.rpc('tps_save', { p_job_id: jobId, p_results: results });
    if (saveErr) {
      console.error('tps save', jobId, saveErr.message);
      return;
    }
    if (job?.finished_at || job?.status !== 'running') return;
    // provider hiccups: back off briefly before the retries come round again
    if (results.some((r) => r.status === 'retry')) await new Promise((r) => setTimeout(r, 1500));
  }
  // out of time: carry on in a fresh invocation (the sweeper is the safety net if this fails)
  await fetch(`${FUNCTIONS_URL}/tps-check`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ job_id: jobId }),
  }).catch((e) => console.error('tps handover', jobId, (e as Error).message));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  if (!(await isCron(req))) return fail('unauthorized', 401);
  if (!KEY) return fail('not_configured', 503);
  const body = await req.json().catch(() => ({}));
  const jobId = typeof body.job_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.job_id) ? body.job_id : null;

  const ids: string[] = [];
  if (jobId) ids.push(jobId);
  else {
    const { data, error } = await admin().rpc('tps_sweep');
    if (error) return fail('sweep_failed', 500, { message: error.message });
    ids.push(...(data ?? []).map((r: { job_id: string }) => r.job_id));
  }
  for (const id of ids) EdgeRuntime.waitUntil(run(id).catch((e) => console.error('tps run', id, (e as Error).message)));
  return json({ ok: true, jobs: ids.length });
});

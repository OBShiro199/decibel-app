// Free public tools on the website: TPS/CTPS check, email verification, phone validation.
//   POST { tool: 'tps' | 'email' | 'phone', value, turnstile? } -> { result } | { error }
//
// Each one calls a paid pay-as-you-go API, so every request passes free_tool_consume()
// (migration 0016) first: per-IP burst and daily limits, auto-blocking, a hashed result
// cache, per-tool daily caps and a global spend cap. If TURNSTILE_SECRET is set, a
// Cloudflare Turnstile token is required too. No raw numbers or emails are stored: the cache
// and limits use salted hashes.
import { admin, corsHeaders, fail, json } from '../_shared/http.ts';
import { layout, p, sendEmail } from '../_shared/email.ts';

type Tool = 'tps' | 'email' | 'phone';

const TPS_KEY = Deno.env.get('TPSAPI_KEY') ?? '';
const MV_KEY = Deno.env.get('MILLIONVERIFIER_KEY') ?? '';
const TW_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
const TW_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';
const TURNSTILE_SECRET = Deno.env.get('TURNSTILE_SECRET') ?? '';
const INBOX_EMAIL = Deno.env.get('SUPPORT_INBOX_EMAIL') ?? 'oliverburt3@gmail.com';

const enc = new TextEncoder();
async function hmac(message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(`free-tools|${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Any phone format to E.164: 07..., 7..., 44..., 0044..., +44 ... Defaults to the UK. */
function toE164(raw: string): string | null {
  let s = raw.replace(/[\s().-]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = `+${s.slice(2)}`;
  if (!s.startsWith('+')) {
    if (s.startsWith('44')) s = `+${s}`;
    else if (s.startsWith('0')) s = `+44${s.slice(1)}`;
    else s = `+44${s}`;
  }
  if (s.startsWith('+440')) s = `+44${s.slice(4)}`;
  return /^\+[1-9]\d{7,14}$/.test(s) ? s : null;
}

const UK_NUMBER = /^\+44[1-9]\d{8,9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const clientIp = (req: Request) =>
  (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown';

/** A signed-in visitor gets a higher daily allowance; anyone else is limited by IP. */
async function userId(req: Request): Promise<string | null> {
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    if (claims.role !== 'authenticated') return null;
    const { data } = await admin().auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function turnstileOk(token: unknown, ip: string): Promise<boolean> {
  if (!TURNSTILE_SECRET) return true;
  if (typeof token !== 'string' || !token) return false;
  const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({ secret: TURNSTILE_SECRET, response: token, remoteip: ip }),
  });
  const data = await res.json().catch(() => ({}));
  return data.success === true;
}

/** Emails the founder when a prepaid balance crosses a low mark (once per mark). */
function lowCreditAlert(service: string, remaining: number, marks: number[]) {
  const hit = marks.find((m) => remaining <= m && remaining > m - (service === 'tpsapi.com' ? 2 : 1));
  if (hit === undefined) return;
  const task = sendEmail(
    INBOX_EMAIL,
    `${service} credits low: ${remaining} left`,
    layout(`${service} credits are running low`, p(`The free tools have ${remaining} ${service} credits left. Top up to keep the tool working; when credits run out the tool shows a "temporarily unavailable" message.`)),
  );
  (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime?.waitUntil?.(task);
}

class Unavailable extends Error {}

// The cache keeps the verdict only: the number or email itself is stripped before storing
// and put back from the request when a cached answer is returned.
const IDENTIFIERS = ['number', 'national_format', 'email'];
const stripIdentifiers = (r: Record<string, unknown>) => Object.fromEntries(Object.entries(r).filter(([k]) => !IDENTIFIERS.includes(k)));
function withIdentifier(tool: Tool, value: string, r: Record<string, unknown>) {
  if (tool === 'email') return { ...r, email: value };
  if (tool === 'tps') return { ...r, number: `0${value.slice(3)}` };
  return { ...r, number: value };
}

// ---- the three checks ------------------------------------------------------

async function checkTps(e164: string) {
  const national = `0${e164.slice(3)}`;
  const res = await fetch('https://service.tpsapi.com', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: TPS_KEY, 'check-tps': 'true', 'check-ctps': 'true', 'no-logging': 'true' },
    body: JSON.stringify({ phone_numbers: [national] }),
  });
  if (!res.ok) throw new Unavailable(`tpsapi ${res.status}`);
  const data = await res.json();
  const row = data.results?.[0];
  if (!row) throw new Unavailable('tpsapi empty');
  if (typeof data.credits_remaining === 'number') lowCreditAlert('tpsapi.com', data.credits_remaining, [50, 20, 6]);
  return { number: national, on_tps: !!row.on_tps, on_ctps: !!row.on_ctps, checked_at: new Date().toISOString() };
}

const EMAIL_VERDICT: Record<string, { verdict: string; label: string }> = {
  ok: { verdict: 'deliverable', label: 'Deliverable' },
  catch_all: { verdict: 'risky', label: 'Accept-all domain' },
  unknown: { verdict: 'unknown', label: 'Could not confirm' },
  disposable: { verdict: 'undeliverable', label: 'Disposable address' },
  invalid: { verdict: 'undeliverable', label: 'Does not exist' },
};

async function checkEmail(email: string) {
  const url = `https://api.millionverifier.com/api/v3/?api=${encodeURIComponent(MV_KEY)}&email=${encodeURIComponent(email)}&timeout=15`;
  const res = await fetch(url);
  if (!res.ok) throw new Unavailable(`millionverifier ${res.status}`);
  const d = await res.json();
  if (d.error || !d.result || d.result === 'error') throw new Unavailable(`millionverifier ${d.error ?? d.result}`);
  if (typeof d.credits === 'number') lowCreditAlert('MillionVerifier', d.credits, [100, 30, 10]);
  const v = EMAIL_VERDICT[d.result] ?? EMAIL_VERDICT.unknown;
  return {
    email,
    verdict: v.verdict,
    label: v.label,
    result: d.result,
    subresult: d.subresult ?? null,
    free_provider: !!d.free,
    role_account: !!d.role,
    did_you_mean: d.didyoumean || null,
  };
}

async function checkPhone(e164: string) {
  const auth = `Basic ${btoa(`${TW_SID}:${TW_TOKEN}`)}`;
  // free validation first; the paid line-type lookup only runs for valid numbers
  const basic = await fetch(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}`, { headers: { authorization: auth } });
  if (!basic.ok) throw new Unavailable(`twilio ${basic.status}`);
  const b = await basic.json();
  if (!b.valid) return { paid: false, data: { number: e164, valid: false, reason: (b.validation_errors ?? [])[0] ?? 'INVALID' } };
  const full = await fetch(`https://lookups.twilio.com/v2/PhoneNumbers/${encodeURIComponent(e164)}?Fields=line_type_intelligence`, { headers: { authorization: auth } });
  if (!full.ok) throw new Unavailable(`twilio ${full.status}`);
  const f = await full.json();
  const lt = f.line_type_intelligence ?? {};
  return {
    paid: true,
    data: {
      number: f.phone_number ?? e164,
      national_format: f.national_format ?? null,
      country_code: f.country_code ?? null,
      valid: true,
      line_type: lt.type ?? 'unknown',
      carrier: lt.carrier_name ?? null,
    },
  };
}

// ---- handler -----------------------------------------------------------------

const MESSAGES: Record<string, string> = {
  disabled: 'This tool is paused for now. Please try again later.',
  blocked: 'Too many checks from your network. Please try again tomorrow.',
  burst: 'Slow down a little: wait a minute and try again.',
  daily_limit: 'You have used today’s free checks. Start a free trial for unlimited checks inside Decibel.',
  budget: 'Today’s free checks have all been used. Please try again tomorrow, or start a free trial.',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const input = await req.json().catch(() => ({}));
  const tool = input.tool as Tool;
  if (!['tps', 'email', 'phone'].includes(tool)) return fail('bad_tool');
  const raw = typeof input.value === 'string' ? input.value.trim().slice(0, 254) : '';

  // validate before spending anything
  let value: string | null = null;
  if (tool === 'email') value = EMAIL_RE.test(raw) ? raw.toLowerCase() : null;
  else value = toE164(raw);
  if (!value) return fail(tool === 'email' ? 'invalid_email' : 'invalid_number', 400, { message: tool === 'email' ? 'That does not look like an email address.' : 'That does not look like a phone number.' });
  if (tool === 'tps' && !UK_NUMBER.test(value)) return fail('not_uk', 400, { message: 'The TPS and CTPS only cover UK numbers. Enter a UK number, for example 07700 900123.' });

  const ip = clientIp(req);
  if (!(await turnstileOk(input.turnstile, ip))) return fail('bot_check', 403, { message: 'Please complete the check and try again.' });

  const db = admin();
  const [ipHash, keyHash, uid] = await Promise.all([hmac(`ip:${ip}`), hmac(`${tool}:${value}`), userId(req)]);
  const { data: gate, error } = await db.rpc('free_tool_consume', { p_tool: tool, p_ip_hash: ipHash, p_user_id: uid, p_key_hash: keyHash }).single();
  if (error || !gate) return fail('unavailable', 503, { message: 'The tool is unavailable right now. Please try again shortly.' });
  const g = gate as { allowed: boolean; reason: string; usage_id: number | null; cached_result: unknown };
  if (!g.allowed) return fail(g.reason, 429, { message: MESSAGES[g.reason] ?? 'Please try again later.' });
  if (g.reason === 'cached') return json({ result: withIdentifier(tool, value, g.cached_result as Record<string, unknown>), cached: true });

  try {
    let result: unknown;
    if (tool === 'tps') result = await checkTps(value);
    else if (tool === 'email') result = await checkEmail(value);
    else {
      const r = await checkPhone(value);
      // invalid numbers cost nothing, so hand the check back
      if (!r.paid && g.usage_id) await db.rpc('free_tool_refund', { p_usage_id: g.usage_id });
      result = r.data;
    }
    await db.rpc('free_tool_store', { p_tool: tool, p_key_hash: keyHash, p_result: stripIdentifiers(result as Record<string, unknown>) });
    return json({ result, cached: false });
  } catch (e) {
    console.error('free-tools', tool, (e as Error).message);
    if (g.usage_id) await db.rpc('free_tool_refund', { p_usage_id: g.usage_id });
    return fail('unavailable', 503, { message: 'The check could not be completed right now. Please try again shortly.' });
  }
});

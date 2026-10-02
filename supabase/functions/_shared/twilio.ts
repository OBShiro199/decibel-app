// Thin Twilio helpers over fetch + Web Crypto. Deliberately no `npm:twilio`
// import: the webhook functions must cold-start fast (PRD section 15, risks).
import { admin, FUNCTIONS_URL } from './http.ts';

export const PARENT_SID = Deno.env.get('TWILIO_ACCOUNT_SID') ?? '';
export const PARENT_TOKEN = Deno.env.get('TWILIO_AUTH_TOKEN') ?? '';

export interface TwilioCreds {
  account_sid: string;
  auth_token: string;
  api_key_sid?: string;
  api_key_secret?: string;
}

export interface WorkspaceRow {
  id: string;
  name: string;
  plan: string;
  recording_policy: 'always' | 'rep_choice' | 'never';
  recording_notice_text: string;
  twilio_subaccount_sid: string | null;
  twilio_twiml_app_sid: string | null;
  twilio_api_key_sid: string | null;
  twilio_secret_vault_id: string | null;
  twilio_account_mode: 'pending' | 'subaccount' | 'parent';
  created_by: string;
  minute_balance_seconds: number;
  stripe_customer_id: string | null;
}

export const WS_COLUMNS =
  'id,name,plan,recording_policy,recording_notice_text,twilio_subaccount_sid,twilio_twiml_app_sid,twilio_api_key_sid,twilio_secret_vault_id,twilio_account_mode,created_by,minute_balance_seconds,stripe_customer_id';

// ---------------------------------------------------------------- REST ------
export class TwilioError extends Error {
  constructor(message: string, public status: number, public code?: number) {
    super(message);
  }
}

function basic(sid: string, token: string) {
  return 'Basic ' + btoa(`${sid}:${token}`);
}

/**
 * Calls the Twilio REST API. `path` is either an absolute URL or a path under
 * /2010-04-01/Accounts/{account_sid}. Auth is the given account's SID + token.
 */
export async function twilio<T = any>(
  creds: Pick<TwilioCreds, 'account_sid' | 'auth_token'>,
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  params?: Record<string, string | undefined> | URLSearchParams,
): Promise<T> {
  let url = path.startsWith('http')
    ? path
    : `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}${path}`;
  const search =
    params instanceof URLSearchParams
      ? params
      : new URLSearchParams(
          Object.entries(params ?? {}).filter(([, v]) => v !== undefined && v !== '') as [string, string][],
        );
  const init: RequestInit = { method, headers: { authorization: basic(creds.account_sid, creds.auth_token) } };
  if (method === 'GET') {
    const qs = search.toString();
    if (qs) url += (url.includes('?') ? '&' : '?') + qs;
  } else if (method === 'POST') {
    (init.headers as Record<string, string>)['content-type'] = 'application/x-www-form-urlencoded';
    init.body = search.toString();
  }
  const res = await fetch(url, init);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let body: any = undefined;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    body = { message: text };
  }
  if (!res.ok) throw new TwilioError(body?.message ?? `Twilio ${res.status}`, res.status, body?.code);
  return body as T;
}

// ------------------------------------------------------------ signatures ----
async function hmac(algo: 'SHA-1' | 'SHA-256', key: string, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: algo }, false, [
    'sign',
  ]);
  return crypto.subtle.sign('HMAC', k, new TextEncoder().encode(data));
}

function b64(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Validates X-Twilio-Signature for a form-encoded webhook. */
export async function validateSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>,
): Promise<boolean> {
  if (!authToken || !signature) return false;
  const data = Object.keys(params)
    .sort()
    .reduce((acc, k) => acc + k + params[k], url);
  return safeEqual(b64(await hmac('SHA-1', authToken, data)), signature);
}

/** The public URL Twilio called. req.url is the internal runtime URL, so rebuild it. */
export function publicUrl(req: Request, fn: string): string {
  return `${FUNCTIONS_URL}/${fn}${new URL(req.url).search}`;
}

// ---------------------------------------------------------------- TwiML -----
export function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const say = (text: string) => `<Say voice="Polly.Amy" language="en-GB">${esc(text)}</Say>`;

// ------------------------------------------------------------ identities ----
// Twilio client identities allow alphanumerics and underscores only.
export const toIdentity = (userId: string) => userId.replace(/-/g, '_');
export const fromIdentity = (identity: string) => identity.replace(/^client:/, '').replace(/_/g, '-');

// --------------------------------------------------------- access tokens ----
function b64url(input: string | ArrayBuffer): string {
  const s = typeof input === 'string' ? btoa(unescape(encodeURIComponent(input))) : b64(input);
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Mints a Twilio Voice access token (JWT, HS256) signed with the workspace API key. */
export async function mintVoiceToken(
  creds: TwilioCreds,
  twimlAppSid: string,
  identity: string,
  ttlSeconds = 3600,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
  const payload = {
    jti: `${creds.api_key_sid}-${now}`,
    iss: creds.api_key_sid,
    sub: creds.account_sid,
    iat: now,
    nbf: now,
    exp: now + ttlSeconds,
    grants: {
      identity,
      voice: { incoming: { allow: true }, outgoing: { application_sid: twimlAppSid } },
    },
  };
  const unsigned = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  const sig = await hmac('SHA-256', creds.api_key_secret!, unsigned);
  return `${unsigned}.${b64url(sig)}`;
}

// ---------------------------------------------- per-workspace provisioning --
export async function loadWorkspace(workspaceId: string): Promise<WorkspaceRow | null> {
  const { data } = await admin().from('workspaces').select(WS_COLUMNS).eq('id', workspaceId).maybeSingle();
  return (data as WorkspaceRow | null) ?? null;
}

export async function loadCreds(workspaceId: string): Promise<TwilioCreds | null> {
  const { data } = await admin().rpc('get_workspace_twilio_secret', { p_workspace_id: workspaceId });
  return (data as TwilioCreds | null) ?? null;
}

/**
 * Makes sure the workspace has a Twilio account (its own subaccount, or the
 * parent account when subaccounts are unavailable, e.g. Twilio trial), a TwiML
 * App pointed at twilio-voice, and an API key for signing access tokens.
 * Idempotent. Secrets go to Supabase Vault, never to env or the browser.
 */
export async function ensureWorkspaceTwilio(ws: WorkspaceRow): Promise<{ ws: WorkspaceRow; creds: TwilioCreds }> {
  if (!PARENT_SID || !PARENT_TOKEN) throw new TwilioError('twilio_not_configured', 503);
  const existing = ws.twilio_secret_vault_id ? await loadCreds(ws.id) : null;
  if (existing?.api_key_secret && ws.twilio_twiml_app_sid) return { ws, creds: existing };

  const parent = { account_sid: PARENT_SID, auth_token: PARENT_TOKEN };
  let account = existing ? { account_sid: existing.account_sid, auth_token: existing.auth_token } : null;
  let mode: 'subaccount' | 'parent' = ws.twilio_account_mode === 'parent' ? 'parent' : 'subaccount';

  if (!account) {
    if (Deno.env.get('TWILIO_USE_SUBACCOUNTS') !== 'false') {
      try {
        const sub = await twilio<{ sid: string; auth_token: string }>(
          parent,
          'POST',
          'https://api.twilio.com/2010-04-01/Accounts.json',
          { FriendlyName: `Decibel · ${ws.name} · ${ws.id}`.slice(0, 64) },
        );
        account = { account_sid: sub.sid, auth_token: sub.auth_token };
        mode = 'subaccount';
      } catch (e) {
        console.warn('subaccount creation failed, falling back to parent account:', (e as Error).message);
      }
    }
    if (!account) {
      account = parent;
      mode = 'parent';
    }
  }

  const app = ws.twilio_twiml_app_sid
    ? { sid: ws.twilio_twiml_app_sid }
    : await twilio<{ sid: string }>(account, 'POST', '/Applications.json', {
        FriendlyName: `Decibel ${ws.id}`,
        VoiceUrl: `${FUNCTIONS_URL}/twilio-voice`,
        VoiceMethod: 'POST',
        StatusCallback: `${FUNCTIONS_URL}/twilio-status?ws=${ws.id}&leg=client`,
        StatusCallbackMethod: 'POST',
      });

  const key = await twilio<{ sid: string; secret: string }>(account, 'POST', '/Keys.json', {
    FriendlyName: `Decibel ${ws.id}`,
  });

  const creds: TwilioCreds = { ...account, api_key_sid: key.sid, api_key_secret: key.secret };
  const db = admin();
  const { error: vaultErr } = await db.rpc('set_workspace_twilio_secret', { p_workspace_id: ws.id, p_secret: creds });
  if (vaultErr) throw new TwilioError(`vault: ${vaultErr.message}`, 500);
  const patch = {
    twilio_subaccount_sid: mode === 'subaccount' ? account.account_sid : null,
    twilio_twiml_app_sid: app.sid,
    twilio_api_key_sid: key.sid,
    twilio_account_mode: mode,
  };
  const { error } = await db.from('workspaces').update(patch).eq('id', ws.id);
  if (error) throw new TwilioError(`workspace update: ${error.message}`, 500);
  return { ws: { ...ws, ...patch }, creds };
}

// ------------------------------------------------------- webhook context ----
export interface WebhookCtx {
  body: Record<string, string>;
  query: URLSearchParams;
  ws: WorkspaceRow;
  creds: Pick<TwilioCreds, 'account_sid' | 'auth_token'>;
}

/**
 * Parses a Twilio webhook, resolves the workspace from the AccountSid (its
 * subaccount) or, in parent-account mode, from the `ws` query / WorkspaceId
 * param, and validates X-Twilio-Signature with that account's auth token.
 * Returns a Response when the request must be rejected.
 */
export async function webhook(req: Request, fn: string): Promise<WebhookCtx | Response> {
  const body = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  const query = new URL(req.url).searchParams;
  const accountSid = body.AccountSid ?? '';
  const db = admin();

  let ws: WorkspaceRow | null = null;
  let token = '';
  if (accountSid && accountSid !== PARENT_SID) {
    const { data } = await db.from('workspaces').select(WS_COLUMNS).eq('twilio_subaccount_sid', accountSid).maybeSingle();
    ws = data as WorkspaceRow | null;
    if (ws) token = (await loadCreds(ws.id))?.auth_token ?? '';
  } else if (accountSid === PARENT_SID) {
    token = PARENT_TOKEN;
    const wsId = query.get('ws') ?? body.WorkspaceId ?? '';
    if (/^[0-9a-f-]{36}$/i.test(wsId)) {
      ws = await loadWorkspace(wsId);
      // a workspace with its own subaccount must never be driven through the parent account
      if (ws && ws.twilio_account_mode === 'subaccount') ws = null;
    }
  }

  const ok = await validateSignature(token, req.headers.get('x-twilio-signature') ?? '', publicUrl(req, fn), body);
  if (!ok) return new Response('invalid signature', { status: 403 });
  if (!ws) return new Response('unknown workspace', { status: 404 });
  return { body, query, ws, creds: { account_sid: accountSid, auth_token: token } };
}

export function normalizePhone(p: string | null | undefined, cc = '44'): string | null {
  if (!p) return null;
  let s = p.replace(/[^0-9+]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('0')) s = '+' + cc + s.slice(1);
  if (!s.startsWith('+')) s = '+' + s;
  return /^\+[1-9][0-9]{6,14}$/.test(s) ? s : null;
}

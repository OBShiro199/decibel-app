// Telnyx helpers for the telephony functions (fetch only, no SDK).
//
// One Telnyx account serves every workspace. Resources created once by scripts/telnyx-setup.mjs
// and passed in as secrets:
//   TELNYX_API_KEY                   API v2 key
//   TELNYX_CC_APP_ID                 Call Control application: dials the far leg, owns purchased numbers
//   TELNYX_CREDENTIAL_CONNECTION_ID  credential connection for browser (WebRTC) calls; outbound legs park
//   TELNYX_OVP_ID                    outbound voice profile (UK destinations, spend limits)
//   TELNYX_PUBLIC_KEY                optional: webhook signing key from the Telnyx portal (base64, Ed25519)
import { admin } from './http.ts';

const KEY = Deno.env.get('TELNYX_API_KEY') ?? '';
export const CC_APP_ID = Deno.env.get('TELNYX_CC_APP_ID') ?? '';
export const CREDENTIAL_CONNECTION_ID = Deno.env.get('TELNYX_CREDENTIAL_CONNECTION_ID') ?? '';
const PUBLIC_KEY = Deno.env.get('TELNYX_PUBLIC_KEY') ?? '';
const BASE = 'https://api.telnyx.com/v2';

/** British neural voice for the recording notice and voicemail prompt. */
export const VOICE = 'AWS.Polly.Amy-Neural';

export const telnyxConfigured = () => !!(KEY && CC_APP_ID && CREDENTIAL_CONNECTION_ID);

export class TelnyxError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status = 500, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Calls the Telnyx API v2. JSON in, JSON out (`data` unwrapped when present). */
export async function telnyx<T = Record<string, unknown>>(method: string, path: string, body?: unknown, opts: { text?: boolean; timeoutMs?: number } = {}): Promise<T> {
  if (!KEY) throw new TelnyxError('telnyx_not_configured', 503);
  const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, Accept: opts.text ? 'text/plain' : 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
  });
  const text = await res.text();
  if (!res.ok) {
    let detail = text.slice(0, 300);
    let code: string | undefined;
    try {
      const e = JSON.parse(text).errors?.[0];
      if (e) {
        detail = e.detail || e.title || detail;
        code = e.code ? String(e.code) : undefined;
      }
    } catch {
      /* not JSON */
    }
    throw new TelnyxError(detail || `telnyx ${res.status}`, res.status, code);
  }
  if (opts.text) return text as unknown as T;
  if (!text) return {} as T;
  const parsed = JSON.parse(text);
  return (parsed && typeof parsed === 'object' && 'data' in parsed ? parsed.data : parsed) as T;
}

/** A Call Control command on a live leg. command_id makes retries safe (Telnyx ignores repeats for 60s). */
export function callAction(callControlId: string, action: string, body: Record<string, unknown> = {}, commandId?: string) {
  return telnyx('POST', `/calls/${encodeURIComponent(callControlId)}/actions/${action}`, { ...body, ...(commandId ? { command_id: commandId } : {}) });
}

// ---- client_state: what we stamp on a leg so its webhooks say which call row they belong to ----
export interface LegState {
  call_id: string;
  leg: 'rep' | 'far' | 'inbound' | 'agent' | 'voicemail';
  ws: string;
  notice?: boolean;
  test?: boolean;
}
export const encodeState = (s: LegState) => btoa(JSON.stringify(s));
export function decodeState(v: unknown): LegState | null {
  if (typeof v !== 'string' || !v) return null;
  try {
    const s = JSON.parse(atob(v));
    return s && typeof s.call_id === 'string' && typeof s.leg === 'string' ? (s as LegState) : null;
  } catch {
    return null;
  }
}

// ---- webhooks ---------------------------------------------------------------------------------
export interface TelnyxEvent {
  id: string;
  event_type: string;
  occurred_at: string;
  payload: Record<string, unknown> & {
    call_control_id?: string;
    call_leg_id?: string;
    call_session_id?: string;
    connection_id?: string;
    client_state?: string;
    direction?: string;
    from?: string;
    to?: string;
    state?: string;
    custom_headers?: { name?: string; value?: string; header_name?: string; header_value?: string }[];
    hangup_cause?: string;
    hangup_source?: string;
    sip_hangup_cause?: string;
    start_time?: string;
    end_time?: string;
  };
}

const b64bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
let verifyKey: CryptoKey | null = null;

/**
 * Reads a Telnyx webhook. With TELNYX_PUBLIC_KEY set, the Ed25519 signature over
 * "<telnyx-timestamp>|<raw body>" must verify and be under 5 minutes old; without it the event is
 * accepted but `signed` is false, and handlers confirm anything they act on with the Telnyx API.
 */
export async function readWebhook(req: Request): Promise<{ event: TelnyxEvent; signed: boolean } | Response> {
  const raw = await req.text();
  let signed = false;
  if (PUBLIC_KEY) {
    const sig = req.headers.get('telnyx-signature-ed25519') ?? '';
    const ts = req.headers.get('telnyx-timestamp') ?? '';
    if (!sig || !ts || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return new Response('stale or unsigned', { status: 401 });
    try {
      verifyKey ??= await crypto.subtle.importKey('raw', b64bytes(PUBLIC_KEY), { name: 'Ed25519' }, false, ['verify']);
      signed = await crypto.subtle.verify('Ed25519', verifyKey, b64bytes(sig), new TextEncoder().encode(`${ts}|${raw}`));
    } catch {
      signed = false;
    }
    if (!signed) return new Response('invalid signature', { status: 401 });
  }
  let body: { data?: TelnyxEvent };
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response('bad json', { status: 400 });
  }
  const event = body.data;
  if (!event?.id || !event.event_type || !event.payload) return new Response('not an event', { status: 400 });
  return { event, signed };
}

/** The value of a custom SIP header on call.initiated (both documented shapes). */
export function header(event: TelnyxEvent, name: string): string | undefined {
  const want = name.toLowerCase();
  for (const h of event.payload.custom_headers ?? []) {
    const n = (h.name ?? h.header_name ?? '').toLowerCase();
    if (n === want) return h.value ?? h.header_value ?? undefined;
  }
  return undefined;
}

// ---- browser calling credentials ------------------------------------------------------------------
export interface RepCredential {
  credential_id: string;
  sip_username: string;
}

/** The rep's Telnyx telephony credential, created on first use (one per user). */
export async function ensureCredential(userId: string): Promise<RepCredential> {
  const db = admin();
  const { data } = await db.from('telnyx_credentials').select('credential_id,sip_username').eq('user_id', userId).maybeSingle();
  if (data) return data as RepCredential;
  const cred = await telnyx<{ id: string; sip_username: string }>('POST', '/telephony_credentials', {
    connection_id: CREDENTIAL_CONNECTION_ID,
    name: `decibel-${userId}`,
    tag: 'decibel-rep',
  });
  const row = { user_id: userId, credential_id: cred.id, sip_username: cred.sip_username };
  const { error } = await db.from('telnyx_credentials').insert(row);
  if (error) {
    // a parallel request created one first: keep that, revoke ours
    const { data: again } = await db.from('telnyx_credentials').select('credential_id,sip_username').eq('user_id', userId).maybeSingle();
    if (again) {
      await telnyx('DELETE', `/telephony_credentials/${cred.id}`).catch(() => {});
      return again as RepCredential;
    }
    throw new TelnyxError(error.message, 500);
  }
  return { credential_id: cred.id, sip_username: cred.sip_username };
}

export const sipUri = (username: string) => `sip:${username}@sip.telnyx.com`;

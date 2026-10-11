// POST { workspace_id } with the user's Supabase JWT -> { token, sip_username, ttl }
// A login token for the Telnyx browser SDK, minted from the rep's own telephony credential
// (created on first use). Tokens last 24 hours; the browser refreshes before then.
import { admin, corsHeaders, fail, getRole, getUser, json } from '../_shared/http.ts';
import { ensureCredential, telnyx, TelnyxError, telnyxConfigured } from '../_shared/telnyx.ts';

const TTL = 24 * 3600;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const { workspace_id } = await req.json().catch(() => ({}));
  if (!workspace_id) return fail('workspace_id required');
  if (!telnyxConfigured()) return fail('telephony_not_configured', 503);

  const [role, rate] = await Promise.all([
    getRole(user.id, workspace_id),
    admin().rpc('check_rate_limit', { p_key: `telnyx-token:${user.id}`, p_limit: 30, p_window_seconds: 60 }),
  ]);
  if (!role) return fail('forbidden', 403);
  if (rate.data === false) return fail('rate_limited', 429);

  try {
    const cred = await ensureCredential(user.id);
    const token = await telnyx<string>('POST', `/telephony_credentials/${cred.credential_id}/token`, undefined, { text: true });
    return json({ token: token.trim(), sip_username: cred.sip_username, ttl: TTL });
  } catch (e) {
    const err = e as TelnyxError;
    console.error('telnyx-token', err.status, err.message);
    return fail(err.message || 'telephony_error', err.status && err.status >= 400 && err.status < 600 ? err.status : 500);
  }
});

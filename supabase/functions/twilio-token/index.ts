// POST { workspace_id } with the user's Supabase JWT -> { token, identity, ttl }
import { admin, corsHeaders, fail, getRole, getUser, json } from '../_shared/http.ts';
import { ensureWorkspaceTwilio, loadWorkspace, mintVoiceToken, toIdentity, TwilioError } from '../_shared/twilio.ts';

const TTL = 3600;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);

  const { workspace_id } = await req.json().catch(() => ({}));
  if (!workspace_id) return fail('workspace_id required');
  // membership, rate limit and workspace load are independent: run them together
  const [role, rate, ws] = await Promise.all([
    getRole(user.id, workspace_id),
    admin().rpc('check_rate_limit', { p_key: `twilio-token:${user.id}`, p_limit: 60, p_window_seconds: 60 }),
    loadWorkspace(workspace_id),
  ]);
  if (!role) return fail('forbidden', 403);
  if (rate.data === false) return fail('rate_limited', 429);
  if (!ws) return fail('workspace_not_found', 404);

  try {
    const ready = await ensureWorkspaceTwilio(ws);
    const identity = toIdentity(user.id);
    const token = await mintVoiceToken(ready.creds, ready.ws.twilio_twiml_app_sid!, identity, TTL);
    return json({ token, identity, ttl: TTL });
  } catch (e) {
    const err = e as TwilioError;
    console.error('twilio-token', err.message);
    return fail(err.message || 'twilio_error', err.status && err.status >= 400 ? err.status : 500);
  }
});

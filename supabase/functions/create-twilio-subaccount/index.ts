// POST { workspace_id }: provisions the workspace's Twilio subaccount, TwiML App
// and API key right after the workspace is created (fire-and-forget from the app).
import { corsHeaders, fail, getRole, getUser, json } from '../_shared/http.ts';
import { ensureWorkspaceTwilio, loadWorkspace, TwilioError } from '../_shared/twilio.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const { workspace_id } = await req.json().catch(() => ({}));
  if (!workspace_id) return fail('workspace_id required');
  if (!(await getRole(user.id, workspace_id))) return fail('forbidden', 403);
  const ws = await loadWorkspace(workspace_id);
  if (!ws) return fail('workspace_not_found', 404);
  try {
    const ready = await ensureWorkspaceTwilio(ws);
    return json({ ok: true, mode: ready.ws.twilio_account_mode });
  } catch (e) {
    const err = e as TwilioError;
    return fail(err.message || 'twilio_error', err.status && err.status >= 400 ? err.status : 500);
  }
});

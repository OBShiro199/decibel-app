// Transactional email via Resend. POST with the user's JWT.
//   { type: 'invite', invitation_id }  -> { sent, link }   (workspace admin)
import { admin, APP_URL, corsHeaders, fail, getRole, getUser, isAdmin, json } from '../_shared/http.ts';
import { layout, sendEmail } from '../_shared/email.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const input = await req.json().catch(() => ({}));
  const db = admin();

  if (input.type === 'invite') {
    const { data: inv } = await db
      .from('invitations')
      .select('id,workspace_id,email,role,token,status,workspaces(name)')
      .eq('id', input.invitation_id)
      .maybeSingle();
    if (!inv) return fail('not_found', 404);
    if (!isAdmin(await getRole(user.id, inv.workspace_id))) return fail('forbidden', 403);
    if (inv.status !== 'pending') return fail('invitation_not_pending');

    const { data: me } = await db.from('profiles').select('full_name,email').eq('id', user.id).single();
    const inviter = me?.full_name || me?.email || 'A teammate';
    const wsName = (inv as any).workspaces?.name ?? 'a workspace';
    const link = `${APP_URL}/invite/${inv.token}`;
    const sent = await sendEmail(
      inv.email,
      `${inviter} invited you to ${wsName} on Decibels`,
      layout(
        `${inviter} invited you to ${wsName}`,
        `Join your team on Decibels to start calling from your browser. This invite is for <b>${inv.email}</b> and expires in 7 days.`,
        { label: 'Join workspace', url: link },
      ),
    );
    return json({ sent, link });
  }

  return fail('unknown type');
});

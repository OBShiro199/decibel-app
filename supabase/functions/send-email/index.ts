// Transactional email via Resend. POST with the user's JWT.
//   { type: 'invite', invitation_id }   -> { sent, link }   (workspace admin)
//   { type: 'welcome' }                 -> { sent }         (once per user, ever)
//   { type: 'first_export', rows }      -> { sent }         (once per user, ever)
import { admin, APP_URL, corsHeaders, fail, getRole, getUser, isAdmin, json } from '../_shared/http.ts';
import { esc, FOUNDER_EMAIL, layout, p, sendEmail } from '../_shared/email.ts';

/** Claims a once-only email for this user. True only the first time, so repeat calls send nothing. */
async function claim(userId: string, kind: string): Promise<boolean> {
  const { data, error } = await admin()
    .from('email_log')
    .upsert({ user_id: userId, kind }, { onConflict: 'user_id,kind', ignoreDuplicates: true })
    .select('kind');
  if (error) {
    console.error('email_log', error.message);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

const firstName = (full: string | null | undefined) => (full ?? '').trim().split(/\s+/)[0] ?? '';

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
      `${inviter} invited you to ${wsName} on Decibel`,
      layout(
        `${inviter} invited you to ${wsName}`,
        p(`Join your team on Decibel to start calling from your browser. This invite is for <b>${esc(inv.email)}</b> and expires in 7 days.`),
        { label: 'Join workspace', url: link },
      ),
    );
    return json({ sent, link });
  }

  if (input.type === 'welcome') {
    if (!user.email) return json({ sent: false });
    if (!(await claim(user.id, 'welcome'))) return json({ sent: false, already: true });
    const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
    const name = firstName(me?.full_name);
    const sent = await sendEmail(
      user.email,
      'Welcome to Decibel',
      layout(
        name ? `Welcome to Decibel, ${esc(name)}` : 'Welcome to Decibel',
        p('Thank you for signing up. Your account comes with <b style="color:#141414;font-weight:500">5,000 free credits</b>, and one credit reveals one verified mobile, so you can start building lists straight away.') +
          p('Find people by role, company and location in Leads, add them to a list to reveal their mobiles, then call them from your browser with the power dialler.') +
          p('If anything is unclear, ask in the chat in the bottom corner of the app or just reply to this email. It comes straight to me.') +
          p('Oliver, founder of Decibel'),
        { label: 'Open Decibel', url: `${APP_URL}/app` },
        'Your 5,000 free credits are ready.',
      ),
      { replyTo: FOUNDER_EMAIL },
    );
    return json({ sent });
  }

  if (input.type === 'first_export') {
    if (!user.email) return json({ sent: false });
    if (!(await claim(user.id, 'first_export'))) return json({ sent: false, already: true });
    const rows = Math.max(0, Math.floor(Number(input.rows) || 0));
    const what = rows ? `${rows.toLocaleString('en-GB')} ${rows === 1 ? 'row' : 'rows'}` : 'your first file';
    const sent = await sendEmail(
      user.email,
      'Congratulations on your first export 🎉',
      layout(
        'Congratulations on your first export 🎉',
        p(`You just exported ${what} from Decibel. Your CSV is in your downloads, ready for your CRM or spreadsheet.`) +
          p('Questions about getting your data into another tool? Reply to this email and I will help.') +
          p('Oliver, founder of Decibel'),
        { label: 'Back to Decibel', url: `${APP_URL}/app` },
        'Your CSV is ready.',
      ),
      { replyTo: FOUNDER_EMAIL },
    );
    return json({ sent });
  }

  return fail('unknown type');
});

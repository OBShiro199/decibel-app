// Team management. POST { action, ... }:
//   invite  { workspace_id, emails[], role? }          -> { results: [{ email, status, sent, link }] }  (owner/admin)
//   resend  { invitation_id }                          -> { sent, link }                                (owner/admin)
//   signup  { token, full_name, password }             -> { email }   no JWT: the invite link proves the inbox
//   remove  { workspace_id, user_id, reassign_to?, release_numbers? } -> { leads_moved, numbers, released } (owner/admin)
//
// Invites are created by invite_members / renew_invitation (migration 0032) as the signed-in admin,
// so the database checks the role; this function only sends the email. Accepting goes through
// accept_invitation_as, which never changes an existing member's role.
import { admin, APP_URL, corsHeaders, fail, FUNCTIONS_URL, getRole, getUser, isAdmin, json, SUPABASE_URL } from '../_shared/http.ts';
import { details, esc, layout, p, sendEmail } from '../_shared/email.ts';

const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const ROLE_LABEL: Record<string, string> = { owner: 'owner', admin: 'admin', member: 'member' };

/** Calls a database function as the signed-in user, so RLS and role checks apply. */
async function asUser<T>(req: Request, fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: ANON, authorization: req.headers.get('authorization') ?? '', 'content-type': 'application/json' },
    body: JSON.stringify(args),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(String(body?.message ?? `rpc ${fn} failed`).replace(/^[A-Z0-9]+: /, ''));
  return body as T;
}

const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ').trim();

async function sendInvite(inviterId: string, workspaceId: string, email: string, token: string, role: string) {
  const db = admin();
  const [{ data: me }, { data: ws }] = await Promise.all([
    db.from('profiles').select('full_name,email').eq('id', inviterId).single(),
    db.from('workspaces').select('name').eq('id', workspaceId).single(),
  ]);
  const inviter = oneLine(me?.full_name || me?.email || 'A teammate').slice(0, 80);
  const wsName = oneLine(ws?.name || 'their team').slice(0, 80);
  const link = `${APP_URL}/invite/${token}`;
  const sent = await sendEmail(
    email,
    `${inviter} invited you to ${wsName} on Decibel`,
    layout(
      `${esc(inviter)} invited you to ${esc(wsName)}`,
      p(`${esc(inviter)} has invited you to join <b style="color:#141414;font-weight:500">${esc(wsName)}</b> on Decibel, where your team finds the right people and calls them straight from the browser.`) +
        p('Accept the invite to set your password and join. Your admin will give you a number to call from.') +
        details([
          ['Team', wsName],
          ['Invited by', inviter],
          ['Your role', ROLE_LABEL[role] ?? 'member'],
          ['Invite for', email],
        ]) +
        p('This invite expires in 7 days. If you weren’t expecting it, you can ignore this email.'),
      { label: 'Accept invite', url: link },
      `${inviter} invited you to ${wsName} on Decibel.`,
    ),
  );
  return { sent, link };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const input = await req.json().catch(() => ({}));
  const db = admin();

  // ---- signup from an invite (no account yet) -----------------------------------------------
  if (input.action === 'signup') {
    const token = String(input.token ?? '');
    const fullName = oneLine(String(input.full_name ?? '')).slice(0, 80);
    const password = String(input.password ?? '');
    if (token.length < 32) return fail('invalid_invitation', 400);
    if (!fullName) return fail('name_required', 400, { message: 'Add your name.' });
    if (password.length < 10 || !/\d/.test(password)) return fail('weak_password', 400, { message: 'Use at least 10 characters, including one number.' });
    const rate = await db.rpc('check_rate_limit', { p_key: `invite-signup:${token}`, p_limit: 5, p_window_seconds: 3600 });
    if (rate.data === false) return fail('rate_limited', 429, { message: 'Too many attempts. Try again later.' });

    const { data: inv } = await db.from('invitations').select('id,email,status,expires_at').eq('token', token).maybeSingle();
    if (!inv || inv.status !== 'pending' || new Date(inv.expires_at) < new Date()) {
      return fail('invalid_invitation', 400, { message: 'This invite has expired or was already used. Ask your admin for a new one.' });
    }
    const { data: existing } = await db.from('profiles').select('id').ilike('email', inv.email).maybeSingle();
    if (existing) return fail('account_exists', 409, { message: 'You already have a Decibel account. Log in to accept the invite.' });

    const { data: created, error } = await db.auth.admin.createUser({
      email: inv.email,
      password,
      email_confirm: true, // the invite link was emailed to this address, so the inbox is proven
      user_metadata: { full_name: fullName },
    });
    if (error || !created.user) {
      console.error('invite signup', error?.message);
      return fail('signup_failed', 400, { message: error?.message?.includes('Password') ? error.message : 'Could not create your account. Try again.' });
    }
    const { error: acceptErr } = await db.rpc('accept_invitation_as', { p_token: token, p_user_id: created.user.id });
    if (acceptErr) {
      await db.auth.admin.deleteUser(created.user.id);
      return fail('invalid_invitation', 400, { message: 'This invite has expired or was already used. Ask your admin for a new one.' });
    }
    return json({ email: inv.email });
  }

  // ---- everything else needs a signed-in admin --------------------------------------------------
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);

  try {
    if (input.action === 'invite') {
      const workspaceId = String(input.workspace_id ?? '');
      const emails = (Array.isArray(input.emails) ? input.emails : []).map((e: unknown) => String(e)).slice(0, 50);
      const role = input.role === 'admin' ? 'admin' : 'member';
      if (!emails.length) return fail('no_emails', 400, { message: 'Add at least one email address.' });
      const rows = await asUser<{ email: string; status: string; invitation_id: string | null; token: string | null }[]>(req, 'invite_members', {
        p_workspace_id: workspaceId,
        p_emails: emails,
        p_role: role,
      });
      const results: { email: string; status: string; sent: boolean; link: string | null }[] = [];
      for (const r of rows) {
        if (r.status !== 'invited' || !r.token) {
          results.push({ email: r.email, status: r.status, sent: false, link: null });
          continue;
        }
        const { sent, link } = await sendInvite(user.id, workspaceId, r.email, r.token, role);
        results.push({ email: r.email, status: 'invited', sent, link });
      }
      return json({ results });
    }

    if (input.action === 'resend') {
      const { data: inv } = await db.from('invitations').select('workspace_id,role').eq('id', input.invitation_id).maybeSingle();
      if (!inv) return fail('not_found', 404);
      const [row] = await asUser<{ email: string; token: string }[]>(req, 'renew_invitation', { p_invitation_id: input.invitation_id });
      return json(await sendInvite(user.id, inv.workspace_id, row.email, row.token, inv.role));
    }

    if (input.action === 'remove') {
      const workspaceId = String(input.workspace_id ?? '');
      if (!isAdmin(await getRole(user.id, workspaceId))) return fail('forbidden', 403);
      const out = await asUser<{ leads_moved: number; numbers: { id: string; e164: string }[] }>(req, 'remove_member', {
        p_workspace_id: workspaceId,
        p_user_id: input.user_id,
        p_reassign_to: input.reassign_to ?? null,
      });
      const released: string[] = [];
      if (input.release_numbers) {
        for (const n of out.numbers) {
          const r = await fetch(`${FUNCTIONS_URL}/twilio-numbers`, {
            method: 'POST',
            headers: { authorization: req.headers.get('authorization') ?? '', apikey: ANON, 'content-type': 'application/json' },
            body: JSON.stringify({ workspace_id: workspaceId, action: 'release', id: n.id }),
          });
          if (r.ok) released.push(n.e164);
        }
      }
      // keep billing in step with the member count
      await fetch(`${FUNCTIONS_URL}/billing`, {
        method: 'POST',
        headers: { authorization: req.headers.get('authorization') ?? '', apikey: ANON, 'content-type': 'application/json' },
        body: JSON.stringify({ workspace_id: workspaceId, action: 'sync_seats' }),
      }).catch(() => {});
      return json({ ...out, released });
    }

    return fail('unknown_action', 400);
  } catch (e) {
    const message = (e as Error).message;
    const friendly: Record<string, string> = {
      forbidden: 'Only owners and admins can do that.',
      slow_down: 'You have sent a lot of invites today. Try again tomorrow.',
      too_many_emails: 'Invite up to 50 people at a time.',
      cannot_remove_owner: 'The owner can’t be removed. Transfer ownership first.',
      use_leave: 'You can’t remove yourself. Leave the workspace from your profile instead.',
      not_a_member: 'That person isn’t in this workspace.',
      reassign_not_member: 'Leads can only be handed to someone in this workspace.',
      already_accepted: 'That invite was already accepted.',
    };
    return fail(message, message === 'forbidden' ? 403 : 400, { message: friendly[message] ?? message });
  }
});

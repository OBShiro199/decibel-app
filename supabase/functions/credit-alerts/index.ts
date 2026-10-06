// Low-credit emails, called by the ledger trigger in migration 0014 (with the cron secret)
// when a workspace's balance drops below 20% of what it has received, or reaches zero.
//   { workspace_id, level: 'low' | 'out', balance, granted } -> { sent }
// Goes to the workspace's owners and admins. Account email, so it ignores the reminder opt-out.
import { admin, APP_URL, fail, isCron, json } from '../_shared/http.ts';
import { esc, FOUNDER_EMAIL, layout, p, sendEmail } from '../_shared/email.ts';

const n = (v: number) => v.toLocaleString('en-GB');
const strong = (s: string) => `<b style="color:#141414;font-weight:500">${s}</b>`;

export function creditEmail(level: 'low' | 'out', workspace: string, balance: number, granted: number) {
  const used = Math.max(0, granted - balance);
  const ws = esc(workspace || 'your workspace');
  if (level === 'out') {
    return {
      subject: `You've used all your Decibel credits`,
      html: layout(
        `You've used all your credits`,
        p(`${ws} has used all ${n(granted)} of its credits. Everyone you have already revealed is still yours to call and export, but new reveals are paused until more credits are added.`) +
          p(`Want to keep going? Reply to this email and I will add more credits to your workspace.`) +
          p('Oliver, founder of Decibel'),
        { label: 'See your credits', url: `${APP_URL}/app/settings/billing` },
        'New reveals are paused until more credits are added.',
      ),
    };
  }
  return {
    subject: `You have ${n(balance)} credits left`,
    html: layout(
      `You have ${n(balance)} credits left`,
      p(`${ws} has used ${n(used)} of its ${n(granted)} credits. The ${n(balance)} left will reveal ${strong(`${n(balance)} more verified ${balance === 1 ? 'mobile' : 'mobiles'}`)}.`) +
        p('Anyone you have already revealed stays free to call and export again, so credits only go on new people.') +
        p('Need more before you run out? Reply to this email and I will sort it out.') +
        p('Oliver, founder of Decibel'),
      { label: 'See your credits', url: `${APP_URL}/app/settings/billing` },
      `${n(balance)} credits reveal ${n(balance)} more verified mobiles.`,
    ),
  };
}

Deno.serve(async (req) => {
  if (!(await isCron(req))) return fail('unauthorized', 401);
  const input = await req.json().catch(() => ({}));
  const level = input.level === 'out' ? 'out' : input.level === 'low' ? 'low' : null;
  const workspaceId = String(input.workspace_id ?? '');
  if (!level || !workspaceId) return fail('bad_request');
  const db = admin();

  // read the live balance rather than trusting the payload
  const { data: ws } = await db.from('workspaces').select('name,credit_balance').eq('id', workspaceId).maybeSingle();
  if (!ws) return fail('not_found', 404);
  const balance = Math.max(0, Number(ws.credit_balance) || 0);
  const granted = Math.max(balance, Number(input.granted) || 0);

  const { data: members } = await db
    .from('workspace_members')
    .select('role,profiles(email)')
    .eq('workspace_id', workspaceId)
    .in('role', ['owner', 'admin']);
  const to = [...new Set((members ?? []).map((m) => (m as { profiles?: { email?: string } }).profiles?.email).filter((e): e is string => !!e))];
  if (!to.length) return json({ sent: false, reason: 'no_recipients' });

  const { subject, html } = creditEmail(level, ws.name, balance, granted);
  const sent = await sendEmail(to, subject, html, { replyTo: FOUNDER_EMAIL });
  return json({ sent, to: to.length });
});

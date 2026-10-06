// Hourly (pg_cron, migration 0013): the "come back" email for people who have not used
// Decibel for two days. claim_comeback_emails() marks each person before we send, so a
// rerun or an overlapping run never emails anyone twice.
import { admin, APP_URL, fail, FUNCTIONS_URL, isCron, json } from '../_shared/http.ts';
import { esc, FOUNDER_EMAIL, layout, p, sendEmail, unsubscribeLinks } from '../_shared/email.ts';

const INK = '#141414';
const MUTED = '#5c5c5c';
const LINE = '#ececec';

/** One selling point: a short bold line and a sentence under it. */
const point = (title: string, text: string) =>
  `<tr><td style="padding:12px 0;border-bottom:1px solid ${LINE}"><div style="font-size:15px;line-height:22px;font-weight:500;color:${INK}">${title}</div><div style="font-size:14px;line-height:21px;color:${MUTED};margin-top:2px">${text}</div></td></tr>`;

export function comebackEmail(name: string, credits: number, unsubscribeUrl: string) {
  const first = name.trim().split(/\s+/)[0] ?? '';
  const points =
    point('1 million verified UK &amp; EU mobiles', 'Direct mobile numbers for decision makers, filtered by role, seniority, company, industry and location.') +
    point('A power dialler in your browser', 'Call down a list back to back, with notes and outcomes saved as you go. Nothing to install.') +
    (credits > 0
      ? point(`${credits.toLocaleString('en-GB')} credits ready to use`, 'One credit reveals one verified mobile, so your next list is a few clicks away.')
      : point('Lists that turn into calls', 'Add leads to a list to reveal their mobiles, then start the dialler on that list.'));
  return layout(
    first ? `${esc(first)}, your leads are waiting` : 'Your leads are waiting',
    p('It has been a couple of days since you were in Decibel, so here is a quick reminder of what is ready for you.') +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:4px 0 24px;border-top:1px solid ${LINE}">${points}</table>` +
      p('Stuck on something, or not sure where to start? Reply to this email and I will help.') +
      p('Oliver, founder of Decibel'),
    { label: 'Pick up where you left off', url: `${APP_URL}/app` },
    '1 million verified mobiles and the dialler to reach them.',
    unsubscribeUrl,
  );
}

Deno.serve(async (req) => {
  if (!(await isCron(req))) return fail('unauthorized', 401);
  const db = admin();
  const { data, error } = await db.rpc('claim_comeback_emails', { p_limit: 200 });
  if (error) return fail(error.message, 500);

  let sent = 0;
  for (const row of (data ?? []) as { user_id: string; email: string; full_name: string; credit_balance: number }[]) {
    if (!row.email) continue;
    const links = await unsubscribeLinks(row.user_id, APP_URL, FUNCTIONS_URL);
    const first = (row.full_name ?? '').trim().split(/\s+/)[0];
    const ok = await sendEmail(
      row.email,
      first ? `${first}, your leads are waiting` : 'Your leads are waiting',
      comebackEmail(row.full_name ?? '', Math.floor(Number(row.credit_balance) || 0), links.page),
      { replyTo: FOUNDER_EMAIL, headers: links.headers },
    );
    if (ok) sent++;
  }
  return json({ claimed: data?.length ?? 0, sent });
});

// "Book a 15-min demo" form on the website. Public (no sign-in): validates, rate-limits,
// stores the request and emails the founder, with Reply-To set to the person.
//   POST { name, email, company?, team_size?, phone?, message?, website? } -> { ok }
// `website` is a honeypot: real people never see or fill it.
import { admin, corsHeaders, fail, json } from '../_shared/http.ts';
import { details, layout, quote, sendEmail } from '../_shared/email.ts';

const INBOX_EMAIL = Deno.env.get('SUPPORT_INBOX_EMAIL') ?? 'oliverburt3@gmail.com';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');

const london = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const input = await req.json().catch(() => ({}));

  // bots fill every field; pretend it worked so they learn nothing
  if (clip(input.website, 200)) return json({ ok: true });

  const name = clip(input.name, 120);
  const email = clip(input.email, 200).toLowerCase();
  const company = clip(input.company, 160);
  const teamSize = clip(input.team_size, 40);
  const phone = clip(input.phone, 40);
  const message = typeof input.message === 'string' ? input.message.trim().slice(0, 2000) : '';
  if (!name) return fail('name_required');
  if (!EMAIL_RE.test(email)) return fail('email_invalid');

  const db = admin();
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const tenMinAgo = new Date(Date.now() - 600_000).toISOString();
  const [{ count: mine }, { count: all }] = await Promise.all([
    db.from('demo_requests').select('id', { count: 'exact', head: true }).ilike('email', email).gte('created_at', hourAgo),
    db.from('demo_requests').select('id', { count: 'exact', head: true }).gte('created_at', tenMinAgo),
  ]);
  if ((mine ?? 0) >= 3 || (all ?? 0) >= 30) return fail('slow_down', 429);

  const now = new Date();
  const { error } = await db.from('demo_requests').insert({ name, email, company, team_size: teamSize, phone, message, created_at: now.toISOString() });
  if (error) return fail(error.message, 500);

  await sendEmail(
    INBOX_EMAIL,
    `Demo request from ${name}${company ? `, ${company}` : ''}`,
    layout(
      'New demo request',
      details([
        ['Name', name],
        ['Email', email],
        ['Company', company || 'Not given'],
        ['Team size', teamSize || 'Not given'],
        ['Phone', phone || 'Not given'],
        ['Received', london(now)],
      ]) + (message ? quote(message, 'What they want to see') : ''),
      { label: `Reply to ${name.split(' ')[0]}`, url: `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent('Your Decibel demo')}` },
      `${name} wants a 15-minute demo.`,
    ),
    { replyTo: email },
  );
  return json({ ok: true });
});

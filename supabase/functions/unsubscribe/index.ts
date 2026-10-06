// Opts someone out of reminder emails (the come-back email). No sign-in: the link carries
// the user id and an HMAC of it.
//   POST /unsubscribe?u=&t=           one-click from mail clients (RFC 8058)
//   POST { u, t }                     from the /unsubscribe page
import { admin, corsHeaders, fail, json } from '../_shared/http.ts';
import { validUnsubscribe } from '../_shared/email.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const url = new URL(req.url);
  let u = url.searchParams.get('u') ?? '';
  let t = url.searchParams.get('t') ?? '';
  if (!u || !t) {
    const body = await req.json().catch(() => ({}));
    u = String(body.u ?? '');
    t = String(body.t ?? '');
  }
  if (!(await validUnsubscribe(u, t))) return fail('invalid_link', 400);
  const { error } = await admin().from('profiles').update({ email_opt_out_at: new Date().toISOString() }).eq('id', u).is('email_opt_out_at', null);
  if (error) return fail(error.message, 500);
  return json({ ok: true });
});

// Founder support chat. POST JSON.
//
// From the app, with the user's JWT:
//   { action: 'send', body }                      -> { message }   saves it and emails the founder
//
// From the founder's inbox at /private:
//   { action: 'login', password }                 -> { token, expires }
//   { action: 'threads', token }                  -> { threads }
//   { action: 'messages', token, thread_id }      -> { thread, messages }   marks it read
//   { action: 'reply', token, thread_id, body }   -> { message }   saves it and emails the user
//   { action: 'status', token, thread_id, status }-> { ok }
//
// The inbox password lives only in the PRIVATE_INBOX_PASSWORD secret. A login returns a
// signed token (HMAC over its expiry), so nothing about the session is stored.
import { admin, APP_URL, corsHeaders, fail, getUser, json } from '../_shared/http.ts';
import { details, FOUNDER_EMAIL, layout, p, quote, sendEmail } from '../_shared/email.ts';

const INBOX_EMAIL = Deno.env.get('SUPPORT_INBOX_EMAIL') ?? 'oliverburt3@gmail.com';
const TOKEN_DAYS = 30;
const MAX_LEN = 4000;
const PER_HOUR = 20; // messages a user may send per hour
const LOCK_AFTER = 10; // failed passwords in 15 minutes before the inbox locks for a while

const enc = new TextEncoder();
const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

async function hmac(message: string): Promise<string> {
  const secret = `${Deno.env.get('PRIVATE_INBOX_PASSWORD') ?? ''}|${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

/** Compares two strings without leaking where they differ. */
async function same(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([hmac(`cmp:${a}`), hmac(`cmp:${b}`)]);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.min(x.length, y.length); i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}

async function makeToken(): Promise<{ token: string; expires: number }> {
  const expires = Date.now() + TOKEN_DAYS * 86400_000;
  return { token: `${expires}.${await hmac(`support-admin:${expires}`)}`, expires };
}

async function validToken(token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || !Deno.env.get('PRIVATE_INBOX_PASSWORD')) return false;
  const [exp, sig] = token.split('.');
  if (!exp || !sig || !(Number(exp) > Date.now())) return false;
  return same(sig, await hmac(`support-admin:${exp}`));
}

const london = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);

const preview = (s: string) => s.replace(/\s+/g, ' ').trim().slice(0, 140);

/** Lets an email finish after the response has gone back, so sending never feels slow. */
function background(task: Promise<unknown>) {
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(task);
}

const cleanBody = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const input = await req.json().catch(() => ({}));
  const db = admin();

  // ---- user: send a message -------------------------------------------------
  if (input.action === 'send') {
    const user = await getUser(req);
    if (!user) return fail('unauthorized', 401);
    const body = cleanBody(input.body);
    if (!body) return fail('empty');
    if (body.length > MAX_LEN) return fail('too_long');

    const { data: existing } = await db.from('support_threads').select('id').eq('user_id', user.id).maybeSingle();
    if (existing) {
      const since = new Date(Date.now() - 3600_000).toISOString();
      const { count } = await db
        .from('support_messages')
        .select('id', { count: 'exact', head: true })
        .eq('thread_id', existing.id)
        .eq('sender', 'user')
        .gte('created_at', since);
      if ((count ?? 0) >= PER_HOUR) return fail('slow_down', 429);
    }

    const { data: profile } = await db.from('profiles').select('full_name,email,last_workspace_id').eq('id', user.id).maybeSingle();
    let workspaceName = '';
    if (profile?.last_workspace_id) {
      const { data: ws } = await db.from('workspaces').select('name').eq('id', profile.last_workspace_id).maybeSingle();
      workspaceName = ws?.name ?? '';
    }
    const email = profile?.email ?? user.email ?? '';
    const name = profile?.full_name ?? '';
    const now = new Date();

    const { data: thread, error: tErr } = await db
      .from('support_threads')
      .upsert(
        {
          user_id: user.id,
          email,
          name,
          workspace_name: workspaceName,
          status: 'open',
          founder_unread: true,
          last_message_at: now.toISOString(),
          last_preview: preview(body),
          last_sender: 'user',
        },
        { onConflict: 'user_id' },
      )
      .select('id')
      .single();
    if (tErr || !thread) return fail(tErr?.message ?? 'thread_failed', 500);

    const { data: message, error: mErr } = await db
      .from('support_messages')
      .insert({ thread_id: thread.id, sender: 'user', body, created_at: now.toISOString() })
      .select('id,sender,body,created_at')
      .single();
    if (mErr) return fail(mErr.message, 500);

    background(
      sendEmail(
        INBOX_EMAIL,
        existing ? `New message from ${email}` : `New support request from ${email}`,
        layout(
          existing ? 'New message' : 'New support request',
          details([
            ['Name', name || 'Not set'],
            ['Email', email],
            ['Workspace', workspaceName || 'Not set'],
            ['Received', london(now)],
          ]) + quote(body, 'Message'),
          { label: 'Reply in inbox', url: `${APP_URL}/private#${thread.id}` },
          preview(body),
        ),
        { replyTo: email || undefined },
      ),
    );
    return json({ message });
  }

  // ---- founder: sign in -----------------------------------------------------
  if (input.action === 'login') {
    const password = Deno.env.get('PRIVATE_INBOX_PASSWORD');
    if (!password) return fail('inbox_not_configured', 503);
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await db.from('support_admin_logins').select('id', { count: 'exact', head: true }).eq('ok', false).gte('at', since);
    if ((count ?? 0) >= LOCK_AFTER) return fail('locked', 429);
    const ok = await same(String(input.password ?? ''), password);
    await db.from('support_admin_logins').insert({ ok });
    if (!ok) {
      await new Promise((r) => setTimeout(r, 400));
      return fail('wrong_password', 401);
    }
    return json(await makeToken());
  }

  // ---- founder: everything else needs a valid token -------------------------
  if (!(await validToken(input.token))) return fail('unauthorized', 401);

  if (input.action === 'threads') {
    const { data, error } = await db
      .from('support_threads')
      .select('id,email,name,workspace_name,status,founder_unread,last_message_at,last_preview,last_sender,created_at')
      .order('last_message_at', { ascending: false })
      .limit(500);
    if (error) return fail(error.message, 500);
    return json({ threads: data });
  }

  if (input.action === 'messages') {
    const id = String(input.thread_id ?? '');
    const { data: thread } = await db
      .from('support_threads')
      .select('id,email,name,workspace_name,status,founder_unread,last_message_at,last_preview,last_sender,created_at')
      .eq('id', id)
      .maybeSingle();
    if (!thread) return fail('not_found', 404);
    const { data: messages, error } = await db
      .from('support_messages')
      .select('id,sender,body,created_at')
      .eq('thread_id', id)
      .order('created_at', { ascending: true });
    if (error) return fail(error.message, 500);
    if (thread.founder_unread) await db.from('support_threads').update({ founder_unread: false }).eq('id', id);
    return json({ thread: { ...thread, founder_unread: false }, messages });
  }

  if (input.action === 'reply') {
    const id = String(input.thread_id ?? '');
    const body = cleanBody(input.body);
    if (!body) return fail('empty');
    if (body.length > MAX_LEN) return fail('too_long');
    const { data: thread } = await db.from('support_threads').select('id,email,name').eq('id', id).maybeSingle();
    if (!thread) return fail('not_found', 404);
    const now = new Date().toISOString();
    const { data: message, error } = await db
      .from('support_messages')
      .insert({ thread_id: id, sender: 'founder', body, created_at: now })
      .select('id,sender,body,created_at')
      .single();
    if (error) return fail(error.message, 500);
    await db
      .from('support_threads')
      .update({ last_message_at: now, last_preview: preview(body), last_sender: 'founder', user_unread: true, founder_unread: false })
      .eq('id', id);

    const { data: asked } = await db
      .from('support_messages')
      .select('body')
      .eq('thread_id', id)
      .eq('sender', 'user')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const first = (thread.name ?? '').trim().split(/\s+/)[0];
    background(
      sendEmail(
        thread.email,
        'Oliver replied to your question',
        layout(
          first ? `Hi ${first}, Oliver replied` : 'Oliver replied',
          quote(body) + (asked?.body ? quote(asked.body, 'You asked') : '') + p('You can carry on the conversation from the chat in the bottom corner of Decibel.'),
          { label: 'Open the chat', url: `${APP_URL}/app?support=1` },
          preview(body),
        ),
        { replyTo: FOUNDER_EMAIL },
      ),
    );
    return json({ message });
  }

  if (input.action === 'status') {
    const status = input.status === 'closed' ? 'closed' : 'open';
    const { error } = await db.from('support_threads').update({ status }).eq('id', String(input.thread_id ?? ''));
    if (error) return fail(error.message, 500);
    return json({ ok: true });
  }

  return fail('unknown action');
});

// Transactional email through Resend, sent from the verified hello.usedecibel.com domain.
// Every template uses one layout: white page, black text, the ear logo, nothing loud.

const SITE = 'https://www.usedecibel.com';
export const FOUNDER_EMAIL = 'oliver@usedecibel.com';

type SendOptions = { replyTo?: string; headers?: Record<string, string> };

/** Sends a transactional email through Resend. Returns false when Resend is not configured. */
export async function sendEmail(to: string | string[], subject: string, html: string, opts: SendOptions = {}): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    console.log(`[email skipped: RESEND_API_KEY not set] to=${to} subject=${subject}`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') ?? 'Decibel <oliver@hello.usedecibel.com>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
      ...(opts.replyTo ? { reply_to: opts.replyTo } : {}),
      ...(opts.headers ? { headers: opts.headers } : {}),
    }),
  });
  if (!res.ok) console.error('resend error', res.status, await res.text());
  return res.ok;
}

/** Escapes text people typed before it goes into an email. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Escaped text with its line breaks kept. */
export function paragraphs(s: string): string {
  return esc(s.trim()).replace(/\r?\n/g, '<br>');
}

const FONT = `Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif`;
const INK = '#141414';
const MUTED = '#5c5c5c';
const FAINT = '#9a9a9a';
const LINE = '#ececec';

export const p = (html: string) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:${MUTED}">${html}</p>`;

/** A quoted block for a message someone wrote. */
export const quote = (text: string, label?: string) =>
  `<div style="margin:0 0 20px">${label ? `<div style="font-size:13px;line-height:20px;color:${FAINT};margin:0 0 6px">${esc(label)}</div>` : ''}<div style="border-left:2px solid ${LINE};padding:2px 0 2px 14px;font-size:15px;line-height:24px;color:${INK}">${paragraphs(text)}</div></div>`;

/** Label and value rows, for the founder's notification. */
export const details = (rows: [string, string][]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-top:1px solid ${LINE}">${rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:13px;color:${FAINT};width:110px;vertical-align:top">${esc(k)}</td><td style="padding:9px 0;border-bottom:1px solid ${LINE};font-size:14px;color:${INK}">${esc(v)}</td></tr>`,
    )
    .join('')}</table>`;

export function layout(title: string, body: string, cta?: { label: string; url: string }, preheader = '', unsubscribeUrl?: string): string {
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 8px"><tr><td style="border-radius:6px;background:${INK}"><a href="${cta.url}" style="display:inline-block;padding:11px 18px;font-family:${FONT};font-size:14px;font-weight:500;letter-spacing:-0.01em;color:#ffffff;text-decoration:none;border-radius:6px">${cta.label}</a></td></tr></table>`
    : '';
  return `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;-webkit-font-smoothing:antialiased">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff">
<tr><td align="center" style="padding:48px 20px 40px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;font-family:${FONT};letter-spacing:-0.01em">
<tr><td style="padding:0 0 40px">
<a href="${SITE}" style="text-decoration:none;color:${INK}"><img src="${SITE}/brand/ear.png" width="12" height="20" alt="" style="vertical-align:-4px;border:0;margin-right:7px"><span style="font-size:15px;font-weight:600;letter-spacing:-0.02em;color:${INK}">Decibel</span></a>
</td></tr>
<tr><td>
<h1 style="margin:0 0 16px;font-size:22px;line-height:28px;font-weight:600;letter-spacing:-0.025em;color:${INK}">${title}</h1>
${body}
${button}
</td></tr>
<tr><td style="padding:40px 0 0">
<div style="border-top:1px solid ${LINE};padding-top:16px;font-size:12px;line-height:18px;color:${FAINT}">Decibel · Verified UK &amp; EU mobiles and the dialler to reach them.<br><a href="${SITE}" style="color:${FAINT};text-decoration:none">usedecibel.com</a>${unsubscribeUrl ? `<br><br>Don&rsquo;t want these reminders? <a href="${unsubscribeUrl}" style="color:${FAINT};text-decoration:underline">Unsubscribe</a>.` : ''}</div>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

// ---- unsubscribe links ------------------------------------------------------
// A link carries the user id and an HMAC of it, so it works without signing in
// and cannot be forged for someone else.

async function unsubSig(userId: string): Promise<string> {
  const secret = `unsubscribe|${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''}`;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(userId));
  return btoa(String.fromCharCode(...new Uint8Array(sig).slice(0, 18))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function validUnsubscribe(userId: string, token: string): Promise<boolean> {
  if (!/^[0-9a-f-]{36}$/i.test(userId) || !token) return false;
  const expected = await unsubSig(userId);
  let diff = expected.length ^ token.length;
  for (let i = 0; i < Math.min(expected.length, token.length); i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

/** The page link for the email footer and the one-click link for mail clients (RFC 8058). */
export async function unsubscribeLinks(userId: string, appUrl: string, functionsUrl: string) {
  const q = `u=${userId}&t=${await unsubSig(userId)}`;
  return {
    page: `${appUrl}/unsubscribe?${q}`,
    headers: {
      'List-Unsubscribe': `<${functionsUrl}/unsubscribe?${q}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

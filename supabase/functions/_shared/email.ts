/** Sends a transactional email through Resend. Returns false when Resend is not configured. */
export async function sendEmail(to: string | string[], subject: string, html: string): Promise<boolean> {
  const key = Deno.env.get('RESEND_API_KEY');
  if (!key) {
    console.log(`[email skipped: RESEND_API_KEY not set] to=${to} subject=${subject}`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      from: Deno.env.get('EMAIL_FROM') ?? 'Decibel <hello@decibel.io>',
      to: Array.isArray(to) ? to : [to],
      subject,
      html,
    }),
  });
  if (!res.ok) console.error('resend error', res.status, await res.text());
  return res.ok;
}

export function layout(title: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<p style="margin:24px 0"><a href="${cta.url}" style="background:#1A6CF6;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;display:inline-block">${cta.label}</a></p>`
    : '';
  return `<div style="font-family:Inter,system-ui,sans-serif;color:#232326;max-width:520px;margin:0 auto;padding:32px 16px">
  <p style="font-weight:600;font-size:16px;margin:0 0 24px">Decibel</p>
  <h1 style="font-size:20px;line-height:24px;margin:0 0 12px">${title}</h1>
  <div style="font-size:14px;line-height:20px;color:#52525B">${body}</div>
  ${button}
  <p style="font-size:12px;color:#A1A1AA;margin-top:32px">Decibel · Turn up your outbound.</p>
</div>`;
}

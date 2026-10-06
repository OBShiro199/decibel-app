// Stripe over fetch (form-encoded), no SDK.
export const STRIPE_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';

export const PRICES = {
  starter: { monthly: Deno.env.get('STRIPE_PRICE_STARTER_MONTHLY') ?? '', annual: Deno.env.get('STRIPE_PRICE_STARTER_ANNUAL') ?? '' },
  growth: { monthly: Deno.env.get('STRIPE_PRICE_GROWTH_MONTHLY') ?? '', annual: Deno.env.get('STRIPE_PRICE_GROWTH_ANNUAL') ?? '' },
} as const;

export const CREDIT_PACKS: Record<string, { price: string; credits: number }> = {
  '500': { price: Deno.env.get('STRIPE_PRICE_CREDITS_500') ?? '', credits: 500 },
  '2000': { price: Deno.env.get('STRIPE_PRICE_CREDITS_2000') ?? '', credits: 2000 },
  '10000': { price: Deno.env.get('STRIPE_PRICE_CREDITS_10000') ?? '', credits: 10000 },
};

/** Monthly data credits granted per seat on each paid invoice. */
export const PLAN_CREDITS: Record<string, number> = { starter: 500, growth: 5000, scale: 5000 }; // growth is sold as Pro

export function planForPrice(priceId: string | null | undefined): 'starter' | 'growth' | null {
  if (!priceId) return null;
  if (priceId === PRICES.starter.monthly || priceId === PRICES.starter.annual) return 'starter';
  if (priceId === PRICES.growth.monthly || priceId === PRICES.growth.annual) return 'growth';
  return null;
}

function flatten(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === 'object') flatten(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

export async function stripe<T = any>(method: 'GET' | 'POST' | 'DELETE', path: string, params?: Record<string, unknown>): Promise<T> {
  let url = `https://api.stripe.com/v1${path}`;
  const init: RequestInit = { method, headers: { authorization: `Bearer ${STRIPE_KEY}` } };
  if (params) {
    const body = flatten(params).toString();
    if (method === 'GET') url += `?${body}`;
    else {
      (init.headers as Record<string, string>)['content-type'] = 'application/x-www-form-urlencoded';
      init.body = body;
    }
  }
  const res = await fetch(url, init);
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `Stripe ${res.status}`);
  return data as T;
}

/** Verifies the Stripe-Signature header (v1 scheme, 5 minute tolerance). */
export async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=') as [string, string]));
  const t = parts.t;
  const v1 = header
    .split(',')
    .filter((p) => p.startsWith('v1='))
    .map((p) => p.slice(3));
  if (!t || !v1.length) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return v1.some((candidate) => {
    if (candidate.length !== hex.length) return false;
    let diff = 0;
    for (let i = 0; i < hex.length; i++) diff |= hex.charCodeAt(i) ^ candidate.charCodeAt(i);
    return diff === 0;
  });
}

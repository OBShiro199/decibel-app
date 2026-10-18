// Website visitor identification (migration 0042). Public: the v.js snippet on a customer's website posts each
// page view here as { k: site key, p: path, r: referrer } (text/plain, so browsers send it without a preflight).
// The visitor's IP comes from the request itself. Bots and visitors who ask not to be tracked are dropped in
// v.js and again here. The IP is resolved to a company through enrich.so, cached for 30 days across all
// workspaces (a lookup is charged only when a company is found), and the company is recorded against the
// workspace. Home and mobile connections never resolve, so the person browsing is never identified.
import { admin } from '../_shared/http.ts';

const ENRICH = Deno.env.get('ENRICH_SO_API_KEY') ?? '';
const CACHE_DAYS = 30;
const BOT = /bot|crawl|spider|slurp|headless|preview|monitor|uptime|lighthouse|pingdom|facebookexternalhit|curl|wget|python|httpclient/i;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};
const done = (status = 204) => new Response(null, { status, headers: cors });

/** the visitor's IP: the first address the edge saw */
function clientIp(req: Request): string | null {
  const raw = req.headers.get('cf-connecting-ip') ?? req.headers.get('x-real-ip') ?? req.headers.get('x-forwarded-for')?.split(',')[0] ?? '';
  const ip = raw.trim();
  if (!ip || ip.length > 45 || !/^[0-9a-fA-F:.]+$/.test(ip)) return null;
  // private and loopback ranges never belong to a company
  if (/^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|fc|fd|fe80)/i.test(ip)) return null;
  return ip;
}

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.slice(0, n) : null);

/** desktop, mobile or tablet, from the user agent (for the All visits view) */
function device(ua: string): 'desktop' | 'mobile' | 'tablet' {
  if (/ipad|tablet|kindle|silk|playbook|(android(?!.*mobile))/i.test(ua)) return 'tablet';
  if (/mobi|iphone|ipod|android|windows phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

interface Resolution {
  domain: string | null;
  organization: string | null;
  country: string | null;
  country_code?: string | null;
  region: string | null;
  city: string | null;
  isp: string | null;
}

/** IP → company: the shared cache first, then enrich.so (charged only when a domain comes back) */
async function resolve(ip: string): Promise<Resolution | null> {
  const db = admin();
  const { data: hit } = await db.from('visitor_ip_cache').select('*').eq('ip', ip).maybeSingle();
  if (hit && Date.now() - new Date(hit.resolved_at).getTime() < CACHE_DAYS * 86_400_000) return hit as Resolution;
  if (!ENRICH) return null;
  const res = await fetch('https://dev.enrich.so/api/v3/ip-to-company', {
    method: 'POST',
    headers: { authorization: `Bearer ${ENRICH}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ ip }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) return null;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // a refusal (no credits, bad key, rate limit) is not cached, so the IP is tried again next time
    console.error('enrich.so', res.status, JSON.stringify(body)?.slice(0, 200));
    return null;
  }
  const d = body?.data ?? {};
  const domain = typeof d.ipDomain === 'string' && d.ipDomain.trim() ? d.ipDomain.trim().toLowerCase().replace(/^www\./, '') : null;
  const row = {
    ip,
    domain,
    organization: d.ipOrganization ?? null,
    country: d.ipCountryName ?? null,
    country_code: d.ipCountryCode ?? null,
    region: d.ipRegionName ?? null,
    city: d.ipCity ?? null,
    isp: d.ipIsp ?? null,
    credits_used: Number(body?.meta?.creditsUsed ?? 0) || 0,
    resolved_at: new Date().toISOString(),
  };
  await db.from('visitor_ip_cache').upsert(row);
  return row;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return done();
  if (req.method !== 'POST') return done(405);
  const ua = req.headers.get('user-agent') ?? '';
  if (!ua || BOT.test(ua) || req.headers.get('sec-gpc') === '1' || req.headers.get('dnt') === '1') return done();
  const ip = clientIp(req);
  if (!ip) return done();

  let input: Record<string, unknown> = {};
  try {
    input = JSON.parse(await req.text());
  } catch {
    return done(400);
  }
  const key = clip(input.k, 64);
  if (!key) return done(400);

  const db = admin();
  const { data: site } = await db.from('visitor_sites').select('id, workspace_id, domain').eq('site_key', key).maybeSingle();
  if (!site) return done(404);

  // only page views sent from the site's own pages count (or its subdomains); anything else is ignored
  const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? '';
  let host = '';
  try {
    host = new URL(origin).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    /* no origin */
  }
  if (!host || (host !== site.domain && !host.endsWith(`.${site.domain}`))) return done(403);

  // one visitor can't flood a site: 60 page views a minute per IP
  const { data: allowed } = await db.rpc('check_rate_limit', { p_key: `visit:${site.id}:${ip}`, p_limit: 60, p_window_seconds: 60 });
  if (allowed === false) return done(429);

  const path = clip(input.p, 300);
  const referrer = clip(input.r, 300);
  const work = (async () => {
    const r = await resolve(ip);
    // every page view keeps its location and network, whether or not it resolved to a company
    await db.from('visitor_hits').insert({
      site_id: site.id,
      workspace_id: site.workspace_id,
      ip,
      path,
      referrer,
      company_domain: r?.domain ?? null,
      country: r?.country ?? null,
      country_code: r?.country_code ?? null,
      region: r?.region ?? null,
      city: r?.city ?? null,
      isp: r?.isp ?? null,
      device: device(ua),
    });
    await db.from('visitor_sites').update({ last_hit_at: new Date().toISOString() }).eq('id', site.id);
    if (r?.domain) {
      await db.rpc('record_visitor_company', {
        p_site_id: site.id,
        p_domain: r.domain,
        p_organization: r.organization ?? null,
        p_country: r.country ?? null,
        p_region: r.region ?? null,
        p_city: r.city ?? null,
        p_isp: r.isp ?? null,
        p_ip: ip,
        p_path: path,
      });
    }
  })().catch((e) => console.error('visitor-track', (e as Error).message));

  // answer the browser straight away; the lookup finishes in the background
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime) runtime.waitUntil(work);
  else await work;
  return done(202);
});

// Website visitor identification (migration 0042). Public: the v.js snippet on a customer's website posts each
// page view here as { k: site key, p: path, r: referrer } (text/plain, so browsers send it without a preflight).
// The visitor's IP comes from the request itself. Bots and visitors who ask not to be tracked are dropped in
// v.js and again here. The IP is resolved to a company through enrich.so, cached for 30 days across all
// workspaces (a lookup is charged only when a company is found), and the company is recorded against the
// workspace. Home and mobile connections never resolve, so the person browsing is never identified.
import { admin, APP_URL, FUNCTIONS_URL } from '../_shared/http.ts';
import { crc } from '../_shared/crc.ts';
import { details, esc, FOUNDER_EMAIL, layout, p, sendEmail, unsubscribeLinks } from '../_shared/email.ts';

const ENRICH = Deno.env.get('ENRICH_SO_API_KEY') ?? '';
const TS_URL = (Deno.env.get('TYPESENSE_URL') ?? '').replace(/\/$/, '');
const TS_KEY = Deno.env.get('TYPESENSE_API_KEY') ?? '';
const SENIORITY = ['c-level', 'vp', 'director', 'manager'];
// at most this many "new company" emails a workspace gets in a day, however busy its website is
const ALERTS_PER_DAY = 25;
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

// VPNs, cloud hosts, CDNs and security proxies: an address on these networks is shared by many people, so any
// company matched to it is a guess (a Mozilla VPN exit in Munich came back as a stranger's personal site). The
// visit is kept with its location, but no company is recorded.
const RELAY =
  /\b(fastly|cloudflare|akamai|amazon web services|amazon data services|amazon technologies|aws|google cloud|azure|digitalocean|linode|ovh|hetzner|contabo|vultr|choopa|leaseweb|m247|datacamp|cdn77|zscaler|netskope|mullvad|nordvpn|tefincom|expressvpn|surfshark|proton|private internet access|cyberghost|ipvanish|windscribe|mozilla|icloud private relay|packethub|hostinger|ionos|scaleway|oracle cloud|alibaba|tencent|quadranet|psychz|g-?core|constant company|colocrossing|hostwinds|hosting|vpn|proxy|data ?cent(er|re))\b/i;
const isRelay = (r: { organization?: string | null; isp?: string | null }) => RELAY.test(`${r.organization ?? ''} | ${r.isp ?? ''}`);

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

interface Teaser {
  full_name: string;
  current_title: string | null;
  has_mobile: boolean;
}

/** up to three decision makers at the company (names and titles only; contact details stay in the app) */
async function decisionMakers(domain: string): Promise<{ people: Teaser[]; found: number }> {
  if (!TS_URL || !TS_KEY) return { people: [], found: 0 };
  const tick = (s: string) => `\`${s.replace(/`/g, '')}\``;
  const variants = [domain, `www.${domain}`, `https://${domain}`, `http://${domain}`, `https://www.${domain}`, `http://www.${domain}`];
  const filter = `company_domain:=[${variants.map(tick).join(', ')}]`;
  const res = await fetch(`${TS_URL}/multi_search`, {
    method: 'POST',
    headers: { 'X-TYPESENSE-API-KEY': TS_KEY, 'content-type': 'application/json' },
    body: JSON.stringify({
      searches: SENIORITY.map((s) => ({ collection: 'leads', q: '*', filter_by: `${filter} && seniority_h:=${crc(s)}`, per_page: 6, include_fields: 'full_name,current_title,has_mobile,has_email' })),
    }),
    signal: AbortSignal.timeout(8_000),
  }).catch(() => null);
  const body = res?.ok ? await res.json().catch(() => null) : null;
  const levels = (body?.results ?? []) as { found?: number; hits?: { document: Teaser & { has_email?: boolean } }[] }[];
  // most senior first; within a level, people with a mobile, then an email
  const people = levels
    .flatMap((r) => [...(r.hits ?? [])].map((h) => h.document).sort((a, b) => Number(b.has_mobile) - Number(a.has_mobile) || Number(!!b.has_email) - Number(!!a.has_email)))
    .filter((d) => d.full_name)
    .slice(0, 3);
  return { people, found: levels.reduce((a, r) => a + (r.found ?? 0), 0) };
}

/** "New company resolved" to everyone in the workspace who hasn't unsubscribed from Decibel emails */
async function newCompanyEmail(site: { id: string; workspace_id: string; domain: string }, domain: string, r: Resolution, path: string | null) {
  const db = admin();
  const { data: allowed } = await db.rpc('check_rate_limit', { p_key: `visitor-alert:${site.workspace_id}`, p_limit: ALERTS_PER_DAY, p_window_seconds: 86_400 });
  if (allowed === false) return;
  const { data: members } = await db.from('workspace_members').select('user_id,profiles(email,full_name,email_opt_out_at,notification_prefs)').eq('workspace_id', site.workspace_id);
  const to = (members ?? [])
    .map((m) => ({
      id: (m as { user_id: string }).user_id,
      ...((m as { profiles?: { email?: string; email_opt_out_at?: string | null; notification_prefs?: Record<string, boolean> | null } }).profiles ?? {}),
    }))
    // anyone who unsubscribed, or switched these off in Settings › General › Emails, is skipped
    .filter((m) => m.email && !m.email_opt_out_at && m.notification_prefs?.visitor_alerts !== false);
  if (!to.length) return;

  const { people, found } = await decisionMakers(domain);
  const name = r.organization?.trim() || domain;
  const subject = `New company resolved on ${site.domain}: ${name}`;
  for (const m of to) {
    const links = await unsubscribeLinks(m.id, APP_URL, FUNCTIONS_URL);
    const html = newCompanyHtml(site.domain, domain, r, path, people, found, links.page);
    await sendEmail(m.email!, subject, html, { replyTo: FOUNDER_EMAIL, headers: links.headers });
  }
}

/** the email itself (exported for previews) */
export function newCompanyHtml(
  siteDomain: string,
  domain: string,
  r: Pick<Resolution, 'organization' | 'city' | 'country'>,
  path: string | null,
  people: Teaser[],
  found: number,
  unsubscribeUrl?: string,
) {
  const name = r.organization?.trim() || domain;
  const where = [r.city, r.country].filter(Boolean).join(', ');
  const rows: [string, string][] = [['Company', name], ['Website', domain]];
  if (where) rows.push(['Location', where]);
  if (path) rows.push(['First page', path]);
  const list = people.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:0 0 20px;border-top:1px solid #ececec">${people
        .map(
          (d) =>
            `<tr><td style="padding:10px 0;border-bottom:1px solid #ececec"><div style="font-size:15px;line-height:22px;font-weight:500;color:#141414">${esc(d.full_name)}</div><div style="font-size:14px;line-height:21px;color:#5c5c5c">${esc(d.current_title ?? '')}${d.has_mobile ? ' · mobile on file' : ''}</div></td></tr>`,
        )
        .join('')}</table>`
    : '';
  const lead = people.length
    ? p(`${found > people.length ? `${found.toLocaleString('en-GB')} decision makers are` : 'These decision makers are'} on file at ${esc(name)}. Reveal their emails and mobiles in Decibel.`)
    : p(`We don't have decision makers on file for ${esc(domain)} yet, but you can see every page they looked at.`);
  return layout(
    `${esc(name)} just visited ${esc(siteDomain)}`,
    p('A new company has been resolved from a visit to your website.') +
      details(rows) +
      lead +
      list +
      `<p style="margin:16px 0 0;font-size:13px;line-height:20px;color:#9a9a9a">Turn these emails off in Decibel under Settings, General, Emails.</p>`,
    { label: people.length ? 'See the decision makers' : 'See the visit', url: `${APP_URL}/app/visitors` },
    `${name} just visited ${siteDomain}.`,
    unsubscribeUrl,
  );
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
    // a company only when the network is the company's own, not a VPN, cloud host or CDN
    const domain = r?.domain && !isRelay(r) ? r.domain : null;
    // every page view keeps its location and network, whether or not it resolved to a company
    await db.from('visitor_hits').insert({
      site_id: site.id,
      workspace_id: site.workspace_id,
      ip,
      path,
      referrer,
      company_domain: domain,
      country: r?.country ?? null,
      country_code: r?.country_code ?? null,
      region: r?.region ?? null,
      city: r?.city ?? null,
      isp: r?.isp ?? null,
      device: device(ua),
    });
    await db.from('visitor_sites').update({ last_hit_at: new Date().toISOString() }).eq('id', site.id);
    if (r && domain) {
      const { data: isNew } = await db.rpc('record_visitor_company', {
        p_site_id: site.id,
        p_domain: domain,
        p_organization: r.organization ?? null,
        p_country: r.country ?? null,
        p_region: r.region ?? null,
        p_city: r.city ?? null,
        p_isp: r.isp ?? null,
        p_ip: ip,
        p_path: path,
      });
      if (isNew === true) await newCompanyEmail(site, domain, r, path).catch((e) => console.error('visitor alert', (e as Error).message));
    }
  })().catch((e) => console.error('visitor-track', (e as Error).message));

  // answer the browser straight away; the lookup finishes in the background
  const runtime = (globalThis as unknown as { EdgeRuntime?: { waitUntil: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime) runtime.waitUntil(work);
  else await work;
  return done(202);
});

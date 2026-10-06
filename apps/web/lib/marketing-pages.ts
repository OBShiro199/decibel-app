// Every public marketing page in one place: the header dropdowns, the footer and the
// sitemap all read from here, so a new page only needs adding once.

export type MarketingLink = { href: string; label: string; blurb: string; glyph: string };

/** Product dropdown: what Decibel does. `glyph` is a small ASCII mark shown beside the label. */
export const PRODUCT_LINKS: MarketingLink[] = [
  { href: '/features/verified-mobiles', label: 'Verified mobiles', blurb: 'UK and EU decision makers, one credit per mobile', glyph: '[#]' },
  { href: '/features/power-dialler', label: 'Power dialler', blurb: 'Call down a list from your browser', glyph: '>>>' },
  { href: '/features/call-recording', label: 'Call recording', blurb: 'Every call recorded, with the notice handled', glyph: '(o)' },
  { href: '/features/pipeline', label: 'Lists and pipeline', blurb: 'Outcomes move deals on their own', glyph: '|||' },
  { href: '/local-businesses', label: 'Local businesses', blurb: 'Map listings with ratings, hours and numbers', glyph: '<+>' },
  { href: '/data-quality', label: 'Data quality', blurb: 'How every number is checked', glyph: '{v}' },
  { href: '/integrations', label: 'Integrations', blurb: 'CRMs, Zapier, webhooks and CSV', glyph: '<->' },
  { href: '/compliance', label: 'Compliance', blurb: 'TPS, CTPS, GDPR and recording rules', glyph: '[ok]' },
];

export const INDUSTRY_LINKS: MarketingLink[] = [
  { href: '/industries/b2b-sales', label: 'B2B sales', blurb: 'SDR and AE teams booking meetings', glyph: '$_' },
  { href: '/industries/it-infrastructure', label: 'IT and infrastructure', blurb: 'MSPs, resellers and cloud partners', glyph: '>_' },
  { href: '/industries/recruitment', label: 'Recruitment', blurb: 'Agencies calling hiring managers', glyph: '@_' },
];

export const COMPARE_LINKS: MarketingLink[] = [
  { href: '/vs/cognism', label: 'Decibel vs. Cognism', blurb: 'Enterprise data platform compared', glyph: 'vs' },
  { href: '/vs/lusha', label: 'Decibel vs. Lusha', blurb: 'Contact data extension compared', glyph: 'vs' },
  { href: '/vs/kaspr', label: 'Decibel vs. Kaspr', blurb: 'EU data extension compared', glyph: 'vs' },
];

/** Free public tools (pay-as-you-go lookups behind the free-tools Edge Function). */
export const TOOL_LINKS: MarketingLink[] = [
  { href: '/tools/tps-checker', label: 'TPS checker', blurb: 'Is a UK number on the TPS or CTPS?', glyph: '[x]' },
  { href: '/tools/email-verifier', label: 'Email verifier', blurb: 'Will an email bounce before you send?', glyph: '@?' },
  { href: '/tools/phone-validator', label: 'Phone validator', blurb: 'Valid number, line type and network', glyph: '#?' },
];

export const COMPANY_LINKS: { href: string; label: string }[] = [
  { href: '/blog', label: 'Blog' },
  { href: '/careers', label: 'Careers' },
  { href: '/demo', label: 'Book a demo' },
  { href: '/vs', label: 'Compare' },
];

/** Public pages for the sitemap. Signed-in app routes are never listed. */
export const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/features', priority: 0.9, changeFrequency: 'monthly' },
  ...PRODUCT_LINKS.map((l) => ({ path: l.href, priority: l.href === '/compliance' ? 0.7 : 0.8, changeFrequency: 'monthly' as const })),
  { path: '/industries', priority: 0.7, changeFrequency: 'monthly' },
  ...INDUSTRY_LINKS.map((l) => ({ path: l.href, priority: 0.7, changeFrequency: 'monthly' as const })),
  { path: '/vs', priority: 0.7, changeFrequency: 'monthly' },
  ...COMPARE_LINKS.map((l) => ({ path: l.href, priority: 0.7, changeFrequency: 'monthly' as const })),
  { path: '/tools', priority: 0.8, changeFrequency: 'monthly' },
  ...TOOL_LINKS.map((l) => ({ path: l.href, priority: 0.8, changeFrequency: 'monthly' as const })),
  { path: '/blog', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/careers', priority: 0.5, changeFrequency: 'monthly' },
  { path: '/demo', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/signup', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/fair-use', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/dpa', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/art-14', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/privacy/opt-out', priority: 0.2, changeFrequency: 'yearly' },
];

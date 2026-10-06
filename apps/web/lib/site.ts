// The public site address, without a trailing slash. Set NEXT_PUBLIC_APP_URL in Vercel.
export const SITE_URL = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.usedecibel.com').replace(/\/$/, '');

/** The founder's direct line, shown in the website footer, the sign-in footer and the account menu. */
export const FOUNDER = {
  name: 'Oliver',
  email: 'oliver@usedecibel.com',
  phone: '+447585509647',
  phoneDisplay: '+44 7585 509647',
  /** Square photo for the support chat (public path), or null to show initials. */
  photo: '/brand/founder.webp' as string | null,
} as const;

export const SITE_TITLE = 'Decibel · 1 million verified mobiles & the dialler to reach them all';
export const SITE_DESCRIPTION =
  'Search UK and EU decision makers, reveal a direct mobile for one credit and call it from your browser. TPS screening, call recording and a self-updating pipeline built in.';

/** Public marketing pages, for the sitemap. Signed-in app routes are never listed. */
export const PUBLIC_PAGES: { path: string; priority: number; changeFrequency: 'weekly' | 'monthly' | 'yearly' }[] = [
  { path: '/', priority: 1, changeFrequency: 'weekly' },
  { path: '/signup', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/compliance', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/dpa', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/art-14', priority: 0.2, changeFrequency: 'yearly' },
  { path: '/privacy/opt-out', priority: 0.2, changeFrequency: 'yearly' },
];

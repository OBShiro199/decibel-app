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

// The public page list (for the sitemap) lives in lib/marketing-pages.ts.

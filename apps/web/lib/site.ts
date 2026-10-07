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

// Under 60 characters so Google shows it in full; no figures that need a footnote.
export const SITE_TITLE = 'Decibel: verified UK & EU mobiles and a power dialler';
export const SITE_DESCRIPTION =
  'Find UK and EU decision makers, reveal their verified mobile numbers and call them from your browser with a built-in power dialler. Free 14-day trial.';

// The public page list (for the sitemap) lives in lib/marketing-pages.ts.

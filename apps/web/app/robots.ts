import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Marketing pages are public; the signed-in app, onboarding and auth plumbing are not.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/app', '/onboarding', '/auth', '/invite', '/api', '/dev-preview', '/dev-onboarding'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}

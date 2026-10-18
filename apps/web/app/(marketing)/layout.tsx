import Script from 'next/script';
import { CookieBanner } from '@/components/marketing/cookie-banner';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-page-scroll className="marketing-root flex min-h-screen flex-col bg-white-200">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-toast focus:rounded-sm focus:border focus:border-white-800 focus:bg-white-100 focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
      <CookieBanner />
      {/* our own website visitor identification (Website visitors in the app, site usedecibel.com): cookieless,
          company-level only, skipped for Do Not Track / Global Privacy Control */}
      <Script src="/v.js" data-site="6d90a23db9c453d82808882b" strategy="afterInteractive" />
    </div>
  );
}

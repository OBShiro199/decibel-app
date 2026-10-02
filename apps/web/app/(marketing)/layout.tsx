import { CookieBanner } from '@/components/marketing/cookie-banner';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteHeader } from '@/components/marketing/site-header';

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-page-scroll className="flex min-h-screen flex-col bg-white-200">
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
    </div>
  );
}

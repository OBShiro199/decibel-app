import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { CtaStrip, PageHero } from '@/components/marketing/page-kit';
import { RegionalPricing } from '@/components/marketing/regional-pricing';
import { marketFor } from '@/lib/regional-pricing';

export const metadata: Metadata = {
  title: 'Pricing',
  description: 'One plan with the lead database, the dialler and website visitors. Pick your talk time and see the monthly price for your country.',
  alternates: { canonical: '/pricing' },
};

// priced by the visitor's country (Vercel's IP header); ?country=XX overrides it for testing
export const dynamic = 'force-dynamic';

export default async function PricingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const h = await headers();
  const detected = h.get('x-vercel-ip-country');
  const override = typeof sp.country === 'string' ? sp.country : null;
  const market = marketFor(override ?? detected);
  return (
    <>
      <PageHero
        eyebrow="Pricing"
        location="pricing_hero"
        corners={[market.label, `${market.included.toLocaleString('en-GB')} minutes included`]}
        title="One plan. Choose your talk time."
        lede="The lead database, the dialler, call recording, AI call analysis and website visitors in one plan. Slide to the minutes your team will use and see the monthly price."
      >
        <div className="mx-auto w-full max-w-[1040px] text-left">
          <RegionalPricing key={market.code} market={market} detected={override ? null : detected} debug={sp.debug === '1'} />
        </div>
      </PageHero>
      <CtaStrip location="pricing_page" title="See it on your own call list this week." />
    </>
  );
}

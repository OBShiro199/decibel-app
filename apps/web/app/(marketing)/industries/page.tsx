import type { Metadata } from 'next';
import Link from 'next/link';
import { AsciiBox, ASCII_FONT, Checklist, CtaStrip, JsonLd, PageHero, Related, Section } from '@/components/marketing/page-kit';
import { Reveal } from '@/components/marketing/daygent';
import { CompliancePills } from '@/components/marketing/compliance-pills';
import { FAIR_USE_NOTE, PRO, PRO_FEATURES } from '@/lib/constants';
import { INDUSTRY_LINKS } from '@/lib/marketing-pages';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Outbound calling software by industry',
  description: 'How B2B sales teams, IT and infrastructure partners and recruitment agencies use Decibel to find decision makers, call them from the browser and book meetings.',
  alternates: { canonical: '/industries' },
};

const WHO: Record<string, { who: string; calls: string }> = {
  '/industries/b2b-sales': { who: 'SDRs, AEs and sales managers', calls: 'Heads of department, directors and founders' },
  '/industries/it-infrastructure': { who: 'MSPs, resellers, cloud, telecoms and cyber partners', calls: 'IT managers, CTOs and heads of infrastructure' },
  '/industries/recruitment': { who: 'Agency consultants and BD teams', calls: 'Hiring managers and heads of department' },
};

export default function IndustriesPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          name: 'Industries',
          url: `${SITE_URL}/industries`,
          hasPart: INDUSTRY_LINKS.map((l) => ({ '@type': 'WebPage', name: l.label, url: `${SITE_URL}${l.href}` })),
        }}
      />

      <PageHero
        eyebrow="Industries"
        title="Built for teams who sell by phone."
        lede="Decibel puts a contact search, a browser dialler and a pipeline in one place. Here is how that looks for the three kinds of team who use it most."
        location="industries"
        corners={['UK + EU', 'B2B only']}
      >
        <div className="flex justify-center">
          <AsciiBox lines={['search  →  reveal  →  dial  →  log  →  book', '', 'same workflow, three different call lists']} className="max-sm:hidden" />
        </div>
      </PageHero>

      {/* the three industries */}
      <section className="rail">
        <div className="grid md:grid-cols-3">
          {INDUSTRY_LINKS.map((l, i) => (
            <Reveal key={l.href} delay={i * 90} className="border-b border-white-800 md:border-r md:last:border-r-0">
              <Link href={l.href} className="group flex h-full flex-col px-5 py-10 transition-colors hover:bg-white-100 md:px-8">
                <span className="flex items-center justify-between">
                  <span aria-hidden className="select-none text-[13px] text-white-900" style={{ fontFamily: ASCII_FONT }}>
                    {l.glyph}
                  </span>
                  <span className="tabular-nums text-xs tracking-[0.06em] text-faint">{String(i + 1).padStart(2, '0')}</span>
                </span>
                <h2 className="mt-8 text-xl font-medium tracking-[-0.03em] text-black-400">{l.label}</h2>
                <p className="mt-2 text-base leading-[23px] text-black-700">{l.blurb}.</p>
                <dl className="mt-6 space-y-3 border-t border-white-800 pt-5">
                  <div>
                    <dt className="tabular-nums text-xs tracking-[0.06em] text-faint">Who uses it</dt>
                    <dd className="mt-1 text-base text-black-500">{WHO[l.href]?.who}</dd>
                  </div>
                  <div>
                    <dt className="tabular-nums text-xs tracking-[0.06em] text-faint">Who they call</dt>
                    <dd className="mt-1 text-base text-black-500">{WHO[l.href]?.calls}</dd>
                  </div>
                </dl>
                <span className="mt-8 inline-flex items-center gap-1.5 text-base text-black-400">
                  Read more
                  <span className="tabular-nums text-xs text-faint transition-transform group-hover:translate-x-0.5">→</span>
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      {/* what every team gets */}
      <Section
        eyebrow="Every team"
        title="One plan, whatever you sell."
        lede={`${PRO.name} is £${PRO.monthly} per seat per month, or £${PRO.annual.toLocaleString('en-GB')} per seat per year. Prices exclude VAT. Every seat includes:`}
      >
        <div className="grid gap-10 md:grid-cols-[1fr_320px]">
          <div>
            <Checklist items={PRO_FEATURES} />
            <p className="mt-4 tabular-nums text-xs leading-[17px] tracking-[0.06em] text-faint">
              {FAIR_USE_NOTE}{' '}
              <Link href="/fair-use" className="link">
                Fair use policy
              </Link>
            </p>
          </div>
          <div className="rounded-[6px] border border-white-800 bg-white-100 p-5">
            <p className="tabular-nums text-xs tracking-[0.06em] text-faint">Rules built in</p>
            <p className="mt-2 text-base leading-[23px] text-black-700">
              TPS and CTPS checked on every dial, a recording notice on answer, one call at a time and a caller ID that can be rung back.
            </p>
            <CompliancePills className="mt-4" />
            <Link href="/compliance" className="link mt-4 inline-block text-base">
              How compliance works
            </Link>
          </div>
        </div>
      </Section>

      <Related
        links={[
          { href: '/features/power-dialler', label: 'Power dialler', blurb: 'Call down a list from your browser' },
          { href: '/features/pipeline', label: 'Lists and pipeline', blurb: 'Outcomes move deals on their own' },
          { href: '/integrations', label: 'Integrations', blurb: 'CRMs coming soon, CSV export today' },
        ]}
      />
      <CtaStrip location="industries" />
    </>
  );
}

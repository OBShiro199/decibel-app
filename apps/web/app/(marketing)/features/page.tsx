import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/marketing/daygent';
import { CompliancePills } from '@/components/marketing/compliance-pills';
import { ASCII_FONT, Checklist, CtaPair, CtaStrip, DATA_FOOTNOTE, JsonLd, PageHero, Related, Section, Steps } from '@/components/marketing/page-kit';
import { ANNUAL_SAVING_PCT, FAIR_USE_NOTE, PRO, PRO_FEATURES } from '@/lib/constants';
import { PRODUCT_LINKS } from '@/lib/marketing-pages';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Features: data, dialler and pipeline in one place',
  description:
    'Verified UK and EU mobiles, a browser power dialler, call recording, lists and a pipeline that updates itself. See every feature and how they fit together.',
  alternates: { canonical: '/features' },
};

const FLOW = [
  '  search ──► reveal ──► dial ──► log ──► pipeline',
  '     │          │         │       │          │',
  '  filters   1 credit    TPS ✓   keys       stage',
  '                                1 – 9     + task',
];

const FIT: [string, string][] = [
  ['Find the people', 'Search UK and EU decision makers by title, seniority, company size, industry and country, or import your own CSV. Imported rows are screened one by one.'],
  ['Reveal the mobile', 'A reveal costs one credit. Once a contact is revealed it stays free for everyone in your workspace, so nobody pays for the same number twice.'],
  ['Call down the list', 'The power dialler rings each contact in turn from your browser, one call at a time. Every number is checked against TPS, CTPS and your do-not-call list first.'],
  ['Log the outcome', 'Nine outcomes on keys 1 to 9. Notes save as you type and the call recording is attached to the record.'],
  ['Let the pipeline follow', 'Outcomes move the stage and create follow-up tasks. Callbacks land in the Today queue on the day they are due, and per-rep dashboards show the week at a glance.'],
];

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@type': 'ItemList',
  name: 'Decibel features',
  itemListElement: PRODUCT_LINKS.map((l, i) => ({ '@type': 'ListItem', position: i + 1, name: l.label, url: `${SITE_URL}${l.href}` })),
};

export default function FeaturesPage() {
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />
      <PageHero
        eyebrow="Product"
        location="features_hero"
        corners={['UK + EU', '1M+ verified mobiles*']}
        title="Find the number, make the call, keep the deal moving."
        lede="Decibel puts contact data, a browser dialler and a pipeline in one workspace. Each part feeds the next, so a rep goes from a search to a booked meeting without switching tabs."
      >
        <div className="flex flex-col items-center">
          <pre aria-hidden className="max-w-full select-none overflow-hidden whitespace-pre text-left text-[12px] leading-[18px] text-white-900 max-sm:hidden" style={{ fontFamily: ASCII_FONT }}>
            {FLOW.join('\n')}
          </pre>
          <CompliancePills className="mt-6 justify-center" />
        </div>
      </PageHero>

      <Section eyebrow="Features" title="Every part of the product." lede="Start anywhere. Each page explains one part in detail, with what it does and what it costs." flush>
        <div className="grid border-t border-white-800 sm:grid-cols-2 lg:grid-cols-4">
          {PRODUCT_LINKS.map((l, i) => (
            <Reveal key={l.href} delay={(i % 4) * 70} className="border-b border-white-800 sm:border-r">
              <Link href={l.href} className="group flex h-full flex-col px-5 py-7 transition-colors hover:bg-white-100 md:px-8">
                <span aria-hidden className="select-none text-xs text-faint" style={{ fontFamily: ASCII_FONT }}>
                  {l.glyph}
                </span>
                <span className="mt-4 flex items-center justify-between text-md font-medium tracking-[-0.02em] text-black-400">
                  {l.label}
                  <span className="tabular-nums text-xs text-faint transition-transform group-hover:translate-x-0.5">→</span>
                </span>
                <span className="mt-1.5 text-base leading-[23px] text-black-700">{l.blurb}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section eyebrow="How it fits together" title="Five steps, one record." lede="The same contact record carries the number, the calls, the recordings, the notes and the stage. Nothing is copied between tools." flush>
        <Steps items={FIT} />
        <div className="border-t border-white-800 px-5 py-8 md:px-10">
          <CtaPair location="features_mid" size="default" />
        </div>
      </Section>

      <section className="rail">
        <div className="grid md:grid-cols-2">
          <div className="border-b border-white-800 px-5 py-14 md:border-b-0 md:border-r md:px-10 md:py-20">
            <Reveal>
              <p className="eyebrow">[ Pricing ]</p>
              <h2 className="t-h1 mt-4 text-black-400">Every feature, one plan.</h2>
              <p className="mt-4 text-md leading-[26px] text-black-700">
                {PRO.name} is £{PRO.monthly} per seat per month, or £{PRO.annual} per seat per year (save {ANNUAL_SAVING_PCT}%). Prices exclude VAT. There
                are no feature tiers: every seat gets everything on this page.
              </p>
              <Link href="/#pricing" className="link mt-6 inline-block text-base">
                See pricing
              </Link>
            </Reveal>
          </div>
          <div className="px-5 py-14 md:px-10 md:py-20">
            <Reveal delay={100}>
              <Checklist items={PRO_FEATURES} />
              <p className="mt-5 tabular-nums text-xs leading-[17px] tracking-[0.06em] text-faint">
                {FAIR_USE_NOTE}{' '}
                <Link href="/fair-use" className="link">
                  Fair use policy
                </Link>
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      <Related
        links={[
          { href: '/compliance', label: 'Compliance', blurb: 'TPS, CTPS, GDPR and recording rules' },
          { href: '/integrations', label: 'Integrations', blurb: 'CRMs, Zapier, webhooks and CSV' },
          { href: '/industries/b2b-sales', label: 'For B2B sales teams', blurb: 'SDR and AE teams booking meetings' },
        ]}
      />
      <CtaStrip location="features" note={DATA_FOOTNOTE} />
    </>
  );
}

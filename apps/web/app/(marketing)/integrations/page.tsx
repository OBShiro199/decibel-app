import type { Metadata } from 'next';
import Image from 'next/image';
import { AsciiBox, CtaStrip, JsonLd, PageHero, Related, Section, Steps } from '@/components/marketing/page-kit';
import { CtaLink } from '@/components/marketing/analytics';
import { Reveal } from '@/components/marketing/daygent';
import { CRM_TOOLS } from '@/lib/integrations-data';
import { SITE_URL } from '@/lib/site';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Integrations',
  description: 'Native integrations with Salesforce, HubSpot, Pipedrive and 13 more CRMs are coming soon. Until then, export your contacts and call history from Decibel by CSV.',
  alternates: { canonical: '/integrations' },
};

const REQUEST_HREF = 'mailto:oliver@usedecibel.com?subject=Integration%20request';

const OTHER: { name: string; body: string; live: boolean; glyph: string }[] = [
  { name: 'CSV export', body: 'Export contacts and call history, with outcomes and notes, then import them into any CRM or spreadsheet.', live: true, glyph: '.csv' },
  { name: 'Zapier', body: 'Send new outcomes and meetings booked to the thousands of apps Zapier connects to.', live: false, glyph: '{z}' },
  { name: 'Webhooks', body: 'Post call and outcome events to your own endpoint as they happen.', live: false, glyph: '-->' },
  { name: 'API', body: 'Read and write contacts, lists and calls from your own code.', live: false, glyph: '</>' },
];

function Pill({ live, children }: { live?: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center rounded-[4px] border px-2 tabular-nums text-xs tracking-[0.02em]',
        live ? 'border-white-800 bg-success-100 text-success-700' : 'border-white-800 bg-white-200 text-black-700',
      )}
    >
      {children}
    </span>
  );
}

export default function IntegrationsPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: 'Integrations',
          url: `${SITE_URL}/integrations`,
          description: 'CRM integrations coming soon to Decibel, and the ways to move data in and out today.',
        }}
      />

      <PageHero
        eyebrow="Integrations"
        title="Your CRM, connected soon. CSV export today."
        lede="Native integrations with the CRMs below are on the way. None of them are live yet. Until they are, export your contacts and call history, with outcomes and notes, by CSV, and import your own lists the same way."
        location="integrations"
        corners={[`${CRM_TOOLS.length} CRMs`, 'CSV available now']}
      >
        <div className="flex justify-center">
          <AsciiBox lines={['decibel  ──csv──▶  your crm      available now', 'decibel  ──api──▶  your crm      coming soon']} className="max-sm:hidden" />
        </div>
      </PageHero>

      {/* CRM grid */}
      <Section
        eyebrow="CRM"
        title="The CRMs we are building for."
        lede="Listed roughly by how widely each is used. Every one is coming soon; none is connected yet. Tell us which you use and it helps decide the order."
        flush
      >
        <ul className="grid border-t border-white-800 sm:grid-cols-2 lg:grid-cols-4" aria-label="CRM integrations, all coming soon">
          {CRM_TOOLS.map((t, i) => (
            <li key={t.id} className="border-b border-white-800 sm:border-r">
              <Reveal delay={(i % 4) * 60} className="flex h-full flex-col justify-between gap-6 px-5 py-6 md:px-6">
                <span className="flex items-start justify-between gap-3">
                  <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-[6px] border border-white-800 bg-white-100">
                    <Image src={`/integrations/${t.id}.webp`} alt={`${t.name} logo`} width={28} height={28} className="h-7 w-7 object-contain" />
                  </span>
                  <Pill>Coming soon</Pill>
                </span>
                <span className="block min-w-0">
                  <span className="block text-md font-medium tracking-[-0.02em] text-black-400">{t.name}</span>
                  <span className="mt-0.5 block text-base text-black-700">{t.tagline}</span>
                </span>
              </Reveal>
            </li>
          ))}
        </ul>
        <p className="px-5 py-5 tabular-nums text-xs leading-[17px] tracking-[0.06em] text-faint md:px-10">
          Logos and product names are trademarks of their respective owners, shown only to identify each tool. Their appearance here does not imply a partnership or
          endorsement.
        </p>
      </Section>

      {/* don't see your tool */}
      <section className="rail">
        <div className="grid md:grid-cols-[1fr_1.4fr]">
          <div className="border-b border-white-800 px-5 py-14 md:border-b-0 md:border-r md:px-10 md:py-20">
            <Reveal>
              <p className="eyebrow">[ Don&apos;t see your tool? ]</p>
              <h2 className="t-h1 mt-4 text-black-400">Tell us what you use.</h2>
              <p className="mt-4 text-md leading-[26px] text-black-700">
                Integration requests go straight to the founder and help decide what gets built next. Until then, CSV moves your data in and out of Decibel.
              </p>
              <CtaLink location="integrations_request" href={REQUEST_HREF} variant="primary" size="lg" className="mt-8">
                Request an integration
              </CtaLink>
            </Reveal>
          </div>
          <div>
            {OTHER.map((o, i) => (
              <Reveal key={o.name} delay={i * 70} className={cn(i < OTHER.length - 1 && 'border-b border-white-800')}>
                <div className="flex items-start gap-4 px-5 py-6 md:px-8">
                  <span aria-hidden className="w-10 shrink-0 select-none pt-0.5 tabular-nums text-xs text-white-900">
                    {o.glyph}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-md font-medium tracking-[-0.02em] text-black-400">{o.name}</span>
                      <Pill live={o.live}>{o.live ? 'Available now' : 'Coming soon'}</Pill>
                    </span>
                    <span className="mt-1 block text-base leading-[23px] text-black-700">{o.body}</span>
                  </span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Section eyebrow="Today" title="Moving data with CSV." lede="It takes a couple of minutes and works with any CRM that imports a spreadsheet." flush>
        <Steps
          items={[
            ['Import your own list', 'Upload a CSV of contacts. Duplicates against what you already have are removed, and every row is screened against TPS and CTPS.'],
            ['Call and log outcomes', 'Work the list with the power dialler. Outcomes and notes are saved on each call, and pipeline stages move as you go.'],
            ['Export to your CRM', 'Export contacts and call history as CSV and import the files into your CRM or spreadsheet.'],
          ]}
        />
      </Section>

      <Related
        links={[
          { href: '/features/pipeline', label: 'Lists and pipeline', blurb: 'Outcomes move deals on their own' },
          { href: '/features/power-dialler', label: 'Power dialler', blurb: 'Call down a list from your browser' },
          { href: '/compliance', label: 'Compliance', blurb: 'TPS, CTPS, GDPR and recording rules' },
        ]}
      />
      <CtaStrip location="integrations" title="Start calling now. Connect your CRM when it lands." />
    </>
  );
}

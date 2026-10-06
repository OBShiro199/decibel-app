import type { Metadata } from 'next';
import Link from 'next/link';
import { Console, Reveal, Status } from '@/components/marketing/daygent';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import {
  ASCII_FONT,
  AsciiBox,
  Checklist,
  CtaPair,
  CtaStrip,
  DATA_FOOTNOTE,
  FeatureGrid,
  JsonLd,
  PageHero,
  Related,
  Section,
  Split,
} from '@/components/marketing/page-kit';
import { COUNTRIES, PRO, TRIAL_CREDITS } from '@/lib/constants';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Verified UK and EU mobile numbers for decision makers',
  description:
    'Search UK and EU decision makers by title, seniority, company size, industry and country, then reveal the mobile for one credit. Revealed contacts stay free.',
  alternates: { canonical: '/features/verified-mobiles' },
};

const RESULTS: { name: string; title: string; company: string; country: string; mobile: string; revealed: boolean }[] = [
  { name: 'Aisling Doherty', title: 'CEO', company: 'Brightmoor Software', country: 'GB', mobile: '+44 7700 900117', revealed: true },
  { name: 'Rahul Mehta', title: 'CTO', company: 'Northgate Logistics', country: 'GB', mobile: '+44 7700 900109', revealed: true },
  { name: 'Charlotte Nkemelu', title: 'Commercial Director', company: 'Harrow & Finch', country: 'GB', mobile: '+44 7700 900108', revealed: false },
  { name: 'Andrew Patel', title: 'VP Operations', company: 'Pennine Precision', country: 'GB', mobile: '+44 7700 900114', revealed: false },
  { name: 'Emily Chen', title: 'Head of Partnerships', company: 'Cobalt Digital', country: 'GB', mobile: '+44 7700 900111', revealed: false },
];

const FILTERS = ['Title: Head of Sales, Sales Director', 'Seniority: Director+', 'Size: 51–200', 'Industry: Software', 'Country: UK, Ireland'];

function SearchMock() {
  return (
    <Console file="search.results" right={<Status>TPS checked on dial</Status>}>
      <div className="flex flex-wrap gap-2 border-b border-rule px-4 py-3">
        {FILTERS.map((f) => (
          <span key={f} className="inline-flex h-7 items-center rounded-[4px] border border-white-800 bg-white-100 px-2.5 text-xs tracking-[0.02em] text-black-500">
            {f}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-left tabular-nums text-xs text-black-700">
          <caption className="sr-only">Sample search results (fictional people)</caption>
          <thead>
            <tr className="border-b border-rule">
              {['Person', 'Company', 'Country', 'Mobile'].map((h) => (
                <th key={h} className="h-9 px-4 font-normal tracking-[0.06em] text-faint">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {RESULTS.map((r) => (
              <tr key={r.name} className="border-b border-rule last:border-b-0">
                <td className="px-4 py-3">
                  <span className="block whitespace-nowrap font-sans text-sm font-medium text-black-400">{r.name}</span>
                  <span className="block whitespace-nowrap text-white-900">{r.title}</span>
                </td>
                <td className="whitespace-nowrap px-4 py-3">{r.company}</td>
                <td className="whitespace-nowrap px-4 py-3">{r.country}</td>
                <td className="whitespace-nowrap px-4 py-3">
                  {r.revealed ? (
                    <span className="text-black-400">
                      {r.mobile} <span className="text-success-500">✓</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-3">
                      <span className="text-faint">+44 7••• ••••{r.mobile.slice(-2)}</span>
                      <span className="inline-flex h-6 items-center rounded-[4px] border border-white-800 px-2 text-black-400">Reveal · 1 credit</span>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="border-t border-rule px-4 py-2.5 tabular-nums text-xs text-faint">
        Sample data · 2 revealed · <span className="text-black-400">4,998</span> credits left
      </p>
    </Console>
  );
}

const SEARCH = [
  { tag: 'Title', title: 'Job title', body: 'Type the titles you sell to, such as Head of Sales or Finance Director.' },
  { tag: 'Seniority', title: 'Seniority', body: 'C-level, owner or founder, VP, director, manager or individual contributor.' },
  { tag: 'Size', title: 'Company size', body: 'Headcount bands from 1–10 up to 5,001+, so you only see companies that fit.' },
  { tag: 'Industry', title: 'Industry', body: 'Narrow to the sectors where your product already wins.' },
  { tag: 'Country', title: 'Country', body: `${COUNTRIES.length} UK and EU markets, from the United Kingdom and Ireland to DACH, Benelux and the Nordics.` },
  { tag: 'Lists', title: 'Straight into a list', body: 'Select the matches and add them to a list. Mobiles are revealed as they are added.' },
];

const LEDGER = [
  'reveal   Rahul Mehta        -1   4,999',
  'reveal   Aisling Doherty    -1   4,998',
  'view     Rahul Mehta         0   4,998',
  'view     (teammate)          0   4,998',
];

const FAQS: FaqItem[] = [
  {
    question: 'What counts as a credit?',
    answer: `One credit reveals one mobile. ${PRO.name} includes ${PRO.credits.toLocaleString('en-GB')} reveals per seat every month and the free trial includes ${TRIAL_CREDITS.toLocaleString('en-GB')}. Searching and browsing results is free.`,
  },
  {
    question: 'Do I pay again if a teammate opens the same contact?',
    answer: 'No. Once anyone in your workspace has revealed a contact it stays free for the whole workspace.',
  },
  {
    question: 'How big is the database today?',
    answer:
      '1M+ verified mobiles is our launch target, not a current count. The product ships with clearly labelled sample data while licensed UK and EU sources are onboarded. You can import your own lists from day one.',
  },
  {
    question: 'Can I call every number I reveal?',
    answer:
      'Every dial is screened against the TPS and CTPS registers and your workspace do-not-call list. If a number is listed, the call is blocked and the rep sees why. Germany and Austria are flagged in the product because their rules on business cold calls are stricter than the UK’s.',
  },
];

export default function VerifiedMobilesPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: FAQS.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
        }}
      />
      <PageHero
        eyebrow="Verified mobiles"
        location="verified_mobiles_hero"
        corners={['1 credit = 1 reveal', '1M+ verified mobiles*']}
        title="Direct mobiles for UK and EU decision makers."
        lede="Search by title, seniority, company size, industry and country. Reveal the mobile for one credit and call it from your browser, with TPS and CTPS screening on every dial."
      >
        <SearchMock />
      </PageHero>

      <Section eyebrow="Search" title="Filter down to the people who buy." lede="Build an ideal customer profile once and save it as a list. Results show who the person is before you spend anything." flush>
        <FeatureGrid items={SEARCH} />
      </Section>

      <Split
        visual={
          <div className="flex h-full flex-col justify-center px-5 py-10 md:px-10">
            <p className="tabular-nums text-xs tracking-[0.06em] text-faint">[ Credit ledger ]</p>
            <pre aria-hidden className="mt-4 select-none overflow-hidden whitespace-pre text-[12px] leading-[22px] text-black-700" style={{ fontFamily: ASCII_FONT }}>
              {LEDGER.map((l, i) => (
                <span key={i} className={cn('block', l.includes(' 0 ') && 'text-faint')}>
                  {l}
                </span>
              ))}
            </pre>
            <p className="mt-4 text-sm text-black-700">Each reveal is written once to an append-only ledger. Viewing a revealed contact never costs again.</p>
          </div>
        }
      >
        <Reveal>
          <p className="eyebrow">[ Credits ]</p>
          <h2 className="t-h1 mt-4 text-black-400">One credit, one mobile, yours to keep.</h2>
          <p className="mt-4 text-md leading-[26px] text-black-700">
            A credit is spent only when you reveal a mobile. After that the contact stays free for your whole workspace, so a manager reviewing a list or a
            teammate picking up a callback never pays twice.
          </p>
          <Checklist
            className="mt-8"
            items={[
              `${PRO.credits.toLocaleString('en-GB')} reveals per seat, every month, on ${PRO.name}`,
              `${TRIAL_CREDITS.toLocaleString('en-GB')} credits in the 14-day free trial, no card`,
              'Searching and browsing results is free',
              'Revealed contacts stay free for the workspace',
            ]}
          />
        </Reveal>
      </Split>

      <Section
        eyebrow="Verified"
        title="What verified means here."
        lede="A number is shown as verified only after it passes checks on format, line type and network status. Screening against TPS and CTPS happens again on every dial."
      >
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <Reveal>
            <Checklist
              items={[
                'Number format checked for the country it belongs to',
                'Line type checked, so a landline is not sold as a mobile',
                'Network checks confirm the number is in service where the country allows it',
                'TPS and CTPS checked server-side on every dial, not once at import',
                'Wrong numbers flagged by reps go back for re-checking',
              ]}
            />
            <Link href="/data-quality" className="link mt-6 inline-block text-base">
              How data quality works
            </Link>
          </Reveal>
          <Reveal delay={120} className="max-md:hidden">
            <AsciiBox lines={['format     ✓', 'line type  ✓ mobile', 'network    ✓ in service', 'TPS/CTPS   ✓ on dial']} />
          </Reveal>
        </div>
      </Section>

      <Section eyebrow="Coverage" title="Built for the UK, ready for Europe." lede="Search across the UK and EU markets below. Calling rules differ by country, so the product tells you where they are stricter.">
        <Reveal>
          <ul className="flex flex-wrap gap-2">
            {COUNTRIES.map((c) => (
              <li
                key={c.code}
                className={cn(
                  'inline-flex h-8 items-center gap-2 rounded-[4px] border bg-white-100 px-3 text-sm',
                  c.warning ? 'border-warning-500 text-black-400' : 'border-white-800 text-black-500',
                )}
              >
                <span className="tabular-nums text-xs tracking-[0.06em] text-faint">{c.code}</span>
                {c.name}
                {c.warning ? <span className="tabular-nums text-xs text-warning-700">stricter rules</span> : null}
              </li>
            ))}
          </ul>
          <p className="mt-6 max-w-[640px] text-base leading-[24px] text-black-700">
            Germany and Austria require stronger grounds before a cold call to a business, so contacts there carry a warning. This is product guidance,
            not legal advice.
          </p>
          <CtaPair location="verified_mobiles_mid" size="default" className="mt-8" />
        </Reveal>
      </Section>

      <section className="rail px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          <Reveal>
            <p className="eyebrow">[ FAQ ]</p>
            <h2 className="t-h1 mt-4 text-black-400">Questions about the data.</h2>
          </Reveal>
          <Faq items={FAQS} />
        </div>
      </section>

      <Related
        links={[
          { href: '/features/power-dialler', label: 'Power dialler', blurb: 'Call down a list from your browser' },
          { href: '/data-quality', label: 'Data quality', blurb: 'How every number is checked' },
          { href: '/compliance', label: 'Compliance', blurb: 'TPS, CTPS, GDPR and recording rules' },
        ]}
      />
      <CtaStrip location="verified_mobiles" note={DATA_FOOTNOTE} />
    </>
  );
}

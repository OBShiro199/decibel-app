import type { Metadata } from 'next';
import Link from 'next/link';
import { ASCII_FONT, CtaStrip, FeatureGrid, JsonLd, PageHero, Related, Section, SectionHead, Split, Steps, type Feature } from '@/components/marketing/page-kit';
import { AsciiCanvas, Reveal, Status } from '@/components/marketing/daygent';
import { CompliancePills } from '@/components/marketing/compliance-pills';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { FAIR_USE_NOTE, PRO } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Outbound calling for IT and MSP sales teams',
  description: 'For MSPs, IT resellers and cloud, telecoms and cyber partners: find IT managers and CTOs by title and company size, list local SMBs and call from the browser.',
  alternates: { canonical: '/industries/it-infrastructure' },
};

const PAINS: [string, string][] = [
  ['The buyer is hard to pin down', 'IT decisions sit with an IT manager, a head of infrastructure or the CTO, depending on the size of the business. The switchboard rarely helps.'],
  ['Lists ignore company size', 'A managed service for 50 staff and a cloud migration for 2,000 need different call lists. Generic data mixes them together.'],
  ['Local SMBs are missing', 'The small firms in your patch often are not in B2B databases at all, so reps end up copying numbers from map searches.'],
  ['Renewal windows slip by', 'Connectivity, licences and support contracts renew on a cycle. If nobody calls before the date, the incumbent rolls over or a competitor gets in.'],
];

const HELPS: Feature[] = [
  { tag: 'Titles', title: 'Find the person who signs', body: 'Search UK and EU decision makers by title and seniority: IT manager, head of infrastructure, IT director, CTO.' },
  { tag: 'Size', title: 'Filter by company size', body: 'Size bands from 1–10 to 5,001+, plus industry and country, so each list matches the service you are selling.' },
  { tag: 'Local', title: 'Local businesses tab', body: 'Map-style listings with ratings, reviews, opening hours, website and phone numbers for the SMBs in your area.' },
  { tag: 'Campaigns', title: 'Renewal-cycle call lists', body: 'Import the accounts coming up for renewal by CSV, or build a fresh list, and work it with the power dialler.' },
  { tag: 'Follow-ups', title: 'Call backs that come back', body: 'Log a call back on key 8 and the follow-up lands in the Today queue, so the second conversation happens on time.' },
  { tag: 'Recording', title: 'Technical calls on record', body: 'Every call is recorded and kept for a year on the call record, useful when a pre-sales engineer joins the deal later.' },
];

const DAY: [string, string][] = [
  ['Pick the window', 'Import the customers and prospects whose contracts end next quarter, or build a list of IT managers at companies of 51–200 staff.'],
  ['Add the local patch', 'Open Local businesses, search a category and area, and add listings that have a phone number and website to the same list.'],
  ['Run the power dialler', 'Each number is screened against TPS, CTPS and your do-not-call list before it rings. The run resumes where you stopped.'],
  ['Log the outcome', 'Meeting booked moves the deal to the next stage; call back creates a follow-up; do not call adds the number to your list.'],
  ['Start tomorrow with Today', 'Due callbacks and follow-ups are waiting in the Today queue before you start a new list.'],
];

const FAQS: FaqItem[] = [
  {
    question: 'Can I find IT decision makers at a specific company size?',
    answer: 'Yes. Filter by job title and seniority, then by company size band (1–10 up to 5,001+), industry and country. Save the result as a list and call down it.',
  },
  {
    question: 'Can I call local businesses rather than named contacts?',
    answer:
      'Yes. The Local businesses tab shows map-style listings with ratings, reviews, opening hours, website and phone number. Add them to a list and dial them the same way, with the same TPS and CTPS screening.',
  },
  {
    question: 'Does Decibel connect to our CRM or PSA tool?',
    answer:
      'Native CRM integrations are coming soon and there is no PSA integration today. You can export contacts, outcomes and lists by CSV now, and import your existing customer list by CSV.',
  },
  {
    question: 'Where does the contact data come from?',
    answer:
      'At launch the database contains sample data, clearly labelled as such in the product, while we onboard licensed UK and EU data sources. You can import your own lists from day one.',
  },
  {
    question: 'Can we call prospects outside the UK?',
    answer:
      'Search covers the UK and EU. Rules for business calls differ by country and some, such as Germany and Austria, are stricter than the UK; Decibel flags those markets. This is not legal advice.',
  },
];

const PEOPLE: [string, string, string][] = [
  ['IT manager', '51–200', '#1d9d5b'],
  ['Head of infrastructure', '201–500', '#2f6bff'],
  ['CTO', '51–200', '#1d9d5b'],
];
const LOCAL: [string, string, string][] = [
  ['Accountancy practice', '4.8 · 62 reviews', 'Open until 17:30'],
  ['Dental clinic', '4.6 · 118 reviews', 'Open until 18:00'],
  ['Solicitors', '4.9 · 41 reviews', 'Open until 17:00'],
];

function SourcesMock() {
  return (
    <div className="mx-auto grid max-w-[860px] overflow-hidden rounded-[6px] border border-white-800 bg-white-100 text-left md:grid-cols-2">
      <div className="border-b border-white-800 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between gap-3 border-b border-white-800 px-4 py-2.5">
          <span className="tabular-nums text-xs tracking-[0.06em] text-faint">people / it decision makers</span>
          <span className="tabular-nums text-xs tracking-[0.06em] text-faint">GB</span>
        </div>
        {PEOPLE.map(([title, size, color]) => (
          <div key={title} className="flex items-center justify-between gap-3 border-b border-white-800 px-4 py-3 last:border-b-0">
            <span className="flex items-center gap-2 text-base text-black-400">
              <span className="pulse-dot" style={{ background: color, width: 6, height: 6 }} aria-hidden />
              {title}
            </span>
            <span className="tabular-nums text-sm text-black-700">{size} staff</span>
          </div>
        ))}
      </div>
      <div>
        <div className="flex items-center justify-between gap-3 border-b border-white-800 px-4 py-2.5">
          <span className="tabular-nums text-xs tracking-[0.06em] text-faint">local businesses / leeds</span>
          <Status color="#2f6bff">3 with numbers</Status>
        </div>
        {LOCAL.map(([name, rating, hours]) => (
          <div key={name} className="flex items-center justify-between gap-3 border-b border-white-800 px-4 py-3 last:border-b-0">
            <span className="min-w-0">
              <span className="block truncate text-base text-black-400">{name}</span>
              <span className="block tabular-nums text-xs tracking-[0.06em] text-faint">★ {rating}</span>
            </span>
            <span className="shrink-0 text-sm text-black-700">{hours}</span>
          </div>
        ))}
      </div>
      <p className="border-t border-white-800 px-4 py-2 tabular-nums text-xs tracking-[0.06em] text-faint md:col-span-2">Sample rows for illustration</p>
    </div>
  );
}

function PainGrid({ items }: { items: [string, string][] }) {
  return (
    <div className="grid border-t border-white-800 sm:grid-cols-2 lg:grid-cols-4">
      {items.map(([title, body], i) => (
        <Reveal key={title} delay={i * 80} className="border-b border-white-800 px-5 py-7 sm:border-r md:px-8">
          <p className="tabular-nums text-xs tracking-[0.06em] text-faint">— {String(i + 1).padStart(2, '0')}</p>
          <h3 className="mt-3 text-md font-medium tracking-[-0.02em] text-black-400">{title}</h3>
          <p className="mt-1.5 text-base leading-[23px] text-black-700">{body}</p>
        </Reveal>
      ))}
    </div>
  );
}

export default function ItInfrastructurePage() {
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
        eyebrow="IT and infrastructure"
        title="Reach the people who run the infrastructure."
        lede="For MSPs, IT resellers and cloud, telecoms and cyber partners. Find IT managers, CTOs and heads of infrastructure by title and company size, add the SMBs in your area, and call them all from the browser."
        location="industry_it"
        corners={['MSP + VAR', 'TPS screened']}
      >
        <SourcesMock />
      </PageHero>

      <Section eyebrow="What slows teams down" title="Selling IT by phone has its own friction." flush>
        <PainGrid items={PAINS} />
      </Section>

      <Section
        eyebrow="How Decibel helps"
        title="Two ways to build a list, one way to call it."
        lede={
          <>
            Named decision makers from the database, local businesses from the{' '}
            <Link href="/local-businesses" className="link">
              Local businesses
            </Link>{' '}
            tab. Both are included in {PRO.name}, £{PRO.monthly} per seat per month.
          </>
        }
        flush
      >
        <FeatureGrid items={HELPS} />
      </Section>

      <Section eyebrow="A renewal campaign" title="One quarter’s renewals, worked end to end." lede="An example workflow for an MSP or reseller. Swap in your own windows and services." flush>
        <Steps items={DAY} />
      </Section>

      <Split
        reverse
        visual={
          <>
            <AsciiCanvas scene="signal" color="#c4c4bf" intensity={0.7} />
            <span className="absolute bottom-4 right-4 tabular-nums text-xs tracking-[0.06em] text-faint">[ data hosted in London ]</span>
          </>
        }
      >
        <SectionHead eyebrow="Compliance" title="Screened before it rings.">
          Plenty of business lines and sole traders are registered with TPS or CTPS. Decibel checks both registers, and your workspace do-not-call list, on the
          server before every dial, including numbers from Local businesses and your own CSV imports. A caller ID is always presented and a recording notice
          plays on answer.
        </SectionHead>
        <CompliancePills className="mt-6" />
        <Link href="/compliance" className="link mt-6 inline-block text-base">
          How compliance works
        </Link>
      </Split>

      <section className="rail px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          <div>
            <SectionHead eyebrow="FAQ" title="Questions from IT partners." />
            <pre aria-hidden className="mt-8 select-none text-[12px] leading-[17px] text-white-900 max-md:hidden" style={{ fontFamily: ASCII_FONT }}>
              {'size  1-10      ▏\n      11-50     ▎\n      51-200    ▍\n      201-500   ▌\n      501-1000  ▋\n      1001-5000 ▊\n      5001+     █'}
            </pre>
          </div>
          <Faq items={FAQS} />
        </div>
      </section>

      <Related
        links={[
          { href: '/local-businesses', label: 'Local businesses', blurb: 'Map listings with ratings, hours and numbers' },
          { href: '/features/power-dialler', label: 'Power dialler', blurb: 'Call down a list from your browser' },
          { href: '/compliance', label: 'Compliance', blurb: 'TPS, CTPS, GDPR and recording rules' },
        ]}
      />
      <CtaStrip location="industry_it" title="Call your next renewal list from the browser." note={FAIR_USE_NOTE} />
    </>
  );
}

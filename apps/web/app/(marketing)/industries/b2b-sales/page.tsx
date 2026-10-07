import type { Metadata } from 'next';
import Link from 'next/link';
import { ASCII_FONT, CtaStrip, DATA_FOOTNOTE, FeatureGrid, JsonLd, PageHero, Related, Section, SectionHead, Split, Steps, type Feature } from '@/components/marketing/page-kit';
import { AsciiCanvas, Reveal, Status } from '@/components/marketing/daygent';
import { CompliancePills } from '@/components/marketing/compliance-pills';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { FAIR_USE_NOTE, PRO } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Power dialler and mobile data for B2B sales',
  description: 'For SDR and AE teams: build lists by title, seniority and company size, call down them with a power dialler, and let every outcome update your pipeline.',
  alternates: { canonical: '/industries/b2b-sales' },
};

const PAINS: [string, string][] = [
  ['Lists take longer than calls', 'Reps spend the morning in a data tool, exporting, cleaning and re-importing before the first dial.'],
  ['Dialling by hand', 'Copying numbers into a desk phone or a separate app caps how many conversations a rep can have in an hour.'],
  ['Outcomes go missing', 'If logging a call means three clicks in a CRM, it happens at the end of the day, or not at all.'],
  ['Managers coach blind', 'Without recordings and per-rep numbers, a one-to-one is built on memory rather than the calls themselves.'],
];

const HELPS: Feature[] = [
  { tag: 'Lists', title: 'Build a list in minutes', body: 'Search UK and EU decision makers by title, seniority, company size, industry and country, then add the matches to a list.' },
  { tag: 'Reveals', title: '5,000 mobile reveals a seat', body: 'One credit reveals one verified mobile. Contacts you have revealed stay free for your workspace.' },
  { tag: 'Dialler', title: 'A power dialler in the browser', body: 'Call down the list from Chrome with a UK number per seat. The dialler remembers where you stopped and resumes the run.' },
  { tag: 'Outcomes', title: 'Nine outcomes on keys 1 to 9', body: 'Log the call with one key. The pipeline stage moves and a follow-up is created when the outcome needs one.' },
  { tag: 'Dashboards', title: 'Per-rep dashboards', body: 'Calls, connects and meetings booked per rep, so managers can see the week without asking for a spreadsheet.' },
  { tag: 'Review', title: 'Every call recorded', body: 'Recordings sit on the call record and are kept for a year, ready for coaching and call review.' },
];

const DAY: [string, string][] = [
  ['09:00 · Open Today', 'The Today queue lists the callbacks and follow-ups that are due, so the first calls of the day are the warmest ones.'],
  ['09:30 · Build the next list', 'Filter by title, seniority and company size, reveal the mobiles you need and add them to a list for the afternoon.'],
  ['10:00 · Start a power dialler run', 'Decibel screens each number against TPS, CTPS and your do-not-call list, then dials. Notes autosave as you talk.'],
  ['10:01 · Log and move on', 'Press 1 to 9 for the outcome. A meeting booked moves the deal on; a call back lands in tomorrow’s Today queue.'],
  ['16:30 · Review', 'Managers check the per-rep dashboard and play back a few recordings for the next one-to-one.'],
];

const FAQS: FaqItem[] = [
  {
    question: 'How many calls can a rep make?',
    answer: `Calls from the browser dialler are unlimited, subject to fair use of 1,000 minutes per seat per month, then minutes at cost. The power dialler places one call at a time with a rep on every call; there is no predictive dialling.`,
  },
  {
    question: 'Where does the contact data come from?',
    answer:
      'At launch the database contains sample data, clearly labelled as such in the product, while we onboard licensed UK and EU data sources. You can import your own lists by CSV from day one, and every row is screened against TPS and CTPS the same way.',
  },
  {
    question: 'Does it replace our CRM?',
    answer:
      'For many small teams it can: Decibel has lists, a pipeline, notes, outcomes and follow-ups. If you already run a CRM, native integrations are coming soon; today you can export contacts and outcomes by CSV.',
  },
  {
    question: 'Can managers listen to calls?',
    answer: 'Every call is recorded and the recording sits on the call record for a year. The person you call hears a recording notice when they answer, depending on your workspace setting.',
  },
  {
    question: 'How do we try it?',
    answer: 'Start a 14-day free trial with one seat, 5,000 credits and 60 minutes of calling, no card needed. Or book a 15-minute demo and we will walk through it on your own target list.',
  },
];

const FILTERS = ['Title: sales leadership', 'Seniority: Director, VP', 'Size: 51–200', 'Country: United Kingdom'];
const ROWS: [string, string, string, string, string][] = [
  ['Head of sales', '51–200', 'Manchester', 'Meeting booked', '#1d9d5b'],
  ['Sales director', '51–200', 'London', 'Call back', '#2f6bff'],
  ['VP sales', '51–200', 'Leeds', 'No answer', '#a3a39e'],
  ['Head of revenue', '51–200', 'Bristol', 'TPS clear', '#1d9d5b'],
];

function ListMock() {
  return (
    <div className="mx-auto max-w-[760px] overflow-hidden rounded-[6px] border border-white-800 bg-white-100 text-left">
      <div className="flex items-center justify-between gap-3 border-b border-white-800 px-4 py-2.5">
        <span className="truncate tabular-nums text-xs tracking-[0.06em] text-faint">list / heads-of-sales-uk</span>
        <Status>Run resumes at row 37</Status>
      </div>
      <div className="flex flex-wrap gap-2 border-b border-white-800 px-4 py-3">
        {FILTERS.map((f) => (
          <span key={f} className="inline-flex h-7 items-center rounded-[4px] border border-white-800 bg-white-200 px-2.5 text-[13px] text-black-500">
            {f}
          </span>
        ))}
      </div>
      {ROWS.map(([title, size, place, state, color]) => (
        <div key={title} className="grid grid-cols-[1fr_auto] items-center gap-3 border-b border-white-800 px-4 py-3 sm:grid-cols-[1.4fr_0.8fr_1fr_1fr]">
          <span className="text-base text-black-400">{title}</span>
          <span className="tabular-nums text-sm text-black-700 max-sm:hidden">{size}</span>
          <span className="text-sm text-black-700 max-sm:hidden">{place}</span>
          <span className="justify-self-end sm:justify-self-start">
            <Status color={color}>{state}</Status>
          </span>
        </div>
      ))}
      <p className="px-4 py-2 tabular-nums text-xs tracking-[0.06em] text-faint">Sample rows for illustration</p>
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

export default function B2bSalesPage() {
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
        eyebrow="B2B sales"
        title="More conversations per rep, fewer tabs."
        lede="For SDR and AE teams who book meetings by phone. Build a list by title, seniority and company size, call down it from the browser and let every outcome move your pipeline."
        location="industry_b2b_sales"
        corners={['SDR + AE', '1M+ verified mobiles*']}
      >
        <ListMock />
      </PageHero>

      <Section eyebrow="What slows teams down" title="Most of the day is not spent talking." flush>
        <PainGrid items={PAINS} />
      </Section>

      <Section eyebrow="How Decibel helps" title="Search, dial and log in one place." lede={`Everything below is included in ${PRO.name}, £${PRO.monthly} per seat per month.`} flush>
        <FeatureGrid items={HELPS} />
      </Section>

      <Section eyebrow="A typical day" title="What a day on Decibel looks like." lede="An example rhythm for an SDR. Your team’s will differ; the tools stay the same." flush>
        <Steps items={DAY} />
      </Section>

      <Split
        visual={
          <>
            <AsciiCanvas scene="radar" color="#c4c4bf" intensity={0.7} />
            <span className="absolute left-4 top-4">
              <Status color="#2f6bff">Checking TPS</Status>
            </span>
          </>
        }
      >
        <SectionHead eyebrow="Compliance" title="The rules run on every dial.">
          B2B cold calling is lawful in the UK when you screen against TPS and CTPS and honour opt-outs. Decibel checks both registers and your workspace
          do-not-call list on the server before every call, plays a recording notice on answer and always presents a caller ID that can be rung back.
        </SectionHead>
        <CompliancePills className="mt-6" />
        <Link href="/compliance" className="link mt-6 inline-block text-base">
          How compliance works
        </Link>
      </Split>

      <section className="rail px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          <div>
            <SectionHead eyebrow="FAQ" title="Questions from sales teams." />
            <pre aria-hidden className="mt-8 select-none text-[12px] leading-[17px] text-white-900 max-md:hidden" style={{ fontFamily: ASCII_FONT }}>
              {'1 connected     6 meeting booked\n2 no answer     7 not interested\n3 voicemail     8 call back\n4 busy          9 do not call\n5 wrong number'}
            </pre>
          </div>
          <Faq items={FAQS} />
        </div>
      </section>

      <Related
        links={[
          { href: '/features/power-dialler', label: 'Power dialler', blurb: 'Call down a list from your browser' },
          { href: '/features/pipeline', label: 'Lists and pipeline', blurb: 'Outcomes move deals on their own' },
          { href: '/features/call-recording', label: 'Call recording', blurb: 'Every call recorded, with the notice handled' },
        ]}
      />
      <CtaStrip location="industry_b2b_sales" title="Put your reps on the phone this week." note={<>{DATA_FOOTNOTE} {FAIR_USE_NOTE}</>} />
    </>
  );
}

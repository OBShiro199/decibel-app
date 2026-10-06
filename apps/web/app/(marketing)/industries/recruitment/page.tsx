import type { Metadata } from 'next';
import Link from 'next/link';
import { ASCII_FONT, Checklist, CtaStrip, FeatureGrid, JsonLd, PageHero, Related, Section, SectionHead, Steps, type Feature } from '@/components/marketing/page-kit';
import { AsciiCanvas, Reveal, Status } from '@/components/marketing/daygent';
import { CompliancePills } from '@/components/marketing/compliance-pills';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { FAIR_USE_NOTE, PRO } from '@/lib/constants';

export const metadata: Metadata = {
  title: 'Decibel for recruitment agencies',
  description: 'For recruitment consultants doing business development: find hiring managers by title and company size, call from the browser and record calls for training.',
  alternates: { canonical: '/industries/recruitment' },
};

const PAINS: [string, string][] = [
  ['Hiring managers are hard to reach', 'Switchboards and generic inboxes stand between you and the head of department who owns the vacancy.'],
  ['Speed wins instructions', 'When a role opens, the first agency to have a useful conversation with the hiring manager is often the one that gets it.'],
  ['BD time gets squeezed', 'Consultants juggle delivery and business development. The hour set aside for BD needs to be calls, not admin.'],
  ['New consultants learn slowly', 'Without recordings, training a new starter on the phone means sitting beside them and hoping the right call comes up.'],
];

const HELPS: Feature[] = [
  { tag: 'Search', title: 'Find the hiring manager', body: 'Search UK and EU decision makers by title, seniority, company size, industry and country: head of engineering, finance director, operations manager.' },
  { tag: 'Reveals', title: 'A direct mobile for one credit', body: `${PRO.credits.toLocaleString('en-GB')} verified mobile reveals per seat each month. Contacts you have revealed stay free for your workspace.` },
  { tag: 'Speed', title: 'A BD hour that is all calls', body: 'The power dialler calls down your list from the browser with a UK number per seat, and resumes the run where you stopped.' },
  { tag: 'Pipeline', title: 'Outcomes move the pipeline', body: 'Nine outcomes on keys 1 to 9. A meeting booked moves the stage; a call back creates a follow-up in the Today queue.' },
  { tag: 'Training', title: 'Every call recorded', body: 'Recordings sit on the call record for a year, so new consultants can learn from real BD calls and managers can coach on them.' },
  { tag: 'Objections', title: 'Do not call means do not call', body: 'Log “Do not call” and the number is blocked for everyone in the workspace from the next dial.' },
];

const DAY: [string, string][] = [
  ['08:30 · Clear the Today queue', 'Call backs and follow-ups from earlier in the week come first, while the conversation is still fresh.'],
  ['09:00 · Build a BD list', 'Pick the titles that own the roles you place, filter by company size and industry, and add the matches to a list.'],
  ['09:15 · One focused hour', 'Run the power dialler. Each number is screened against TPS, CTPS and your do-not-call list before it rings. Notes autosave.'],
  ['10:15 · Log and follow up', 'Meetings booked move the account on; call backs land in tomorrow’s queue; objections go straight onto the do-not-call list.'],
  ['Friday · Review', 'Play back a few recordings with newer consultants and talk through what worked.'],
];

const FAQS: FaqItem[] = [
  {
    question: 'Is Decibel for calling candidates?',
    answer:
      'Decibel is built for business development: calling hiring managers and heads of department about vacancies and your services. Contacting people as candidates about their own careers raises other considerations, so take your own advice before using it that way.',
  },
  {
    question: 'Can I find hiring managers by title and company size?',
    answer: 'Yes. Search by job title and seniority, then narrow by company size band, industry and country. Save the result as a list and call down it with the power dialler.',
  },
  {
    question: 'What happens when someone asks not to be called again?',
    answer:
      'Log the outcome “Do not call”, or have an admin add the number. It joins your workspace do-not-call list and the next attempt to dial it, from anyone in the workspace, is blocked.',
  },
  {
    question: 'Can I use calls for training?',
    answer:
      'Every call is recorded and kept for a year on the call record. Your workspace setting decides whether the person hears a recording notice on answer; we recommend leaving it on.',
  },
  {
    question: 'Where does the contact data come from?',
    answer:
      'At launch the database contains sample data, clearly labelled as such in the product, while we onboard licensed UK and EU data sources. You can import your own client and prospect lists by CSV from day one.',
  },
];

const ROWS: [string, string, string, string][] = [
  ['Head of engineering', '201–500', 'Meeting booked', '#1d9d5b'],
  ['Finance director', '51–200', 'Call back', '#2f6bff'],
  ['Operations manager', '51–200', 'Do not call', '#c0462e'],
];

function BdMock() {
  return (
    <div className="mx-auto max-w-[720px] overflow-hidden rounded-[6px] border border-white-800 bg-white-100 text-left">
      <div className="flex items-center justify-between gap-3 border-b border-white-800 px-4 py-2.5">
        <span className="truncate tabular-nums text-xs tracking-[0.06em] text-faint">list / bd hiring managers</span>
        <Status color="#c0462e">Recording</Status>
      </div>
      {ROWS.map(([title, size, state, color]) => (
        <div key={title} className="flex items-center justify-between gap-3 border-b border-white-800 px-4 py-3">
          <span className="min-w-0">
            <span className="block truncate text-base text-black-400">{title}</span>
            <span className="block tabular-nums text-xs tracking-[0.06em] text-faint">{size} staff · TPS clear</span>
          </span>
          <Status color={color}>{state}</Status>
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

export default function RecruitmentPage() {
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
        eyebrow="Recruitment"
        title="Get to the hiring manager first."
        lede="For agency consultants doing business development. Find hiring managers by title and company size, reveal a direct mobile and call from the browser, with every call recorded for training."
        location="industry_recruitment"
        corners={['Agency BD', 'TPS screened']}
      >
        <BdMock />
      </PageHero>

      <Section eyebrow="What slows teams down" title="BD calls compete with everything else." flush>
        <PainGrid items={PAINS} />
      </Section>

      <Section eyebrow="How Decibel helps" title="Less hunting for numbers, more conversations." lede={`Everything below is included in ${PRO.name}, £${PRO.monthly} per seat per month.`} flush>
        <FeatureGrid items={HELPS} />
      </Section>

      <Section eyebrow="A BD morning" title="One hour of calls, properly logged." lede="An example rhythm for a consultant. Fit it around your own delivery work." flush>
        <Steps items={DAY} />
      </Section>

      {/* compliance */}
      <section className="rail">
        <div className="grid md:grid-cols-2">
          <div className="border-b border-white-800 px-5 py-14 md:border-b-0 md:border-r md:px-10 md:py-20">
            <SectionHead eyebrow="Compliance" title="Business development, done by the rules.">
              Decibel is for business calls to hiring managers about roles and your services. Here is how the rules map onto the product. This is not legal
              advice.
            </SectionHead>
            <CompliancePills className="mt-6" />
          </div>
          <div className="relative min-h-[260px] bg-white-100">
            <AsciiCanvas scene="radar" color="#c4c4bf" intensity={0.7} />
            <span className="absolute left-4 top-4">
              <Status color="#2f6bff">Checking TPS</Status>
            </span>
          </div>
        </div>
        <div className="px-5 pb-14 md:px-10 md:pb-20">
          <Checklist
            className="mt-0"
            items={[
              <>
                <strong className="font-medium text-black-400">Legitimate interests.</strong> B2B outreach usually relies on legitimate interests under UK GDPR. You
                are the controller for your own calls, so document your assessment; there is an LIA template on the{' '}
                <Link href="/compliance" className="link">
                  compliance page
                </Link>
                .
              </>,
              <>
                <strong className="font-medium text-black-400">Article 14 notice.</strong> People whose business details appear in the Decibel database can read
                what we hold and why in our{' '}
                <Link href="/art-14" className="link">
                  Article 14 notice
                </Link>
                .
              </>,
              <>
                <strong className="font-medium text-black-400">Right to object.</strong> When someone objects, log “Do not call”. The number joins your workspace
                do-not-call list and is blocked for every consultant.
              </>,
              <>
                <strong className="font-medium text-black-400">TPS and CTPS.</strong> Both registers are checked on the server before every dial, including numbers
                you import by CSV.
              </>,
              <>
                <strong className="font-medium text-black-400">Recording and caller ID.</strong> A recording notice plays on answer and a caller ID that can be rung
                back is always presented.
              </>,
            ]}
          />
        </div>
      </section>

      <section className="rail px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          <div>
            <SectionHead eyebrow="FAQ" title="Questions from agencies." />
            <pre aria-hidden className="mt-8 select-none text-[12px] leading-[17px] text-white-900 max-md:hidden" style={{ fontFamily: ASCII_FONT }}>
              {'role opens\n    │\n    ├─ find hiring manager\n    ├─ reveal mobile\n    ├─ call\n    └─ meeting booked'}
            </pre>
          </div>
          <Faq items={FAQS} />
        </div>
      </section>

      <Related
        links={[
          { href: '/features/verified-mobiles', label: 'Verified mobiles', blurb: 'UK and EU decision makers, one credit per mobile' },
          { href: '/features/call-recording', label: 'Call recording', blurb: 'Every call recorded, with the notice handled' },
          { href: '/compliance', label: 'Compliance', blurb: 'TPS, CTPS, GDPR and recording rules' },
        ]}
      />
      <CtaStrip location="industry_recruitment" title="Make your next BD hour count." note={FAIR_USE_NOTE} />
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { AsciiCanvas, Reveal, Status } from '@/components/marketing/daygent';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { ASCII_FONT, AsciiBox, Checklist, CtaPair, CtaStrip, DATA_FOOTNOTE, FeatureGrid, JsonLd, PageHero, Related, Section, Split, Steps } from '@/components/marketing/page-kit';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Data quality: how every number is checked',
  description:
    'How Decibel sources and checks data: licensed providers, number format, line type and network checks, TPS and CTPS screening on every dial, and re-checks.',
  alternates: { canonical: '/data-quality' },
};

const CHECKS = [
  ['source', 'licensed provider', 'pass'],
  ['format', '+44 7700 900104 · 12 digits', 'pass'],
  ['line type', 'mobile', 'pass'],
  ['network', 'in service', 'pass'],
  ['TPS / CTPS', 'checked on every dial', 'live'],
] as const;

function CheckMock() {
  return (
    <div className="mx-auto max-w-[640px] overflow-hidden rounded-[6px] border border-white-800 bg-white-100 text-left">
      <div className="flex h-10 items-center justify-between border-b border-rule bg-panel px-4 tabular-nums text-xs">
        <span className="text-white-900">checks · Sarah Okafor</span>
        <Status>Verified</Status>
      </div>
      <ul className="tabular-nums text-xs">
        {CHECKS.map(([step, detail, state], i) => (
          <li key={step} className="flex h-11 items-center gap-4 border-b border-rule px-4 last:border-b-0">
            <span className="w-5 text-faint">{String(i + 1).padStart(2, '0')}</span>
            <span className="w-[92px] shrink-0 text-black-400">{step}</span>
            <span className="min-w-0 flex-1 truncate text-black-700">{detail}</span>
            <span className={cn('shrink-0 tracking-[0.06em]', state === 'live' ? 'text-accent-500' : 'text-success-500')}>{state === 'live' ? '◌ at dial' : '✓'}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const PROCESS: [string, string][] = [
  [
    'Sourced from licensed providers',
    'Contact data comes from providers whose licences allow B2B use in the UK and EU. We are onboarding those sources now, and we record where each record came from so we can answer the people in it.',
  ],
  ['Number format', 'Each number is normalised to international format and checked against the numbering plan for its country: right length, right prefix, a real mobile range.'],
  ['Line type', 'We check whether the number is a mobile, a landline or a virtual number, so a switchboard is never sold to you as a direct mobile.'],
  ['Live-network check', 'Where the country allows it, a network lookup confirms the number is currently in service before it is shown as verified.'],
  ['TPS and CTPS on every dial', 'Screening is not a one-off at import. Every number is checked against both registers on our servers each time it is dialled, and blocked numbers are shown to the rep with the reason.'],
  ['Re-verified over time', 'People change jobs and numbers. Records are re-checked on a rolling basis, and sooner when a rep or customer tells us something is wrong.'],
];

const PROMISES = [
  { tag: 'Credits', title: 'Revealed stays free', body: 'Once a contact is revealed in your workspace it never costs another credit, however many teammates open it.' },
  { tag: 'Labelled', title: 'Sample data says so', body: 'While licensed sources are onboarded the product ships with sample data, labelled as sample data in the product.' },
  { tag: 'No guesses', title: 'No invented accuracy rate', body: 'We will publish accuracy figures once we can measure them on real, licensed data. Not before.' },
  { tag: 'Your lists', title: 'Same checks for imports', body: 'A CSV you import is screened row by row against TPS and CTPS, the same as contacts from our database.' },
];

const FAQS: FaqItem[] = [
  {
    question: 'What is your accuracy rate?',
    answer:
      'We do not quote one yet. An honest figure has to be measured on licensed data that customers are calling, and we are still onboarding those sources. When we have a number we can stand behind, we will publish how it was measured.',
  },
  {
    question: 'Which data providers do you use?',
    answer:
      'We work with licensed providers whose terms allow B2B use in the UK and EU. Our Article 14 notice lists the categories of source and will name each provider as it is onboarded.',
  },
  {
    question: 'What if a number turns out to be wrong?',
    answer:
      'Log the outcome Wrong number on the call and the contact leaves your active pipeline. You can also report the record to us from the support chat, and we re-check it with the source.',
  },
  {
    question: 'Does TPS screening happen once or every time?',
    answer: 'Every time. The registers change all the time, so Decibel checks each number on our servers as part of placing the call, not just when the record was added.',
  },
];

export default function DataQualityPage() {
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
        eyebrow="Data quality"
        location="data_quality_hero"
        corners={['Checked before reveal', 'Screened at dial']}
        title="How we check a number before you call it."
        lede="A contact database is only as good as its checks. This page sets out where our data comes from, what we test each number for, and what we will not claim."
      >
        <CheckMock />
      </PageHero>

      <Split
        visual={
          <div className="relative h-full min-h-[300px]">
            <AsciiCanvas scene="signal" color="#c4c4bf" intensity={0.55} />
            <span className="absolute bottom-4 right-4 tabular-nums text-xs tracking-[0.06em] text-faint">[ sample data · labelled ]</span>
          </div>
        }
      >
        <Reveal>
          <p className="eyebrow">[ Where we are today ]</p>
          <h2 className="t-h1 mt-4 text-black-400">Honest about the database.</h2>
          <p className="mt-4 text-md leading-[26px] text-black-700">
            1M+ verified mobiles* is our launch target, not a current count. Today the product ships with labelled sample data while licensed UK and EU
            sources are onboarded. Everything else on this page describes the checks each record goes through as those sources arrive.
          </p>
          <p className="mt-4 text-md leading-[26px] text-black-700">You can import and call your own lists from day one, with the same screening.</p>
        </Reveal>
      </Split>

      <Section eyebrow="The process" title="Six steps between a source and your dialler." flush>
        <Steps items={PROCESS} />
      </Section>

      <Section eyebrow="What a check looks for" title="Format, line type, network." lede="Three questions are asked of every number before it is shown as verified. The fourth, TPS and CTPS, is asked again on every dial.">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
          <Reveal>
            <Checklist
              items={[
                'Is it a valid number for its country? Length, prefix and numbering range.',
                'Is it a mobile? Landlines and virtual numbers are not passed off as mobiles.',
                'Is it live? A network lookup, where permitted, confirms it is in service.',
                'May you call it right now? TPS, CTPS and your do-not-call list, at dial time.',
              ]}
            />
          </Reveal>
          <Reveal delay={120} className="max-md:hidden">
            <AsciiBox lines={['valid?   ✓', 'mobile?  ✓', 'live?    ✓', 'callable? ◌ ask at dial']} />
          </Reveal>
        </div>
      </Section>

      <Section eyebrow="Our promises" title="What you can rely on." flush>
        <FeatureGrid items={PROMISES} cols={4} />
        <div className="flex flex-col gap-6 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-10">
          <p className="max-w-[560px] text-base leading-[24px] text-black-700">
            See the checks on your own target list during the free trial, or walk through them with the founder.
          </p>
          <CtaPair location="data_quality_mid" size="default" />
        </div>
      </Section>

      <section className="rail px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          <Reveal>
            <p className="eyebrow">[ FAQ ]</p>
            <h2 className="t-h1 mt-4 text-black-400">Questions about the data.</h2>
            <pre aria-hidden className="mt-8 select-none text-[12px] leading-[16px] text-white-800 max-md:hidden" style={{ fontFamily: ASCII_FONT }}>
              {'{v} ── {v} ── {v}'}
            </pre>
            <Link href="/art-14" className="link mt-6 inline-block text-base">
              Read our Article 14 notice
            </Link>
          </Reveal>
          <Faq items={FAQS} />
        </div>
      </section>

      <Related
        links={[
          { href: '/features/verified-mobiles', label: 'Verified mobiles', blurb: 'UK and EU decision makers, one credit per mobile' },
          { href: '/compliance', label: 'Compliance', blurb: 'TPS, CTPS, GDPR and recording rules' },
          { href: '/local-businesses', label: 'Local businesses', blurb: 'Map listings with ratings, hours and numbers' },
        ]}
      />
      <CtaStrip location="data_quality" note={DATA_FOOTNOTE} />
    </>
  );
}

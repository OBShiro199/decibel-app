import type { Metadata } from 'next';
import Link from 'next/link';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { Reveal } from '@/components/marketing/daygent';
import { ASCII_FONT, CtaStrip, DATA_FOOTNOTE, JsonLd, PageHero, Section } from '@/components/marketing/page-kit';
import {
  CHECKED_ON,
  COGNISM_SOURCES,
  ChooseCards,
  CompareCta,
  CompareTable,
  DECIBEL,
  KASPR_SOURCES,
  LUSHA_SOURCES,
  SourcesNote,
  compareJsonLd,
} from '@/components/marketing/compare';
import { PRO } from '@/lib/constants';

const PATH = '/vs';

export const metadata: Metadata = {
  title: 'Decibel vs. Cognism, Lusha and Kaspr (2026): compared',
  description:
    'Compare Decibel with Cognism, Lusha and Kaspr on pricing, mobiles included, dialler, pipeline and free trials, with sources, and see which tool suits your team.',
  alternates: { canonical: PATH },
};

const ROWS = [
  {
    label: 'Focus',
    cells: [
      DECIBEL.focus,
      'Sales intelligence platform; highlights European B2B data and phone-verified mobiles',
      'Global B2B contact data; deepest coverage in the United States, per Lusha',
      'Prospecting from LinkedIn; highlights European contact data',
    ],
  },
  {
    label: 'Pricing',
    cells: [
      DECIBEL.pricing,
      'Quote-based; Standard and Pro packages with 5 seats included; prices not published',
      'Self-serve in US dollars, from $49.90 a month (Starter), or $449.10 a year billed annually',
      'Per user, from £39 a month billed annually (£51 monthly) on Starter',
    ],
  },
  {
    label: 'Mobiles included',
    cells: [
      DECIBEL.mobiles,
      'Credits per seat, 1 credit = 1 revealed contact; allocation not published',
      'Phone number = 5 credits; Starter has 400 credits a month (up to 80 numbers)',
      'Starter: 100 phone credits a month (1,200 a year); Business: 200 a month',
    ],
  },
  {
    label: 'Dialler',
    cells: [DECIBEL.dialler, 'Not listed in its packages; syncs to your CRM and engagement tools', 'No built-in dialler described; integrates with tools such as Nooks', 'Through Aircall or Ringover integrations'],
  },
  {
    label: 'Pipeline',
    cells: [DECIBEL.pipeline, 'Lists; syncs to Salesforce, HubSpot, Pipedrive and others', 'Contact lists; syncs to Salesforce, HubSpot, Pipedrive and others', 'Lead lists and notes; pushes to HubSpot, Salesforce, Pipedrive and others'],
  },
  {
    label: 'Free trial / plan',
    cells: [DECIBEL.trial, 'No self-serve trial published; free data sample and demo on request', 'Free plan: 40 credits a month, no card', 'Free plan: 5 phone credits a month, no card'],
  },
  {
    label: 'Best for',
    cells: [
      DECIBEL.bestFor,
      'Mid-market and larger teams that want a large established database, intent data and CRM sync',
      'Email-first or global prospecting from a Chrome extension, starting free',
      'LinkedIn-led prospecting and recruiting on a modest budget',
    ],
  },
];

const PAGES = [
  { href: '/vs/cognism', name: 'Cognism', blurb: 'Quote-based sales intelligence with a large European and global database, intent data and CRM integrations.' },
  { href: '/vs/lusha', name: 'Lusha', blurb: 'Self-serve contact data with a free plan, a Chrome extension and a large global database.' },
  { href: '/vs/kaspr', name: 'Kaspr', blurb: 'A LinkedIn Chrome extension for European phone numbers and emails, with a free plan.' },
];

const FAQS: FaqItem[] = [
  {
    question: 'Is Decibel a replacement for Cognism, Lusha or Kaspr?',
    answer:
      'Sometimes. Those tools are data platforms you pair with a separate dialler and CRM. Decibel puts UK and EU mobile data, a browser dialler and a pipeline in one plan, which suits small teams whose main channel is calling. If you need a large established database, intent data, email sequences or native CRM integrations today, one of the others may suit you better.',
  },
  {
    question: 'How big is Decibel’s database?',
    answer:
      '1M+ verified mobiles is our launch target, not a current count. The product ships with labelled sample data while licensed data sources are onboarded, and you can import your own lists from day one. Cognism, Lusha and Kaspr all have large, established databases.',
  },
  {
    question: 'How did you check competitor details?',
    answer: `From each company’s own public website on ${CHECKED_ON}, linked under Sources on every page. Pricing changes often, so check their site for current prices. If anything is out of date, email oliver@usedecibel.com and we will correct it.`,
  },
];

export default function VsHubPage() {
  return (
    <>
      <JsonLd data={compareJsonLd({ path: PATH, name: 'Compare', faqs: FAQS })} />

      <PageHero
        eyebrow="Compare"
        title="Decibel vs. Cognism, Lusha and Kaspr"
        corners={['Compare', `Checked ${CHECKED_ON}`]}
        location="vs_hub"
        lede={`Cognism, Lusha and Kaspr are established contact data tools. Decibel is newer and narrower: UK and EU mobiles, a browser dialler and a pipeline in one plan at £${PRO.monthly} per seat per month. Here is a fair side-by-side, sourced from each company’s own website, so you can pick what suits your team.`}
      />

      <Section eyebrow="At a glance" title="All four, side by side" lede="Scroll sideways on a phone. Every competitor detail is linked under Sources." flush>
        <CompareTable caption="Decibel compared with Cognism, Lusha and Kaspr" columns={['Decibel', 'Cognism', 'Lusha', 'Kaspr']} rows={ROWS} />
        <CompareCta location="vs_hub" />
      </Section>

      <Section eyebrow="Who should choose what" title="The right tool depends on how you sell" flush>
        <ChooseCards
          items={[
            {
              name: 'Decibel',
              points: [
                'You are a small UK or EU team, roughly 1–20 reps',
                'Calling mobiles is your main channel',
                'You want data, dialler, recording and pipeline in one tool at a published price',
              ],
            },
            {
              name: 'Cognism',
              points: [
                'You need a large, established European and global database today',
                'Intent data and buying signals drive your targeting',
                'You run 5 or more seats with an existing CRM and dialler',
              ],
            },
            {
              name: 'Lusha',
              points: [
                'You want to start on a free plan',
                'Your outreach is email-first, or your targets are in the US or worldwide',
                'You prospect from LinkedIn with a Chrome extension and sync to a CRM',
              ],
            },
            {
              name: 'Kaspr',
              points: [
                'You prospect mainly from LinkedIn, Sales Navigator or Recruiter Lite',
                'You want a free plan or a low per-user price',
                'You already call through Aircall or Ringover',
              ],
            },
          ]}
        />
      </Section>

      <Section eyebrow="In detail" title="Read the full comparisons" flush>
        <div className="grid border-t border-white-800 md:grid-cols-3">
          {PAGES.map((p, i) => (
            <Reveal key={p.href} delay={i * 80} className="border-b border-white-800 md:border-r">
              <Link href={p.href} className="group block h-full px-5 py-8 transition-colors hover:bg-white-100 md:px-8">
                <pre aria-hidden className="select-none text-[12px] leading-[17px] text-faint" style={{ fontFamily: ASCII_FONT }}>
                  {`┌─ vs ─┐\n└──────┘`}
                </pre>
                <span className="mt-4 flex items-center justify-between text-lg font-medium tracking-[-0.03em] text-black-400">
                  Decibel vs. {p.name}
                  <span className="tabular-nums text-xs text-faint transition-transform group-hover:translate-x-0.5">→</span>
                </span>
                <span className="mt-2 block text-base leading-[23px] text-black-700">{p.blurb}</span>
              </Link>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section eyebrow="FAQ" title="Comparing tools, answered">
        <Faq items={FAQS} />
      </Section>

      <SourcesNote sources={[...COGNISM_SOURCES, ...LUSHA_SOURCES, ...KASPR_SOURCES]} />

      <CtaStrip location="vs_hub" title="Try Decibel on your own list before you decide." note={DATA_FOOTNOTE} />
    </>
  );
}

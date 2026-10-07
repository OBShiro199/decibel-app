import type { Metadata } from 'next';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { Reveal } from '@/components/marketing/daygent';
import { AsciiBox, CtaStrip, DATA_FOOTNOTE, JsonLd, PageHero, Related, Section } from '@/components/marketing/page-kit';
import {
  CHECKED_ON,
  ChooseCards,
  CompareCta,
  CompareTable,
  DECIBEL,
  FAIR_USE_TEXT,
  LUSHA_SOURCES,
  SideBySide,
  SourcesNote,
  TextLink,
  compareJsonLd,
} from '@/components/marketing/compare';
import { PRO, TRIAL_CREDITS } from '@/lib/constants';

const PATH = '/vs/lusha';

export const metadata: Metadata = {
  title: { absolute: 'Decibel vs Lusha: pricing and features (2026)' },
  description:
    'Decibel vs. Lusha compared on pricing, credits per phone number, data, dialler, workflow and compliance, with sources, to help you choose the right one.',
  alternates: { canonical: PATH },
};

const ROWS = [
  { label: 'Focus', cells: [DECIBEL.focus, 'Global B2B contact data; Lusha says its deepest coverage is the United States'] },
  { label: 'Pricing', cells: [DECIBEL.pricing, 'Self-serve, in US dollars: Starter $49.90 a month, or $449.10 a year billed annually; Pro and Premium above; custom Scale plan'] },
  { label: 'Mobiles included', cells: [DECIBEL.mobiles, 'A phone number costs 5 credits, an email 1. Starter has 400 credits a month, so up to 80 phone numbers'] },
  { label: 'Data', cells: [DECIBEL.data, '515M+ verified contacts and 29M+ companies, per Lusha'] },
  { label: 'Dialler', cells: [DECIBEL.dialler, 'No built-in dialler described; integrates with calling tools such as Nooks'] },
  { label: 'Pipeline', cells: [DECIBEL.pipeline, 'Contact lists; syncs to CRMs including Salesforce, HubSpot and Pipedrive'] },
  { label: 'Browser extension', cells: [DECIBEL.extension, 'Yes: Chrome extension on LinkedIn, Sales Navigator and company websites'] },
  { label: 'TPS / CTPS', cells: [DECIBEL.screening, 'Lusha says every phone record carries a Do Not Call flag'] },
  { label: 'Email sequences', cells: ['No', 'Yes, with Lusha Engage'] },
  { label: 'Free trial / plan', cells: [DECIBEL.trial, 'Free plan: 40 credits a month, no card'] },
];

const FAQS: FaqItem[] = [
  {
    question: 'How do Lusha credits compare with Decibel credits?',
    answer: `On Lusha, revealing a phone number costs 5 credits and an email costs 1. Its Starter plan includes 400 credits a month, which is up to 80 phone numbers if every credit goes on phones. On Decibel, one credit reveals one mobile and Pro includes ${PRO.credits.toLocaleString('en-GB')} reveals per seat each month. The two databases differ in size and coverage, so compare on your own target list. Competitor details checked on ${CHECKED_ON}.`,
  },
  {
    question: 'Does Lusha have a free plan?',
    answer: `Yes. Lusha’s Free plan is permanent, with 40 credits a month and no card, which is enough for up to 8 phone numbers. Decibel does not have a free plan; it has a 14-day free trial with one seat, ${TRIAL_CREDITS.toLocaleString('en-GB')} credits and 60 minutes of calling, also without a card.`,
  },
  {
    question: 'Can I call from Lusha?',
    answer:
      'Lusha describes itself as a data platform: it finds and enriches contacts, sends email sequences with Lusha Engage and syncs to your CRM and sales tools, including calling tools such as Nooks. Decibel includes a browser and power dialler, call recording and a pipeline in the same plan.',
  },
  {
    question: 'Which has better data?',
    answer:
      'Lusha has an established database it puts at 515M+ verified contacts and publishes its accuracy figures and method. Decibel is new: 1M+ verified mobiles is our launch target, not a current count, and the product ships with labelled sample data while licensed sources are onboarded. If data depth today is your main need, Lusha is the safer choice.',
  },
];

export default function VsLushaPage() {
  return (
    <>
      <JsonLd data={compareJsonLd({ path: PATH, name: 'Decibel vs. Lusha', faqs: FAQS })} />

      <PageHero
        eyebrow="Compare"
        title="Decibel vs. Lusha"
        corners={['Decibel vs. Lusha', `Checked ${CHECKED_ON}`]}
        location="vs_lusha"
        lede="Lusha is a self-serve B2B data platform with a free plan, a Chrome extension and a large global database. Decibel is a newer tool built around calling UK and EU mobiles, with the data, a browser dialler and a pipeline in one plan. They suit different ways of working; here is how they compare, with sources."
      />

      <Section eyebrow="At a glance" title="Quick comparison" lede="The short version. Every Lusha detail comes from its own website and is linked under Sources." flush>
        <CompareTable caption="Decibel compared with Lusha" columns={['Decibel', 'Lusha']} rows={ROWS} />
        <CompareCta location="vs_lusha" />
      </Section>

      <Section eyebrow="Pricing" title="Credits per number versus reveals per seat" flush>
        <SideBySide
          items={[
            {
              name: 'Decibel',
              body: (
                <>
                  <p>
                    One plan, Pro: £{PRO.monthly} per seat per month, or £{PRO.annual} per seat per year (save 44%), excluding VAT. Each seat includes{' '}
                    {PRO.credits.toLocaleString('en-GB')} verified mobile reveals a month; one credit reveals one mobile and revealed contacts stay free.
                  </p>
                  <p>
                    Calling is included: {FAIR_USE_TEXT} See the <TextLink href="/fair-use">fair use policy</TextLink>.
                  </p>
                </>
              ),
            },
            {
              name: 'Lusha',
              body: (
                <>
                  <p>
                    Lusha publishes its prices in US dollars. Free is $0 with 40 credits a month. Starter is $49.90 a month billed monthly, or $449.10 a year billed
                    annually, with 400 credits a month. Pro is $69.90 a month (600 credits) and Premium $399.90 a month (3,400 credits), with annual discounts. Scale
                    is a custom agreement.
                  </p>
                  <p>
                    A phone number costs 5 credits and an email 1. On monthly plans unused credits roll over up to twice the monthly limit; annual plans get credits up
                    front. Teams larger than 5 users are asked to contact sales.
                  </p>
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section eyebrow="Data and coverage" title="Global and established versus UK and EU and new" flush>
        <SideBySide
          items={[
            {
              name: 'Decibel',
              body: (
                <>
                  <p>
                    Decibel covers UK and EU decision makers, filtered by title, seniority, company size, industry and country, with a target of 1M+ verified
                    mobiles*.
                  </p>
                  <p>
                    That figure is a launch target, not a current count. The product ships with labelled sample data while licensed data sources are onboarded, and
                    you can import your own CSV lists from day one.
                  </p>
                </>
              ),
            },
            {
              name: 'Lusha',
              body: (
                <>
                  <p>
                    Lusha says it holds 515M+ verified contacts and 29M+ companies, with coverage across North America, EMEA, LATAM and APAC and its deepest coverage
                    in the United States.
                  </p>
                  <p>
                    It publishes accuracy figures with its method, adds buying signals such as funding, hiring and job changes, and offers lookalike prospecting and
                    enrichment.
                  </p>
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section eyebrow="Dialler and workflow" title="Extension and sync versus an all-in-one calling tool" flush>
        <SideBySide
          items={[
            {
              name: 'Decibel',
              body: <p>Search, reveal, call and log the outcome in one tab. The dialler, recording and pipeline are part of the same plan.</p>,
              points: [
                'Browser dialler and power dialler, with a UK number per seat',
                `Every call recorded and kept for ${PRO.recordings}`,
                'Lists, stages, outcomes and per-rep dashboards',
                'CSV import and export today; native CRM integrations are coming soon',
              ],
            },
            {
              name: 'Lusha',
              body: <p>Lusha finds and enriches contacts wherever you prospect and sends them to the tools you already use.</p>,
              points: [
                'Chrome extension on LinkedIn, Sales Navigator and company websites',
                'Integrations with Salesforce, HubSpot, Pipedrive, Bullhorn, Zoho, Dynamics and more',
                'Lusha Engage for email sequences; Lusha Conversations for meeting analysis',
                'Calling through integrated tools such as Nooks; API and MCP access',
              ],
            },
          ]}
        />
      </Section>

      <Section eyebrow="Compliance" title="A flag on the record versus a check on the dial" flush>
        <SideBySide
          items={[
            {
              name: 'Decibel',
              body: (
                <p>
                  Every dial is checked against TPS, CTPS and your own do-not-call list on the server, so a listed number cannot be called even if a list is out of
                  date, and the call recording notice is handled for you. See <TextLink href="/compliance">compliance</TextLink>.
                </p>
              ),
            },
            {
              name: 'Lusha',
              body: (
                <p>
                  Lusha says every phone record carries a Do Not Call flag, holds SOC 2 Type II and several ISO certifications, has GDPR certification from
                  ePrivacyseal and CCPA validation from TrustArc, and does not scrape professional networks. As with any data source, screening at the moment of
                  calling depends on your calling tool and process.
                </p>
              ),
            },
          ]}
        />
      </Section>

      <Section eyebrow="Who should choose what" title="An honest recommendation" flush>
        <ChooseCards
          items={[
            {
              name: 'Decibel',
              points: [
                'You are a small UK or EU team, roughly 1–20 reps, and calling mobiles is your main channel',
                'You want data, a dialler, recording and a pipeline in one tool',
                'You need a high volume of mobile reveals each month at a flat price per seat',
                'You are happy to start with your own lists while our licensed data is onboarded',
              ],
            },
            {
              name: 'Lusha',
              points: [
                'You want to start free and pay only when you need more credits',
                'Your prospecting is email-first, or your targets are in the US or worldwide',
                'You work from LinkedIn and Sales Navigator with a Chrome extension',
                'You need a large, established database and CRM sync today',
              ],
            },
          ]}
        />
        <div className="border-t border-white-800 px-5 py-8 md:px-8">
          <Reveal>
            <AsciiBox lines={['Not sure which fits?', 'Book a 15-minute demo and ask us straight.']} />
          </Reveal>
        </div>
      </Section>

      <Section eyebrow="FAQ" title="Decibel vs. Lusha, answered">
        <Faq items={FAQS} />
      </Section>

      <SourcesNote sources={LUSHA_SOURCES} />

      <Related
        links={[
          { href: '/vs/cognism', label: 'Decibel vs. Cognism', blurb: 'Enterprise data platform compared' },
          { href: '/vs/kaspr', label: 'Decibel vs. Kaspr', blurb: 'EU data extension compared' },
          { href: '/features', label: 'Features', blurb: 'Data, dialler and pipeline in one place' },
        ]}
      />

      <CtaStrip location="vs_lusha" title="Call your next list from the browser this week." note={DATA_FOOTNOTE} />
    </>
  );
}

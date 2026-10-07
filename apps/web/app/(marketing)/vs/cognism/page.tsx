import type { Metadata } from 'next';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { Reveal } from '@/components/marketing/daygent';
import { AsciiBox, CtaStrip, DATA_FOOTNOTE, JsonLd, PageHero, Related, Section } from '@/components/marketing/page-kit';
import {
  CHECKED_ON,
  COGNISM_SOURCES,
  ChooseCards,
  CompareCta,
  CompareTable,
  DECIBEL,
  FAIR_USE_TEXT,
  SideBySide,
  SourcesNote,
  TextLink,
  compareJsonLd,
} from '@/components/marketing/compare';
import { PRO, TRIAL_CREDITS } from '@/lib/constants';

const PATH = '/vs/cognism';

export const metadata: Metadata = {
  title: { absolute: 'Decibel vs Cognism: pricing and features (2026)' },
  description:
    'Decibel vs. Cognism compared on pricing, data coverage, dialler, workflow and TPS compliance, with sources, so you can pick the right fit for your sales team.',
  alternates: { canonical: PATH },
};

const ROWS = [
  { label: 'Focus', cells: [DECIBEL.focus, 'Sales intelligence platform; Cognism highlights European B2B data and phone-verified mobiles'] },
  { label: 'Pricing', cells: [DECIBEL.pricing, 'Quote-based. Standard and Pro packages, each with 5 seats included; prices not published'] },
  { label: 'Mobiles included', cells: [DECIBEL.mobiles, 'Credits allocated per seat (1 credit = 1 revealed contact); allocation not published'] },
  { label: 'Data', cells: [DECIBEL.data, '“Hundreds of millions” of company and contact profiles, per Cognism'] },
  { label: 'Dialler', cells: [DECIBEL.dialler, 'Not listed in its packages; data syncs to your CRM and engagement tools'] },
  { label: 'Pipeline', cells: [DECIBEL.pipeline, 'Lists in the platform; syncs to Salesforce, HubSpot, Pipedrive, Bullhorn and Dynamics'] },
  { label: 'Call recording', cells: [DECIBEL.recording, 'Via your own calling tool'] },
  { label: 'TPS / CTPS', cells: [DECIBEL.screening, 'Cognism says it screens its phone data against DNC registries including TPS and CTPS'] },
  { label: 'Intent data', cells: [DECIBEL.intent, 'Yes, on Pro (Bombora Company Surge data)'] },
  { label: 'Free trial', cells: [DECIBEL.trial, 'No self-serve trial published; free data sample and demo on request'] },
];

const FAQS: FaqItem[] = [
  {
    question: 'How much does Cognism cost compared with Decibel?',
    answer: `Cognism does not publish prices. Its pricing page lists Standard and Pro packages with 5 seats included and asks you to talk to sales for a quote. Decibel has one published plan: £${PRO.monthly} per seat per month, or £${PRO.annual} per seat per year, excluding VAT, with ${PRO.credits.toLocaleString('en-GB')} mobile reveals per seat each month. Competitor details checked on ${CHECKED_ON}.`,
  },
  {
    question: 'Does Cognism have a built-in dialler?',
    answer:
      'Cognism’s published packages and integrations page do not list a dialler of its own. Cognism data syncs to CRMs such as Salesforce and HubSpot and to engagement tools such as Outreach and Salesloft, which teams then call from. Decibel includes a browser and power dialler, call recording and a pipeline in the same plan.',
  },
  {
    question: 'Is Decibel’s database as large as Cognism’s?',
    answer:
      'No, and we do not claim it is. Cognism has an established database it describes as hundreds of millions of company and contact profiles. Decibel is new: 1M+ verified mobiles is our launch target, not a current count, and the product ships with labelled sample data while licensed sources are onboarded. You can import your own lists from day one.',
  },
  {
    question: 'Do both screen against TPS and CTPS?',
    answer:
      'Cognism says it screens its phone data against Do Not Call registries in several countries, including the UK’s TPS and CTPS. Decibel checks TPS, CTPS and your own do-not-call list on every dial, on the server, so a listed number is blocked at the moment of calling. This is not legal advice.',
  },
];

export default function VsCognismPage() {
  return (
    <>
      <JsonLd data={compareJsonLd({ path: PATH, name: 'Decibel vs. Cognism', faqs: FAQS })} />

      <PageHero
        eyebrow="Compare"
        title="Decibel vs. Cognism"
        corners={['Decibel vs. Cognism', `Checked ${CHECKED_ON}`]}
        location="vs_cognism"
        lede="Cognism is an established sales intelligence platform with a large European and global database, intent data and CRM integrations, sold on custom quotes. Decibel is a newer, smaller tool that puts UK and EU mobile data, a browser dialler and a pipeline in one plan with a published monthly price. Here is how they compare, with sources."
      />

      <Section eyebrow="At a glance" title="Quick comparison" lede="The short version. Every Cognism detail comes from its own website and is linked under Sources." flush>
        <CompareTable caption="Decibel compared with Cognism" columns={['Decibel', 'Cognism']} rows={ROWS} />
        <CompareCta location="vs_cognism" />
      </Section>

      <Section eyebrow="Pricing" title="A quote versus a published price" flush>
        <SideBySide
          items={[
            {
              name: 'Decibel',
              body: (
                <>
                  <p>
                    One plan, Pro: £{PRO.monthly} per seat per month, or £{PRO.annual} per seat per year (save 44%), excluding VAT. Each seat includes{' '}
                    {PRO.credits.toLocaleString('en-GB')} verified mobile reveals a month, where one credit reveals one mobile and revealed contacts stay free.
                  </p>
                  <p>
                    Calling is included: {FAIR_USE_TEXT} See the <TextLink href="/fair-use">fair use policy</TextLink>. The free trial gives one seat,{' '}
                    {TRIAL_CREDITS.toLocaleString('en-GB')} credits and 60 minutes for 14 days, without a card.
                  </p>
                </>
              ),
            },
            {
              name: 'Cognism',
              body: (
                <>
                  <p>
                    Cognism’s pricing page lists two sales prospecting packages, Standard and Pro, each with 5 seats included, and directs you to sales for a quote.
                    No prices are published. CRM Enrichment is sold as an add-on or on its own.
                  </p>
                  <p>
                    Cognism says each seat includes an allocation of credits, one credit reveals one contact, there is no charge for viewing contacts you have already
                    revealed, and a credit is only used again if that contact changes jobs.
                  </p>
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section eyebrow="Data and coverage" title="Established database versus a new one" flush>
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
                    To be plain about where we are: that figure is a launch target, not a current count. The product ships with labelled sample data while licensed
                    data sources are onboarded, and you can import your own CSV lists from day one.
                  </p>
                </>
              ),
            },
            {
              name: 'Cognism',
              body: (
                <>
                  <p>
                    Cognism describes a global database of “hundreds of millions” of company and contact profiles and positions itself strongly on European B2B data.
                    It offers phone-verified mobiles, which it says are checked through a mix of human and AI processes.
                  </p>
                  <p>
                    Its Pro package adds intent data from Bombora, on-demand mobile verification and a premium mobile filter, alongside signals such as hiring, funding
                    and job changes.
                  </p>
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section eyebrow="Dialler and workflow" title="Data platform versus calling workflow" flush>
        <SideBySide
          items={[
            {
              name: 'Decibel',
              body: <p>Search, reveal, call and log the outcome without leaving the tab. The dialler, recording and pipeline are part of the same plan.</p>,
              points: [
                'Browser dialler and power dialler, with a UK number per seat',
                `Every call recorded and kept for ${PRO.recordings}`,
                'Lists, stages, outcomes and per-rep dashboards',
                'CSV import and export today; native CRM integrations are coming soon',
              ],
            },
            {
              name: 'Cognism',
              body: <p>Cognism focuses on data and how it reaches your existing stack. Calling happens in whichever tool your team already uses.</p>,
              points: [
                'Integrations with Salesforce, HubSpot, Pipedrive, Bullhorn and Microsoft Dynamics',
                'Outreach and Salesloft integrations, plus Zapier',
                'Chrome extension, which Cognism says also works over Outreach',
                'MCP and API access, CSV enrichment and CRM enrichment',
              ],
            },
          ]}
        />
      </Section>

      <Section eyebrow="Compliance" title="Screening the data versus screening the dial" flush>
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
              name: 'Cognism',
              body: (
                <p>
                  Cognism says it screens its phone data against Do Not Call registries including the UK’s TPS and CTPS and those of the US, Germany, France, Ireland
                  and others, notifies contacts under GDPR, relies on legitimate interest and holds ISO 27001, ISO 27701 and SOC 2 Type II.
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
                'You prefer a published monthly price per seat you can start and stop',
                'You are happy to start with your own lists while our licensed data is onboarded',
              ],
            },
            {
              name: 'Cognism',
              points: [
                'You need a large, established database across Europe and beyond today',
                'Intent data and buying signals matter to how you prioritise accounts',
                'You need deep integrations with Salesforce, HubSpot or Dynamics',
                'You already have a dialler or engagement platform, and a team of 5 or more seats',
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

      <Section eyebrow="FAQ" title="Decibel vs. Cognism, answered">
        <Faq items={FAQS} />
      </Section>

      <SourcesNote sources={COGNISM_SOURCES} />

      <Related
        links={[
          { href: '/vs/lusha', label: 'Decibel vs. Lusha', blurb: 'Contact data extension compared' },
          { href: '/vs/kaspr', label: 'Decibel vs. Kaspr', blurb: 'EU data extension compared' },
          { href: '/features', label: 'Features', blurb: 'Data, dialler and pipeline in one place' },
        ]}
      />

      <CtaStrip location="vs_cognism" title="See Decibel next to your current data this week." note={DATA_FOOTNOTE} />
    </>
  );
}

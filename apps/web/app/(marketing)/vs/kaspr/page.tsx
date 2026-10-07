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
  KASPR_SOURCES,
  SideBySide,
  SourcesNote,
  TextLink,
  compareJsonLd,
} from '@/components/marketing/compare';
import { PRO, TRIAL_CREDITS } from '@/lib/constants';

const PATH = '/vs/kaspr';

export const metadata: Metadata = {
  title: { absolute: 'Decibel vs Kaspr: pricing and features (2026)' },
  description:
    'Decibel vs. Kaspr compared on pricing, phone credits, European data, dialler, LinkedIn workflow and compliance, with sources, so you can choose the right fit.',
  alternates: { canonical: PATH },
};

const ROWS = [
  { label: 'Focus', cells: [DECIBEL.focus, 'Prospecting from LinkedIn; Kaspr highlights European contact data'] },
  { label: 'Pricing', cells: [DECIBEL.pricing, 'Per user: Starter £39 a month billed annually (£51 monthly); Business £69 (£85 monthly); Enterprise custom'] },
  { label: 'Mobiles included', cells: [DECIBEL.mobiles, 'Phone credits: Starter 100 a month (1,200 a year), Business 200 a month (2,400 a year)'] },
  { label: 'Data', cells: [DECIBEL.data, '200m+ profiles and 500m+ phone numbers and emails, per Kaspr'] },
  { label: 'Dialler', cells: [DECIBEL.dialler, 'Calls through its Aircall or Ringover integrations'] },
  { label: 'Pipeline', cells: [DECIBEL.pipeline, 'Lead lists, notes and activity; pushes leads to HubSpot, Salesforce, Pipedrive and others'] },
  { label: 'Browser extension', cells: [DECIBEL.extension, 'Yes: Chrome extension on LinkedIn, Sales Navigator and Recruiter Lite'] },
  { label: 'TPS / CTPS', cells: [DECIBEL.screening, 'Not stated on its pricing or home page; Kaspr describes itself as GDPR and CCPA aligned'] },
  { label: 'Free trial / plan', cells: [DECIBEL.trial, 'Free plan: 5 phone credits and 15 B2B email credits a month, no card'] },
];

const FAQS: FaqItem[] = [
  {
    question: 'How much does Kaspr cost compared with Decibel?',
    answer: `Kaspr publishes per-user prices in euros, pounds and dollars. In sterling, Starter is £39 a month billed annually or £51 billed monthly, with 1,200 phone credits a year, and Business is £69 a month billed annually or £85 monthly, with 2,400 phone credits a year. Decibel Pro is £${PRO.monthly} per seat per month or £${PRO.annual} per year, excluding VAT, with ${PRO.credits.toLocaleString('en-GB')} mobile reveals per seat each month and calling included. Competitor details checked on ${CHECKED_ON}.`,
  },
  {
    question: 'Can I call from Kaspr?',
    answer:
      'Kaspr lists integrations with Aircall and Ringover so you can call leads you have saved, which means using one of those tools alongside it. Decibel includes a browser and power dialler, a UK number per seat, call recording and a pipeline in the same plan.',
  },
  {
    question: 'Does Kaspr have a free plan?',
    answer: `Yes. Kaspr’s Free plan includes 5 phone credits, 15 B2B email credits and 5 direct email credits a month, with no card required. Decibel does not have a free plan; it has a 14-day free trial with one seat, ${TRIAL_CREDITS.toLocaleString('en-GB')} credits and 60 minutes of calling, also without a card.`,
  },
  {
    question: 'Which has more European data?',
    answer:
      'Kaspr has an established database it puts at 200m+ profiles and 500m+ phone numbers and emails, and it highlights European contact data. Decibel is new: 1M+ verified mobiles is our launch target, not a current count, and the product ships with labelled sample data while licensed sources are onboarded.',
  },
];

export default function VsKasprPage() {
  return (
    <>
      <JsonLd data={compareJsonLd({ path: PATH, name: 'Decibel vs. Kaspr', faqs: FAQS })} />

      <PageHero
        eyebrow="Compare"
        title="Decibel vs. Kaspr"
        corners={['Decibel vs. Kaspr', `Checked ${CHECKED_ON}`]}
        location="vs_kaspr"
        lede="Kaspr is a Chrome extension for finding European phone numbers and emails from LinkedIn, with a free plan and published per-user prices from £39 a month billed annually. Decibel is a newer tool built around calling UK and EU mobiles, with the data, a browser dialler and a pipeline in one plan. Here is how they compare, with sources."
      />

      <Section eyebrow="At a glance" title="Quick comparison" lede="The short version. Every Kaspr detail comes from its own website and is linked under Sources." flush>
        <CompareTable caption="Decibel compared with Kaspr" columns={['Decibel', 'Kaspr']} rows={ROWS} />
        <CompareCta location="vs_kaspr" />
      </Section>

      <Section eyebrow="Pricing" title="Low entry price versus calling included" flush>
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
              name: 'Kaspr',
              body: (
                <>
                  <p>
                    Kaspr publishes prices per user per month. In sterling: Free £0; Starter £39 billed annually or £51 billed monthly; Business £69 billed annually or
                    £85 billed monthly; Enterprise is custom, with unlimited credits. Euro and dollar prices are also listed.
                  </p>
                  <p>
                    Starter includes unlimited B2B email credits and 100 phone credits a month (1,200 a year). Business includes 200 phone credits and 200 direct email
                    credits a month. Extra phone credits can be bought as add-ons.
                  </p>
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section eyebrow="Data and coverage" title="Established European data versus a new UK and EU database" flush>
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
              name: 'Kaspr',
              body: (
                <>
                  <p>
                    Kaspr promises “accurate European contact data” and says it gives access to 500m+ phone numbers and email addresses across 200m+ profiles, verified
                    in real time from over 150 sources.
                  </p>
                  <p>Its Enterprise plan adds intent data and advanced Salesforce enrichment.</p>
                </>
              ),
            },
          ]}
        />
      </Section>

      <Section eyebrow="Dialler and workflow" title="LinkedIn extension versus an all-in-one calling tool" flush>
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
              name: 'Kaspr',
              body: <p>Kaspr works where you already prospect, on LinkedIn, and pushes contacts to the tools you use next.</p>,
              points: [
                'Chrome extension on LinkedIn, Sales Navigator (Starter) and Recruiter Lite (Business)',
                'Lead management with lists, notes and activity; CSV enrichment',
                'Integrations with HubSpot, Salesforce, Pipedrive, Lemlist, Brevo, Zoho and Zapier',
                'Calling through Aircall or Ringover integrations',
              ],
            },
          ]}
        />
      </Section>

      <Section eyebrow="Compliance" title="What each says about compliance" flush>
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
              name: 'Kaspr',
              body: (
                <p>
                  Kaspr describes its data as GDPR and CCPA aligned, offers an option to hide direct emails for compliance reasons, and lists enterprise-level
                  compliance on its Enterprise plan. We did not find TPS or CTPS screening described on its pricing or home page, so ask Kaspr directly if UK
                  calling is your use case.
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
              name: 'Kaspr',
              points: [
                'You prospect mainly from LinkedIn, Sales Navigator or Recruiter Lite',
                'You want a free plan or a low per-user price to start',
                'You need a modest number of phone numbers each month alongside emails',
                'You already use Aircall or Ringover for calling, or recruit rather than sell',
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

      <Section eyebrow="FAQ" title="Decibel vs. Kaspr, answered">
        <Faq items={FAQS} />
      </Section>

      <SourcesNote sources={KASPR_SOURCES} />

      <Related
        links={[
          { href: '/vs/cognism', label: 'Decibel vs. Cognism', blurb: 'Enterprise data platform compared' },
          { href: '/vs/lusha', label: 'Decibel vs. Lusha', blurb: 'Contact data extension compared' },
          { href: '/features', label: 'Features', blurb: 'Data, dialler and pipeline in one place' },
        ]}
      />

      <CtaStrip location="vs_kaspr" title="Go from search to live call in one tool." note={DATA_FOOTNOTE} />
    </>
  );
}

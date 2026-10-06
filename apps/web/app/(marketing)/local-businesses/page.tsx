import type { Metadata } from 'next';
import Link from 'next/link';
import { Console, Reveal, Status } from '@/components/marketing/daygent';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { LocalBusinessTable, LocalFilterChips } from '@/components/marketing/local-section';
import { ASCII_FONT, AsciiBox, LOCAL_FOOTNOTE, Checklist, CtaPair, CtaStrip, FeatureGrid, JsonLd, PageHero, Related, Section, Split, Steps } from '@/components/marketing/page-kit';

export const metadata: Metadata = {
  title: 'Local business leads with verified phone numbers',
  description:
    'Find local businesses with checked numbers and emails, ratings, review counts, opening hours and websites. Filter by town and category, then call or export.',
  alternates: { canonical: '/local-businesses' },
};

const LISTING = [
  { tag: 'Phone', title: 'Verified phone numbers', body: 'Checked for format, line type and whether the number is in service before it is shown as verified.' },
  { tag: 'Email', title: 'Checked emails', body: 'Business email addresses where one is published, checked so you are not writing to a dead inbox.' },
  { tag: 'Reviews', title: 'Ratings and review counts', body: 'The star rating and how many reviews it rests on, so a 4.9 from 8 reviews reads differently from a 4.6 from 300.' },
  { tag: 'Hours', title: 'Opening hours', body: 'Call when someone is there to answer. Filter to businesses that are open right now.' },
  { tag: 'Website', title: 'Website, or the lack of one', body: 'See the site if there is one. If there is not, that might be the reason to call.' },
  { tag: 'Place', title: 'Category and town', body: 'Plumbers in Harrogate, dentists in Shrewsbury, garages around Didcot. Search the way you sell.' },
];

const FILTERS: [string, string][] = [
  ['Category', 'Trade or business type: plumber, café, dentist, garage, florist and many more.'],
  ['Town', 'Work one patch at a time, starting with the town on your doorstep.'],
  ['Minimum rating', 'Only businesses at or above the star rating you choose.'],
  ['Minimum reviews', 'Skip listings with too few reviews to mean anything.'],
  ['Has website / no website', 'Find the businesses with no site at all, or only the ones that have one.'],
  ['Open now', 'Call the businesses that are open at this moment.'],
];

const FLOW: [string, string][] = [
  ['Filter', 'Pick a category and a town, then narrow by rating, reviews, website and opening hours.'],
  ['Select rows', 'Tick the businesses you want to call.'],
  ['Add to a list', 'Selected businesses go into a list, ready for a run.'],
  ['Call from the dialler', 'Start the power dialler on the list. Every number is screened against TPS and CTPS before it rings.'],
  ['Export a CSV', 'Need the list in a spreadsheet or your CRM? Export it as a CSV whenever you like.'],
];

const AUDIENCES = [
  { tag: 'Web design', title: 'Agencies building sites', body: 'Filter to “no website” in your area and call the businesses with strong reviews and nowhere to send customers.' },
  { tag: 'Marketing', title: 'Marketing and SEO', body: 'Good businesses with few reviews are an easy conversation about getting found.' },
  { tag: 'IT support', title: 'IT and managed services', body: 'Practices, surgeries and offices in your patch that need someone local to call when things break.' },
  { tag: 'Payments', title: 'Card payments and EPOS', body: 'Cafés, salons and shops that take money across a counter every day.' },
  { tag: 'Recruitment', title: 'Recruitment for trades', body: 'Busy electricians, plumbers and builders with more work than hands.' },
];

const FAQS: FaqItem[] = [
  {
    question: 'Is this Google data?',
    answer:
      'No. Decibel is not affiliated with Google. We mention Google Maps only to describe the kind of listing: a local business with a category, a rating, reviews and opening hours. Listings come from the data sources we license.',
  },
  {
    question: 'Can I cold call sole traders?',
    answer:
      'Sole traders and partnerships register with the TPS rather than the CTPS, so Decibel checks both registers on every dial. If a number is listed, the call is blocked and you see why. This is product guidance, not legal advice.',
  },
  {
    question: 'Can I email these businesses?',
    answer:
      'Emails are shown where a business publishes one. Under PECR, unsolicited marketing email to sole traders and partnerships usually needs consent, while limited companies are treated differently. Check your approach before you send.',
  },
  {
    question: 'Is the data in the screenshots real?',
    answer: 'No. The businesses on this page are fictional and the numbers are from Ofcom’s drama range, which is set aside for fiction.',
  },
];

export default function LocalBusinessesPage() {
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
        eyebrow="Local businesses"
        location="local_hero"
        corners={['Ratings · hours · websites', 'TPS + CTPS on dial']}
        title="Local businesses, with numbers you can call today."
        lede="Find the kind of listings you see on Google Maps, with verified phone numbers and emails, ratings and review counts, opening hours and websites. Every number is checked, then screened on every dial."
      >
        <Console file="local.search" right={<Status>2 selected</Status>}>
          <div className="border-b border-rule px-4 py-3">
            <LocalFilterChips />
          </div>
          <LocalBusinessTable selected={[1, 3]} />
          <p className="border-t border-rule px-4 py-2.5 text-left tabular-nums text-xs text-faint">Fictional sample listings · numbers from Ofcom&rsquo;s drama range</p>
        </Console>
      </PageHero>

      <Section eyebrow="In every listing" title="Everything you would look up before you call." lede="The details that tell you whether a business is worth a call, and when to make it." flush>
        <FeatureGrid items={LISTING} />
      </Section>

      <Split
        reverse
        visual={
          <div className="flex h-full flex-col justify-center gap-6 px-5 py-10 md:px-10">
            <p className="tabular-nums text-xs tracking-[0.06em] text-faint">[ Filters ]</p>
            <AsciiBox
              lines={['category   = plumber', 'town       = Harrogate', 'rating    >= 4.0', 'reviews   >= 40', 'website    = none', 'open now   = yes']}
              className="max-w-full overflow-hidden"
            />
            <p className="tabular-nums text-xs tracking-[0.06em] text-black-700">
              <span className="text-black-400">38</span> businesses match · sample
            </p>
          </div>
        }
      >
        <Reveal>
          <p className="eyebrow">[ Filters ]</p>
          <h2 className="t-h1 mt-4 text-black-400">Narrow a town down to a call list.</h2>
          <ul className="mt-8 border-t border-white-800">
            {FILTERS.map(([name, body]) => (
              <li key={name} className="border-b border-white-800 py-3.5">
                <p className="text-base font-medium text-black-400">{name}</p>
                <p className="mt-0.5 text-base text-black-700">{body}</p>
              </li>
            ))}
          </ul>
        </Reveal>
      </Split>

      <Section eyebrow="Workflow" title="From a search to a dialler run." lede="Local businesses work like every other contact in Decibel: lists, the power dialler, outcomes and the pipeline." flush>
        <Steps items={FLOW} />
        <div className="border-t border-white-800 px-5 py-8 md:px-10">
          <CtaPair location="local_mid" size="default" />
        </div>
      </Section>

      <Section eyebrow="Who it is for" title="Built for agencies that sell to small businesses." flush>
        <FeatureGrid items={AUDIENCES} cols={3} />
      </Section>

      <section className="rail">
        <div className="grid md:grid-cols-2">
          <div className="border-b border-white-800 px-5 py-14 md:border-b-0 md:border-r md:px-10 md:py-20">
            <Reveal>
              <p className="eyebrow">[ Screening ]</p>
              <h2 className="t-h1 mt-4 text-black-400">Checked when listed, screened when dialled.</h2>
              <p className="mt-4 text-md leading-[26px] text-black-700">
                Many small businesses use a mobile as their main number, and many sole traders are on the TPS. So every number is checked for validity
                before it is shown, and screened against TPS, CTPS and your do-not-call list each time it is dialled.
              </p>
              <Link href="/data-quality" className="link mt-6 inline-block text-base">
                How data quality works
              </Link>
            </Reveal>
          </div>
          <div className="px-5 py-14 md:px-10 md:py-20">
            <Reveal delay={100}>
              <Checklist
                items={[
                  'Number format, line type and network status checked',
                  'TPS and CTPS checked on our servers on every dial',
                  'Blocked numbers shown to the rep with the reason',
                  'Workspace do-not-call list honoured for everyone',
                  'Caller ID always presented, one call at a time',
                ]}
              />
              <pre aria-hidden className="mt-8 select-none text-[12px] leading-[16px] text-white-800" style={{ fontFamily: ASCII_FONT }}>
                {'<+> ─── ✓ ─── ☎'}
              </pre>
            </Reveal>
          </div>
        </div>
      </section>

      <section className="rail px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          <Reveal>
            <p className="eyebrow">[ FAQ ]</p>
            <h2 className="t-h1 mt-4 text-black-400">Questions about local data.</h2>
          </Reveal>
          <Faq items={FAQS} />
        </div>
      </section>

      <Related
        links={[
          { href: '/features/power-dialler', label: 'Power dialler', blurb: 'Call down a list from your browser' },
          { href: '/data-quality', label: 'Data quality', blurb: 'How every number is checked' },
          { href: '/features/pipeline', label: 'Lists and pipeline', blurb: 'Outcomes move deals on their own' },
        ]}
      />
      <CtaStrip location="local_businesses" title="Call the businesses in your patch this week." note={LOCAL_FOOTNOTE} />
    </>
  );
}

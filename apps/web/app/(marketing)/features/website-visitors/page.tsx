import type { Metadata } from 'next';
import Link from 'next/link';
import { Reveal } from '@/components/marketing/daygent';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { AsciiBox, CtaPair, CtaStrip, FeatureGrid, JsonLd, PageHero, Related, Section, Steps } from '@/components/marketing/page-kit';
import { VISITORS_FOOTNOTE, VisitorFeed } from '@/components/marketing/visitors-section';
import { PRO } from '@/lib/constants';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Website visitor identification for B2B',
  description:
    'See which companies visit your website, then reveal the decision makers there with verified mobiles. Companies, never people: built for GDPR. Included in Pro.',
  alternates: { canonical: '/features/website-visitors' },
};

const FEATURES = [
  { tag: 'Snippet', title: 'One line on your site', body: 'Paste a short script into your website. It works alongside your cookie banner and the analytics you already use.' },
  { tag: 'IP to company', title: 'The company behind the visit', body: 'Visits from business networks are matched to the company that owns them: name, website, industry, size and location.' },
  { tag: 'Intent', title: 'What they read', body: 'See which pages each company viewed and how often it came back, so the companies comparing prices stand out.' },
  { tag: 'Decision makers', title: 'The people to call', body: 'Each company opens on the decision makers Decibel holds for it. Reveal a mobile for one credit, as anywhere else in Decibel.' },
  { tag: 'Straight to the dialler', title: 'Call while it is fresh', body: 'Add the people to a list and call from the browser. TPS, CTPS and your do-not-call list are checked on every dial.' },
  { tag: 'Included', title: `Part of ${PRO.name}`, body: `No extra seat, add-on or tracked-visitor fee. Revealing a mobile uses the credits already in your plan.` },
];

const STEPS: [string, string][] = [
  ['Add the snippet to your website', 'One line of script, added by you or your web team. It takes a few minutes and needs no other setup.'],
  ['See the companies that visit', 'Business visits appear as companies in Decibel, with the pages they viewed and when they came back.'],
  ['Reveal the decision makers and call', 'Pick the people that matter at each company, reveal their mobiles and start the dialler.'],
];

const GDPR: { title: string; body: string }[] = [
  { title: 'Companies, not people', body: 'A visit is matched to a company from the network it came from. The person browsing is never identified, profiled or emailed.' },
  { title: 'Business networks only', body: 'Home broadband and mobile networks are ignored, so a visit from someone at home is never tied to anyone.' },
  { title: 'Business contacts, legitimate interest', body: 'The decision makers come from Decibel’s B2B database, the same records you search today, held under legitimate interest with the Article 14 notice.' },
  { title: 'Your privacy notice stays true', body: 'We give you the wording to add to your privacy and cookie notices, and the script respects the choices people make in your cookie banner.' },
];

const FAQS: FaqItem[] = [
  {
    question: 'Is website visitor identification GDPR compliant?',
    answer:
      'It is built around the company, not the person. A visit is matched to the business that owns the network it came from, and the visitor is never identified. The decision makers you see come from Decibel’s B2B contact data, held under legitimate interest. You should still mention it in your privacy notice; we provide the wording. This is product guidance, not legal advice.',
  },
  {
    question: 'Does it tell me who visited my website?',
    answer:
      'It tells you which company visited and what it read. It does not tell you which person at that company it was. You then choose which decision makers at that company to contact.',
  },
  {
    question: 'Why do some visits not show a company?',
    answer:
      'Only visits from business networks can be matched. People browsing from home broadband, a mobile connection or a VPN are left out on purpose, so those visits are never linked to anyone.',
  },
  {
    question: 'Does it cost extra?',
    answer: `No. Website visitor identification is part of ${PRO.name}. Revealing a decision maker’s mobile uses one of your plan’s credits, as it does anywhere else in Decibel.`,
  },
];

export default function WebsiteVisitorsPage() {
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
        eyebrow="Website visitors"
        location="website_visitors_hero"
        corners={['Companies, not people', `Included in ${PRO.name}`]}
        title="See which companies visit your website."
        lede="Decibel matches business visits to the company behind them, then shows you the decision makers there with verified mobiles. You call while the interest is fresh, and the visitor stays anonymous."
      >
        <VisitorFeed />
        <p className="mt-3 text-center tabular-nums text-xs tracking-[0.06em] text-faint">
          Fictional companies and people shown. Numbers are from Ofcom&rsquo;s drama range. {VISITORS_FOOTNOTE}
        </p>
      </PageHero>

      <Section eyebrow="What you get" title="From a page view to a phone call." flush>
        <FeatureGrid items={FEATURES} />
      </Section>

      <Section eyebrow="How it works" title="Three steps, set up once." lede="Add the snippet, and the companies start appearing. Everything after that happens in the Decibel you already use." flush>
        <Steps items={STEPS} />
        <div className="border-t border-white-800 px-5 py-8 md:px-10">
          <CtaPair location="website_visitors_mid" size="default" />
        </div>
      </Section>

      <Section
        eyebrow="GDPR"
        title="Built to identify companies, never people."
        lede="Visitor identification only works for B2B if it respects the person browsing. These are the rules the feature is built on."
        flush
      >
        <div className="grid border-t border-white-800 md:grid-cols-2">
          {GDPR.map((g, i) => (
            <Reveal key={g.title} delay={i * 80} className={cn('border-b border-white-800 px-5 py-8 md:px-8', i % 2 === 0 && 'md:border-r')}>
              <p className="tabular-nums text-xs tracking-[0.06em] text-success-500">✓ {String(i + 1).padStart(2, '0')}</p>
              <h3 className="mt-3 text-lg font-medium tracking-[-0.03em] text-black-400">{g.title}</h3>
              <p className="mt-2 text-base leading-[23px] text-black-700">{g.body}</p>
            </Reveal>
          ))}
        </div>
        <div className="flex flex-col gap-6 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-10">
          <p className="max-w-[560px] text-base leading-[24px] text-black-700">
            The same lawful basis and data rules apply as everywhere else in Decibel.{' '}
            <Link href="/compliance" className="link">
              Read how compliance works
            </Link>
          </p>
          <AsciiBox lines={['visit  → company   ✓', 'person → never     ✓']} className="max-sm:hidden" />
        </div>
      </Section>

      <section className="rail px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          <Reveal>
            <p className="eyebrow">[ FAQ ]</p>
            <h2 className="t-h1 mt-4 text-black-400">Questions about website visitors.</h2>
          </Reveal>
          <Faq items={FAQS} />
        </div>
      </section>

      <Related
        links={[
          { href: '/features/verified-mobiles', label: 'Verified mobiles', blurb: 'UK and EU decision makers, one credit per mobile' },
          { href: '/features/power-dialler', label: 'Power dialler', blurb: 'Call down a list from your browser' },
          { href: '/compliance', label: 'Compliance', blurb: 'TPS, CTPS, GDPR and recording rules' },
        ]}
      />
      <CtaStrip location="website_visitors" />
    </>
  );
}

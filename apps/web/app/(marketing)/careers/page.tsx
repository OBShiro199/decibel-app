import type { Metadata } from 'next';
import { AsciiBox, CtaStrip, FeatureGrid, JsonLd, Related, Section, Steps, type Feature } from '@/components/marketing/page-kit';
import { CtaLink } from '@/components/marketing/analytics';
import { Reveal } from '@/components/marketing/daygent';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Careers',
  description: 'Decibel is hiring an enterprise account manager (£50,000–£70,000) and an SME account manager (£30,000–£50,000) in the UK. Early-stage and founder-led.',
  alternates: { canonical: '/careers' },
};

const EMAIL = 'oliver@usedecibel.com';
const applyHref = (role: string) => `mailto:${EMAIL}?subject=${encodeURIComponent(`Application: ${role}`)}`;
const gbp = (n: number) => `£${n.toLocaleString('en-GB')}`;

type Role = {
  id: string;
  title: string;
  min: number;
  max: number;
  summary: string;
  doing: string[];
  goodIf: string[];
};

const ROLES: Role[] = [
  {
    id: 'enterprise-account-manager',
    title: 'Enterprise account manager',
    min: 50000,
    max: 70000,
    summary:
      'You will own and grow our larger customer accounts: multi-seat outbound teams with several reps and a sales manager. You will run onboarding so each team is calling in its first week, then look after renewals and expansion as the team grows. You will work closely with the founder, and what you hear from customers will shape what we build next.',
    doing: [
      'Own a book of larger, multi-seat customer accounts from signature onwards',
      'Run onboarding: workspace set-up, list building, dialler training and compliance settings',
      'Lead renewals and spot where a team would benefit from more seats',
      'Hold regular reviews with sales managers using their own call and pipeline numbers',
      'Bring customer feedback back to the founder and help decide what gets built',
    ],
    goodIf: [
      'You have managed B2B SaaS accounts, ideally with sales or outbound teams as customers',
      'You are comfortable running a conversation with a head of sales or a managing director',
      'You like being close to the product and can explain it clearly to a new rep',
      'You are organised enough to own renewals without anyone chasing you',
    ],
  },
  {
    id: 'sme-account-manager',
    title: 'SME account manager',
    min: 30000,
    max: 50000,
    summary:
      'You will look after our small and mid-sized customers: founders who make their own calls and teams of a few reps. You will look after a high volume of accounts, so you will need to be quick, organised and good at helping people help themselves. Your job is to get each customer calling, keep them calling, and make renewal the obvious choice.',
    doing: [
      'Look after a large book of small and mid-sized accounts',
      'Onboard new customers, often in a single call, so they are dialling the same day',
      'Track adoption and reach out when a team stops calling or runs low on credits',
      'Handle renewals and straightforward upgrades',
      'Turn common questions into help articles and short guides',
    ],
    goodIf: [
      'You have worked in account management, customer success or sales, ideally in SaaS',
      'You enjoy a high volume of short, useful conversations',
      'You keep notes and follow-ups tidy without being reminded',
      'You explain things plainly and are happy on the phone',
    ],
  },
];

const HERE: Feature[] = [
  { tag: 'Early stage', title: 'Real ownership', body: 'There is no big team to hand things to. What you take on is yours, and you will see the effect of your work quickly.' },
  { tag: 'Founder-led', title: 'Work with the founder', body: 'You will work directly with the founder on customers, onboarding and what gets built next. Short lines, quick decisions.' },
  { tag: 'Honest', title: 'Early, and open about it', body: 'We are a young company. Things change quickly, processes are still being written, and you will help write them.' },
];

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': ROLES.map((r) => ({
    '@type': 'JobPosting',
    title: r.title,
    description: `<p>${r.summary}</p><p>What you'll do:</p><ul>${r.doing.map((d) => `<li>${d}</li>`).join('')}</ul><p>You'll be good at this if:</p><ul>${r.goodIf.map((d) => `<li>${d}</li>`).join('')}</ul>`,
    identifier: { '@type': 'PropertyValue', name: 'Decibel', value: r.id },
    datePosted: '2026-10-06',
    validThrough: '2027-01-06',
    employmentType: 'FULL_TIME',
    hiringOrganization: { '@type': 'Organization', name: 'Decibel', sameAs: 'https://www.usedecibel.com', logo: `${SITE_URL}/brand/android-chrome-512x512.png` },
    jobLocation: { '@type': 'Place', address: { '@type': 'PostalAddress', addressCountry: 'GB' } },
    baseSalary: { '@type': 'MonetaryAmount', currency: 'GBP', value: { '@type': 'QuantitativeValue', minValue: r.min, maxValue: r.max, unitText: 'YEAR' } },
    url: `${SITE_URL}/careers#${r.id}`,
  })),
};

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white-800 py-3 sm:border-b-0 sm:py-0">
      <dt className="tabular-nums text-xs tracking-[0.06em] text-faint">{label}</dt>
      <dd className="mt-1 text-base text-black-400">{value}</dd>
    </div>
  );
}

function List({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4 className="tabular-nums text-xs tracking-[0.06em] text-faint">{title}</h4>
      <ul className="mt-3 border-t border-white-800">
        {items.map((item) => (
          <li key={item} className="flex gap-3 border-b border-white-800 py-3 text-base leading-[22px] text-black-500">
            <span aria-hidden className="tabular-nums text-white-900">
              –
            </span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function CareersPage() {
  return (
    <>
      <JsonLd data={STRUCTURED_DATA} />

      {/* hero */}
      <section className="rail dotgrid relative overflow-hidden">
        <span className="pointer-events-none absolute left-5 top-5 tabular-nums text-xs tracking-[0.06em] text-faint max-md:hidden">[ United Kingdom ]</span>
        <span className="pointer-events-none absolute right-5 top-5 tabular-nums text-xs tracking-[0.06em] text-faint max-md:hidden">[ {ROLES.length} open roles ]</span>
        <div className="mx-auto max-w-[780px] px-5 pb-16 pt-16 text-center md:pb-20 md:pt-24">
          <Reveal eager>
            <p className="eyebrow">[ Careers ]</p>
          </Reveal>
          <Reveal eager delay={80}>
            <h1 className="t-display mx-auto mt-6 max-w-[760px] text-black-400">We&apos;re hiring two account managers.</h1>
          </Reveal>
          <Reveal eager delay={160}>
            <p className="mx-auto mt-5 max-w-[620px] text-md leading-[27px] text-black-700">
              Decibel is an early-stage, founder-led company building a contact search, browser dialler and pipeline for UK and EU outbound teams. We are looking
              for two people to look after our customers, from their first call onwards.
            </p>
          </Reveal>
          <Reveal eager delay={220}>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <CtaLink location="careers_roles" href="#roles" variant="primary" size="lg">
                See the roles
              </CtaLink>
              <CtaLink location="careers_email" href={`mailto:${EMAIL}?subject=${encodeURIComponent('Careers')}`} size="lg">
                Email the founder
              </CtaLink>
            </div>
          </Reveal>
        </div>
      </section>

      <Section eyebrow="Working here" title="Small, early and founder-led." flush>
        <FeatureGrid items={HERE} />
      </Section>

      {/* roles */}
      <section id="roles" className="rail">
        <div className="px-5 py-14 md:px-10 md:py-20">
          <Reveal className="max-w-[680px]">
            <p className="eyebrow">[ Open roles ]</p>
            <h2 className="t-h1 mt-4 text-black-400">Two roles, both full time.</h2>
            <p className="mt-4 text-md leading-[26px] text-black-700">Salaries are base pay, before tax. Apply by email with the role in the subject line.</p>
          </Reveal>
        </div>
        {ROLES.map((r, i) => (
          <article key={r.id} id={r.id} className="scroll-mt-24 border-t border-white-800 px-5 py-12 md:px-10 md:py-16">
            <Reveal>
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <h3 className="text-xl font-medium tracking-[-0.03em] text-black-400">{r.title}</h3>
                <span className="tabular-nums text-xs tracking-[0.06em] text-faint">{String(i + 1).padStart(2, '0')} / {String(ROLES.length).padStart(2, '0')}</span>
              </div>
              <dl className="mt-6 grid gap-0 rounded-[6px] border border-white-800 bg-white-100 px-5 py-2 sm:grid-cols-3 sm:gap-6 sm:py-4">
                <Meta label="Salary" value={`${gbp(r.min)}–${gbp(r.max)} base`} />
                <Meta label="Location" value="United Kingdom" />
                <Meta label="Type" value="Full time" />
              </dl>
              <p className="mt-6 max-w-[760px] text-md leading-[26px] text-black-700">{r.summary}</p>
              <div className="mt-8 grid gap-8 md:grid-cols-2 md:gap-10">
                <List title="What you'll do" items={r.doing} />
                <List title="You'll be good at this if" items={r.goodIf} />
              </div>
              <CtaLink location={`careers_apply_${r.id}`} href={applyHref(r.title)} variant="primary" className="mt-8">
                Apply for this role
              </CtaLink>
            </Reveal>
          </article>
        ))}
      </section>

      <Section eyebrow="How to apply" title="One email is enough." flush>
        <Steps
          items={[
            ['Email the founder', `Write to ${EMAIL} with the role in the subject line.`],
            ['Tell us a little', 'Attach a CV or a LinkedIn link, and a few lines on why the role appeals to you.'],
            ['Have a conversation', 'If it looks like a fit, we will set up a call with the founder to talk it through.'],
          ]}
        />
      </Section>

      {/* apply band */}
      <section className="rail dotgrid relative px-5 py-20 text-center md:py-24">
        <Reveal>
          <AsciiBox double lines={['to:      oliver@usedecibel.com', 'subject: <the role you want>']} className="max-sm:hidden" />
          <h2 className="t-h1 mx-auto mt-8 max-w-[640px] text-black-400">Apply by email.</h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {ROLES.map((r, i) => (
              <CtaLink key={r.id} location={`careers_band_${r.id}`} href={applyHref(r.title)} variant={i === 0 ? 'primary' : 'outline'} size="lg">
                {r.title}
              </CtaLink>
            ))}
          </div>
          <p className="mt-5 tabular-nums text-xs tracking-[0.06em] text-white-900">
            {EMAIL}
          </p>
        </Reveal>
      </section>

      <Related
        links={[
          { href: '/features', label: 'The product', blurb: 'What you would be looking after' },
          { href: '/industries', label: 'Who we serve', blurb: 'Sales, IT and recruitment teams' },
          { href: '/blog', label: 'Blog', blurb: 'Writing on outbound calling' },
        ]}
      />
      <CtaStrip location="careers" title="Want to see the product first? Try it for free." />
    </>
  );
}

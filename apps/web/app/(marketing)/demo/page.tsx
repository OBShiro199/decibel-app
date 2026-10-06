import type { Metadata } from 'next';
import { DemoForm } from '@/components/marketing/demo-form';
import { CtaLink } from '@/components/marketing/analytics';
import { AsciiBox, Checklist, SectionHead } from '@/components/marketing/page-kit';
import { Reveal } from '@/components/marketing/daygent';
import { FOUNDER } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Book a 15-minute demo',
  description: 'See Decibel on your own market in 15 minutes with the founder: verified UK and EU mobiles, the power dialler, recording and TPS screening.',
  alternates: { canonical: '/demo' },
};

const AGENDA = [
  'Your ideal customer, searched live: titles, seniority, company size and country',
  'Revealing mobiles and building a call list in a couple of clicks',
  'The power dialler: TPS and CTPS checks, recording notice, outcomes on keys 1 to 9',
  'How outcomes move your pipeline and what your dashboards show',
  'Pricing, fair use and what the free trial includes',
];

export default function DemoPage() {
  return (
    <section className="rail dotgrid">
      <div className="grid gap-12 px-5 py-16 md:grid-cols-[1fr_1.1fr] md:px-10 md:py-24">
        <div>
          <SectionHead eyebrow="Demo" title="Book a 15-minute demo with the founder.">
            No slides and no sales team. Oliver shows you Decibel on your own market, answers your questions and sets up your trial if you want one.
          </SectionHead>
          <Reveal delay={100}>
            <Checklist items={AGENDA} className="mt-8" />
            <div className="mt-8 flex items-center gap-3">
              {FOUNDER.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={FOUNDER.photo} alt="" width={44} height={44} className="h-11 w-11 rounded-[6px] object-cover" />
              ) : null}
              <div className="text-[13px] leading-5">
                <p className="font-medium text-black-400">Oliver Burt, founder</p>
                <p className="text-black-700">
                  Prefer to talk now?{' '}
                  <a href={`tel:${FOUNDER.phone}`} className="tabular-nums underline underline-offset-2">
                    {FOUNDER.phoneDisplay}
                  </a>{' '}
                  or{' '}
                  <a href={`mailto:${FOUNDER.email}`} className="underline underline-offset-2">
                    {FOUNDER.email}
                  </a>
                </p>
              </div>
            </div>
            <AsciiBox lines={['15 minutes  ·  your market  ·  your questions', 'no slides  ·  no sales team']} className="mt-10 max-sm:hidden" />
          </Reveal>
        </div>
        <Reveal eager delay={120}>
          <DemoForm />
          <div className="mt-6 flex flex-wrap items-center gap-3 text-[13px] text-black-700">
            <span>Rather try it yourself?</span>
            <CtaLink href="/signup" variant="primary" location="demo_page_trial">
              Start free trial
            </CtaLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

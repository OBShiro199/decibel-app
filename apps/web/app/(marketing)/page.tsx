import type { Metadata } from 'next';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { CtaLink, TrackView } from '@/components/marketing/analytics';
import { AsciiCanvas, Engine, HeroConsole, LivePill, Marquee, PipelinePanel, PricingCard, Reveal, RevealPanel, Status } from '@/components/marketing/daygent';
import { DemoButton } from '@/components/marketing/demo-dialog';
import { EuFlag, UkFlag } from '@/components/marketing/flags';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { LogoMarquee } from '@/components/marketing/logo-marquee';
import { showSocialProof } from '@/components/marketing/social-proof';
import { Testimonials } from '@/components/marketing/testimonials';

export const metadata: Metadata = {
  title: { absolute: 'Decibel · 1 million verified mobiles & the dialler to reach them all' },
  description: 'Search UK and EU decision makers, reveal a direct mobile for one credit and call it from your browser. TPS screening, call recording and a self-updating pipeline built in.',
};

const FAQS: FaqItem[] = [
  {
    question: 'Where does the data come from?',
    answer:
      'At launch the database contains sample data, clearly labelled as such in the product, while we onboard licensed UK and EU data sources. You can also import your own lists from day one.',
  },
  {
    question: 'Is cold calling legal in the UK?',
    answer:
      'Yes. B2B cold calling is lawful in the UK under PECR provided you screen numbers against the TPS and CTPS registers and honour opt-outs. Under UK GDPR the usual lawful basis is legitimate interest, supported by a documented assessment. Decibel enforces the screening and opt-out steps for you, but this is not legal advice and other countries have stricter rules.',
  },
  {
    question: 'Do I need my own Twilio?',
    answer: 'No. Calling is built in and each workspace gets its own number. You do not need a Twilio account, and call minutes are billed through Decibel at cost plus 20%.',
  },
  {
    question: 'Can I bring my own list?',
    answer: 'Yes. Import a CSV and we remove duplicates against what you already have. Every row is checked against TPS and CTPS, the same as contacts from our database.',
  },
  {
    question: 'Can I port my number?',
    answer: 'Number porting is not available at launch. You can verify your existing number and present it as your caller ID, so people you call see a number they can ring back.',
  },
];

function Head({ eyebrow, title, children, center }: { eyebrow: string; title: string; children?: React.ReactNode; center?: boolean }) {
  return (
    <Reveal className={center ? 'mx-auto max-w-[640px] text-center' : 'max-w-[640px]'}>
      <p className="eyebrow">[ {eyebrow} ]</p>
      <h2 className="t-h1 mt-4 text-black-400">{title}</h2>
      {children ? <p className="mt-4 text-md leading-[26px] text-black-700">{children}</p> : null}
    </Reveal>
  );
}

const Corner = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`pointer-events-none absolute tabular-nums text-xs tracking-[0.06em] text-faint max-md:hidden ${className}`}>{children}</span>
);

const PILLARS = [
  ['data', 'Data', 'Search UK and EU contacts, reveal the mobile.', 'Filter by title, seniority, size and country. A reveal costs one credit and the record is yours to keep.'],
  ['dialler', 'Dialler', 'Call from Chrome, every call recorded.', 'No desk phone and no telecoms setup. Each rep gets a number and a softphone that sits beside the record.'],
  ['pipeline', 'Pipeline', 'Lists, stages, notes, outcomes.', 'One click logs the outcome. The stage, the timeline and the follow-up task update on their own.'],
];

const STEPS = [
  ['01', 'Build a list from the database', 'Pick your ICP filters, select the matches and add them to a list. Mobiles are revealed as they are added.'],
  ['02', 'Click call', 'Decibel checks TPS, CTPS and your do-not-call list, then dials the mobile from your browser.'],
  ['03', 'Log the outcome and move on', 'Nine outcomes, keyboard 1 to 9. The next person in the queue is already under the cursor.'],
];

const CHECKS = [
  ['GDPR', 'Legitimate interest', 'Business contacts only, with a documented assessment you can download.'],
  ['PECR', 'TPS and CTPS screening', 'Listed numbers are blocked in code, in the browser and again on the server.'],
  ['ICO', 'Recording notice', 'The person you call hears the notice when they answer. Always, by rep, or never.'],
  ['Ofcom', 'One call at a time', 'A rep is on every call and a callable number is always presented.'],
];

export default function LandingPage() {
  return (
    <>
      <TrackView event="landing_view" />

      {/* hero */}
      <section className="rail dotgrid relative overflow-hidden">
        <Corner className="left-5 top-5">[ UK + EU ]</Corner>
        <Corner className="right-5 top-5">[ 1M+ verified mobiles* ]</Corner>
        <div className="mx-auto max-w-[760px] px-5 pb-12 pt-16 text-center md:pt-24">
          <Reveal eager>
            <LivePill>Unlimited calls &amp; mobile exports</LivePill>
          </Reveal>
          <Reveal eager delay={90}>
            <h1 className="t-display mx-auto mt-7 max-w-[720px] text-black-400">
              1 million verified{' '}
              <span className="inline-flex translate-y-[-0.08em] items-center gap-[0.12em] align-middle">
                <UkFlag className="flag-float h-[0.6em] w-[0.9em] rounded-[0.08em]" />
                <EuFlag className="flag-float flag-float-late h-[0.6em] w-[0.9em] rounded-[0.08em]" />
              </span>{' '}
              mobiles &amp; the dialler to reach them all.
            </h1>
          </Reveal>
          <Reveal eager delay={180}>
            <p className="mx-auto mt-5 max-w-[600px] text-md leading-[27px] text-black-700">
              Decibel lets you search UK and EU decision makers by title, seniority, company size and country, reveal a direct mobile for one
              credit and call it from your browser. Every outcome lands in your pipeline, with TPS screening and call recording built in.
            </p>
          </Reveal>
          <Reveal eager delay={270}>
            <div className="mx-auto mt-8 flex max-w-[280px] flex-col items-stretch justify-center gap-3 sm:max-w-none sm:flex-row sm:items-center">
              <CtaLink location="hero" href="/signup" variant="primary" size="lg">
                Start free trial
              </CtaLink>
              <DemoButton />
            </div>
            <p className="mt-5 tabular-nums text-xs tracking-[0.06em] text-white-900">14 days · 50 credits · no card</p>
          </Reveal>
        </div>
        <Reveal eager delay={200} className="relative mx-auto max-w-[980px] px-5 pb-16 md:pb-20">
          <HeroConsole />
        </Reveal>
        <Corner className="bottom-5 left-5">[ TPS screened ]</Corner>
        <Corner className="bottom-5 right-5">[ CSV in ]</Corner>
      </section>

      {/* customer logos (hidden on the live site until SOCIAL_PROOF_APPROVED) */}
      {showSocialProof ? (
        <section className="rail py-5">
          <p className="eyebrow text-center">[ Outbound teams calling with Decibel ]</p>
          <div className="mt-3">
            <LogoMarquee />
          </div>
        </section>
      ) : null}

      {/* three pillars */}
      <section id="product" className="rail">
        <div className="px-5 py-14 md:px-10 md:py-20">
          <Head eyebrow="The system" title="Everything between a name and a booked meeting.">
            Three tools that usually live in three tabs, built to work as one.
          </Head>
        </div>
        <div className="grid border-t border-white-800 md:grid-cols-3 md:grid-rows-[auto_auto]">
          {PILLARS.map(([id, label, pitch, body], i) => (
            <Reveal key={id} delay={i * 110} className={cn('grid min-w-0 grid-cols-[minmax(0,1fr)] grid-rows-[auto_auto] md:row-span-2 md:grid-rows-subgrid', i < 2 && 'border-b border-white-800 md:border-b-0 md:border-r')}>
              <div id={id === 'data' ? 'data' : undefined} className="px-5 pb-6 pt-8 md:px-8">
                <p className="eyebrow">[ {label} ]</p>
                <h3 className="mt-3 text-lg font-medium leading-[25px] tracking-[-0.03em] text-black-400">{pitch}</h3>
                <p className="mt-2 text-base leading-[23px] text-black-700">{body}</p>
              </div>
              <div className="border-t border-white-800">
                {id === 'data' ? (
                  <RevealPanel />
                ) : id === 'dialler' ? (
                  <div className="relative h-[258px] overflow-hidden bg-white-100">
                    <div className="absolute inset-x-0 bottom-0 top-12">
                      <AsciiCanvas scene="bars" color="#c4c4bf" cell={12} intensity={0.6} />
                    </div>
                    <span className="absolute left-5 top-4 flex w-[calc(100%-40px)] items-center justify-between">
                      <Status color="#c0462e">Recording</Status>
                      <span className="tabular-nums text-sm text-black-400">02:14</span>
                    </span>
                  </div>
                ) : (
                  <PipelinePanel />
                )}
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* marquee */}
      <section className="rail overflow-hidden">
        <Marquee rows={[['Search', 'Reveal', 'Dial', 'Connect', 'Book'], ['No answer', 'Voicemail', 'Call back', 'Meeting booked', 'Next']]} />
      </section>

      {/* the engine: light, contained, no scroll-jacking */}
      <Engine />

      {/* how it works */}
      <section className="rail">
        <div className="px-5 py-14 md:px-10 md:py-20">
          <Head eyebrow="How it works" title="Three steps, then repeat forty times a day." />
        </div>
        {STEPS.map(([n, title, body], i) => (
          <Reveal key={n} delay={i * 100}>
            <div className="flex flex-col gap-2 border-t border-white-800 px-5 py-7 md:flex-row md:items-baseline md:gap-10 md:px-10">
              <span className="w-12 tabular-nums text-sm tracking-[0.06em] text-white-900">{n}</span>
              <h3 className="text-lg font-medium tracking-[-0.03em] text-black-400 md:w-[340px]">{title}</h3>
              <p className="flex-1 text-base leading-[24px] text-black-700">{body}</p>
            </div>
          </Reveal>
        ))}
      </section>

      {/* customer stories (hidden on the live site until SOCIAL_PROOF_APPROVED) */}
      {showSocialProof ? (
        <section className="rail px-5 py-16 md:px-10 md:py-24">
          <Reveal>
            <Testimonials />
          </Reveal>
        </section>
      ) : null}

      {/* compliance */}
      <section className="rail">
        <div className="grid md:grid-cols-2">
          <div className="border-b border-white-800 px-5 py-14 md:border-b-0 md:border-r md:px-10 md:py-20">
            <Head eyebrow="Compliance" title="The rules are in the code, not in a PDF.">
              Decibel is built for UK and EU calling rules from the first dial. Data is hosted in the UK (Supabase eu-west-2, London).
            </Head>
            <Link href="/compliance" className="link mt-6 inline-block text-base">
              Read how compliance works
            </Link>
          </div>
          <div className="relative h-[300px] bg-white-100 md:h-auto">
            <AsciiCanvas scene="radar" />
            <span className="absolute left-4 top-4">
              <Status color="#2f6bff">Checking TPS</Status>
            </span>
            <span className="absolute bottom-4 right-4 tabular-nums text-xs tracking-[0.06em] text-faint">[ 1 blocked / 20 ]</span>
          </div>
        </div>
        <div className="grid border-t border-white-800 sm:grid-cols-2 lg:grid-cols-4">
          {CHECKS.map(([tag, title, body], i) => (
            <Reveal key={tag} delay={i * 90} className="border-b border-white-800 px-5 py-7 last:border-b-0 sm:border-r md:px-8 lg:border-b-0 lg:last:border-r-0">
              <p className="tabular-nums text-xs tracking-[0.06em] text-success-500">✓ {tag}</p>
              <h3 className="mt-3 text-md font-medium tracking-[-0.02em] text-black-400">{title}</h3>
              <p className="mt-1.5 text-base leading-[22px] text-black-700">{body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="rail px-5 py-14 md:px-10 md:py-20">
        <Head eyebrow="Pricing" title="Per seat. Credits included.">
          A credit is one mobile reveal. A contact you have revealed stays free for your workspace.
        </Head>
        <Reveal delay={120} className="mt-10">
          <PricingCard />
        </Reveal>
      </section>

      {/* faq */}
      <section className="rail px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          <Head eyebrow="FAQ" title="Questions before you dial." />
          <Faq items={FAQS} />
        </div>
      </section>

      {/* final cta */}
      <section className="rail dotgrid relative px-5 py-20 text-center md:py-28">
        <Corner className="left-5 top-5">[ 50 credits ]</Corner>
        <Corner className="right-5 top-5">[ 60 minutes ]</Corner>
        <Reveal>
          <p className="eyebrow">[ Start ]</p>
          <h2 className="t-display mx-auto mt-4 max-w-[640px] text-black-400">Your first 50 calls are on us.</h2>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <CtaLink location="final" href="/signup" variant="primary" size="lg">
              Start free trial
            </CtaLink>
            <CtaLink location="final_login" href="/login" size="lg">
              Log in
            </CtaLink>
          </div>
        </Reveal>
        <p className="mx-auto mt-12 max-w-[560px] tabular-nums text-xs leading-[17px] tracking-[0.06em] text-faint">
          * 1M+ verified mobiles is our launch target, not a current count. The product ships with labelled sample data while licensed sources are onboarded.
        </p>
      </section>
    </>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { AsciiCanvas, Console, Reveal, Status } from '@/components/marketing/daygent';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { ASCII_FONT, CtaPair, CtaStrip, FeatureGrid, JsonLd, PageHero, Related, Section, Split, Steps } from '@/components/marketing/page-kit';
import { FAIR_USE_MINUTES, FAIR_USE_NOTE, OUTCOMES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Power dialler for UK sales teams',
  description:
    'Call down a list from your browser with a UK number per seat, TPS and CTPS screening on every dial, autosaved notes and outcomes on keys 1–9.',
  alternates: { canonical: '/features/power-dialler' },
};

const RUN = [
  ['Oliver Hartley', 'Brightmoor Software', 'Meeting booked', 'done'],
  ['Priya Raman', 'Harrow & Finch', 'No answer', 'done'],
  ['James Whitfield', 'Northgate Logistics', 'In call · 02:14', 'live'],
  ['Sarah Okafor', 'Pennine Precision', 'Next', 'queued'],
  ['Fiona MacLeod', 'Thistle Financial', 'TPS listed · skipped', 'blocked'],
  ['Tom Bradshaw', 'Cobalt Digital', 'Queued', 'queued'],
] as const;

function DiallerMock() {
  return (
    <Console file="run · Head of Ops, Yorkshire" right={<Status color="#c0462e">Recording</Status>}>
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <ul className="border-b border-rule tabular-nums text-xs md:border-b-0 md:border-r">
          <li className="flex h-9 items-center justify-between border-b border-rule px-4 text-faint">
            <span>Call 14 of 60</span>
            <span>Resume any time</span>
          </li>
          {RUN.map(([name, company, label, state], i) => (
            <li key={name} className={cn('flex h-[50px] items-center gap-3 border-b border-rule px-4 last:border-b-0', state === 'live' && 'bg-panel')}>
              <span className="w-5 text-faint">{String(i + 12).padStart(2, '0')}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-sans text-sm font-medium text-black-400">{name}</span>
                <span className="block truncate text-white-900">{company}</span>
              </span>
              <span
                className={cn(
                  'shrink-0 text-right tracking-[0.06em]',
                  state === 'live' ? 'text-accent-500' : state === 'done' ? 'text-success-500' : state === 'blocked' ? 'text-danger-500' : 'text-faint',
                )}
              >
                {label}
              </span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col">
          <div className="border-b border-rule px-5 py-4">
            <p className="font-sans text-md font-medium text-black-400">James Whitfield</p>
            <p className="tabular-nums text-xs text-white-900">Operations Director · Northgate Logistics · +44 7700 900103</p>
          </div>
          <div className="flex-1 border-b border-rule px-5 py-4">
            <p className="tabular-nums text-xs tracking-[0.06em] text-faint">Notes · saved</p>
            <p className="mt-2 text-sm leading-[21px] text-black-700">
              Runs three depots, renewing fleet telematics in Q1. Wants pricing for 40 vehicles. Prefers a call after 4pm.
              <span className="ml-0.5 inline-block h-3.5 w-px translate-y-0.5 bg-black-400" aria-hidden />
            </p>
          </div>
          <div className="grid grid-cols-3 gap-px bg-rule">
            {OUTCOMES.map((o, i) => (
              <span key={o.value} className={cn('flex h-9 items-center gap-2 bg-white-100 px-3 tabular-nums text-xs', o.value === 'meeting_booked' ? 'text-black-400' : 'text-black-700')}>
                <span className="text-faint">{i + 1}</span>
                <span className="truncate">{o.label}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </Console>
  );
}

const FEATURES = [
  { tag: 'Browser', title: 'A softphone in Chrome', body: 'No desk phone, phone system or telecoms account. The dialler sits beside the record you are reading.' },
  { tag: 'Number', title: 'A UK number per seat', body: 'Every rep presents a real number people can ring back. You can also verify an existing number and present that.' },
  { tag: 'Runs', title: 'Back to back, then resume', body: 'Start a run on a list and the next contact is ready as soon as you log the last. Stop for lunch and pick up where you left off.' },
  { tag: 'Notes', title: 'Notes that save themselves', body: 'Type while you talk. Notes autosave to the contact, so nothing is lost when the next call starts.' },
  { tag: 'Keys', title: 'Nine outcomes on keys 1–9', body: 'Log the result with one key press. Outcomes move the pipeline stage and create follow-up tasks.' },
  { tag: 'Screening', title: 'Checked before every dial', body: 'TPS, CTPS and your workspace do-not-call list are checked on the server before the call is placed.' },
];

const STEPS: [string, string][] = [
  ['Pick a list', 'Use a list built from search, a CSV you imported, or the Today queue of callbacks.'],
  ['Start the run', 'Decibel screens the first number and dials it from your browser. Blocked numbers are skipped and the reason is shown.'],
  ['Talk and take notes', 'The record, notes and call history are on screen. The call is recorded, with the notice played on answer if your policy says so.'],
  ['Press a key to log it', 'One of nine outcomes on keys 1 to 9. A callback goes into the Today queue; do not call goes onto your workspace list.'],
  ['Next contact', 'The next person in the list is up. Pause whenever you like; the run remembers where you were.'],
];

const POWER_ASCII = [
  'power  (Decibel)        predictive',
  '',
  'rep ──► call 1          dials 3 ──► 1 connected',
  '  logs, calls 2                 ──► 2 silence',
  '  logs, calls 3                 ──► 3 abandoned',
];

const FAQS: FaqItem[] = [
  {
    question: 'Is it really unlimited?',
    answer: `Calls from the browser dialler are unlimited, subject to fair use: ${FAIR_USE_MINUTES.toLocaleString('en-GB')} call minutes per seat each month, then minutes at cost.`,
  },
  {
    question: 'Is this a predictive dialler?',
    answer: 'No. Decibel dials one number at a time for each rep, so there is always a person on the line when someone answers. There are no abandoned or silent calls.',
  },
  {
    question: 'Do I need Twilio or a phone system?',
    answer: 'No. Calling is built in and each seat gets a UK number. You only need Chrome or another modern browser and a headset.',
  },
  {
    question: 'What happens when a number is on the TPS?',
    answer: 'The call is blocked before it is placed and the rep sees why. The check runs on our servers, so it cannot be skipped from the browser.',
  },
];

export default function PowerDiallerPage() {
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
        eyebrow="Power dialler"
        location="power_dialler_hero"
        corners={['One call at a time', 'UK number per seat']}
        title="Call down a list from your browser, one after another."
        lede="Start a run and Decibel dials each contact in turn, screening every number first. Notes save as you type, one key logs the outcome, and the next call is ready."
      >
        <DiallerMock />
      </PageHero>

      <Section eyebrow="What you get" title="Built for a morning of calls." flush>
        <FeatureGrid items={FEATURES} />
      </Section>

      <Section eyebrow="A run" title="From list to logged in five steps." flush>
        <Steps items={STEPS} />
      </Section>

      <Split
        reverse
        visual={
          <div className="relative flex h-full min-h-[300px] flex-col justify-center overflow-hidden px-5 py-10 md:px-10">
            <div className="absolute inset-0 opacity-40">
              <AsciiCanvas scene="bars" color="#c4c4bf" cell={12} intensity={0.45} />
            </div>
            <pre
              aria-hidden
              className="relative select-none overflow-hidden whitespace-pre rounded-[6px] border border-white-800 bg-white-100 p-4 text-[12px] leading-[20px] text-black-700"
              style={{ fontFamily: ASCII_FONT }}
            >
              {POWER_ASCII.join('\n')}
            </pre>
          </div>
        }
      >
        <Reveal>
          <p className="eyebrow">[ Ofcom ]</p>
          <h2 className="t-h1 mt-4 text-black-400">Power, not predictive.</h2>
          <p className="mt-4 text-md leading-[26px] text-black-700">
            Predictive diallers ring several numbers per rep and drop the extras, which is how people end up answering to silence. Decibel places one call at
            a time for each rep, so a person is always there when someone picks up, and a callable caller ID is always presented.
          </p>
          <Link href="/compliance" className="link mt-6 inline-block text-base">
            How compliance works
          </Link>
        </Reveal>
      </Split>

      <section className="rail">
        <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="border-b border-white-800 px-5 py-14 md:border-b-0 md:border-r md:px-10 md:py-20">
            <Reveal>
              <p className="eyebrow">[ Minutes ]</p>
              <h2 className="t-h1 mt-4 text-black-400">Unlimited calls from the browser.*</h2>
              <p className="mt-4 text-md leading-[26px] text-black-700">
                Calling is included with every seat. There is no per-minute meter to watch for ordinary use, and no separate telecoms bill.
              </p>
              <p className="mt-5 tabular-nums text-xs leading-[17px] tracking-[0.06em] text-faint">
                {FAIR_USE_NOTE}{' '}
                <Link href="/fair-use" className="link">
                  Fair use policy
                </Link>
              </p>
            </Reveal>
          </div>
          <div className="flex flex-col justify-center px-5 py-14 md:px-10 md:py-20">
            <Reveal delay={100}>
              <p className="text-md leading-[26px] text-black-700">Try it on your own list: the free trial includes 60 minutes of calling and one seat.</p>
              <CtaPair location="power_dialler_mid" size="default" className="mt-6" />
            </Reveal>
          </div>
        </div>
      </section>

      <section className="rail px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          <Reveal>
            <p className="eyebrow">[ FAQ ]</p>
            <h2 className="t-h1 mt-4 text-black-400">Questions about calling.</h2>
          </Reveal>
          <Faq items={FAQS} />
        </div>
      </section>

      <Related
        links={[
          { href: '/features/call-recording', label: 'Call recording', blurb: 'Every call recorded, with the notice handled' },
          { href: '/features/pipeline', label: 'Lists and pipeline', blurb: 'Outcomes move deals on their own' },
          { href: '/compliance', label: 'Compliance', blurb: 'TPS, CTPS, GDPR and recording rules' },
        ]}
      />
      <CtaStrip location="power_dialler" />
    </>
  );
}

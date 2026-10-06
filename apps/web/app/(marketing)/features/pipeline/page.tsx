import type { Metadata } from 'next';
import Link from 'next/link';
import { Console, Reveal, Status } from '@/components/marketing/daygent';
import { ASCII_FONT, Checklist, CtaPair, CtaStrip, FeatureGrid, PageHero, Related, Section, Split, Steps } from '@/components/marketing/page-kit';
import { OUTCOMES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Lists and a sales pipeline that updates itself',
  description:
    'Build lists from search or CSV, call them and let each outcome move the stage, create the follow-up task and fill the Today queue. Export any time.',
  alternates: { canonical: '/features/pipeline' },
};

const BOARD: { stage: string; count: number; cards: { name: string; company: string; tag: string }[] }[] = [
  {
    stage: 'Attempted',
    count: 31,
    cards: [
      { name: 'Priya Raman', company: 'Harrow & Finch', tag: 'No answer · retry Thu' },
      { name: 'Tom Bradshaw', company: 'Cobalt Digital', tag: 'Voicemail' },
    ],
  },
  {
    stage: 'Connected',
    count: 17,
    cards: [
      { name: 'Sarah Okafor', company: 'Pennine Precision', tag: 'Call back · 16:00' },
      { name: 'Rahul Mehta', company: 'Northgate Logistics', tag: 'Connected' },
    ],
  },
  {
    stage: 'Meeting booked',
    count: 9,
    cards: [
      { name: 'James Whitfield', company: 'Northgate Logistics', tag: 'Thu 10:30' },
      { name: 'Oliver Hartley', company: 'Brightmoor Software', tag: 'Fri 14:00' },
    ],
  },
];

function BoardMock() {
  return (
    <Console file="pipeline · Q4 Yorkshire ops" right={<Status>Updated by outcomes</Status>}>
      <div className="overflow-x-auto">
        <div className="grid min-w-[640px] grid-cols-3">
          {BOARD.map((col, i) => (
            <div key={col.stage} className={cn('px-4 py-4', i < 2 && 'border-r border-rule')}>
              <p className="flex items-center justify-between tabular-nums text-xs tracking-[0.06em]">
                <span className="text-black-500">{col.stage}</span>
                <span className="text-faint">{col.count}</span>
              </p>
              <div className="mt-3 space-y-2">
                {col.cards.map((c) => (
                  <div key={c.name} className="rounded-[6px] border border-white-800 bg-white-100 px-3 py-2.5 text-left">
                    <p className="truncate font-sans text-sm font-medium text-black-400">{c.name}</p>
                    <p className="truncate tabular-nums text-xs text-white-900">{c.company}</p>
                    <span className="mt-2 inline-flex rounded-[4px] bg-white-300 px-1.5 py-0.5 tabular-nums text-xs text-black-700">{c.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </Console>
  );
}

const LISTS = [
  { tag: 'Search', title: 'Lists from the database', body: 'Select the people who match your filters and add them to a list. Mobiles are revealed as they are added.' },
  { tag: 'CSV in', title: 'Import your own', body: 'Upload a CSV and Decibel removes duplicates against what you already have. Every row is screened against TPS and CTPS.' },
  { tag: 'CSV out', title: 'Export whenever you like', body: 'Download any list as a CSV for your CRM or a spreadsheet.' },
];

// What each outcome does to the stage (mirrors call_outcome_to_stage in migration 0003).
const EFFECTS: Record<string, string> = {
  connected: 'moves to Connected',
  no_answer: 'moves to Attempted',
  voicemail: 'moves to Attempted',
  busy: 'moves to Attempted',
  wrong_number: 'moves to Wrong number',
  meeting_booked: 'moves to Meeting booked',
  not_interested: 'moves to Not interested',
  call_back: 'Attempted, plus a callback task',
  do_not_call: 'Not interested, plus your DNC list',
};

const TODAY: [string, string][] = [
  ['Callbacks first', 'Every “call back” you logged lands in the Today queue on the day it is due.'],
  ['Follow-up tasks', 'Outcomes create the next task for you, so nothing depends on someone remembering.'],
  ['Call straight from the queue', 'Start a power dialler run on Today and work through it back to back.'],
];

const STAGE_ASCII = [
  'New            ████████████████████░  42',
  'Attempted      ███████████████░░░░░░  31',
  'Connected      ████████░░░░░░░░░░░░░  17',
  'Meeting booked ████░░░░░░░░░░░░░░░░░   9',
  'Qualified      ██░░░░░░░░░░░░░░░░░░░   5',
  'Won            █░░░░░░░░░░░░░░░░░░░░   2',
];

export default function PipelinePage() {
  return (
    <>
      <PageHero
        eyebrow="Lists and pipeline"
        location="pipeline_hero"
        corners={['Keys 1–9', 'CSV in / CSV out']}
        title="A pipeline that keeps itself up to date."
        lede="Build a list, call it from the dialler and log each call with one key. The outcome moves the stage, creates the follow-up and fills the Today queue, so the board is right without anyone dragging cards."
      >
        <BoardMock />
      </PageHero>

      <Section eyebrow="Lists" title="Lists from search, from a CSV, or both." lede="A list is where a run starts. Mix contacts from the database with your own imports in the same place." flush>
        <FeatureGrid items={LISTS} />
      </Section>

      <Split
        visual={
          <div className="flex h-full flex-col justify-center px-5 py-10 md:px-10">
            <p className="tabular-nums text-xs tracking-[0.06em] text-faint">[ Keys 1–9 ]</p>
            <ul className="mt-4 border-t border-white-800">
              {OUTCOMES.map((o, i) => (
                <li key={o.value} className="flex items-baseline gap-3 border-b border-white-800 py-2 tabular-nums text-xs">
                  <span className="w-4 text-faint">{i + 1}</span>
                  <span className="w-[110px] shrink-0 text-black-400">{o.label}</span>
                  <span className="truncate text-black-700">{EFFECTS[o.value]}</span>
                </li>
              ))}
            </ul>
          </div>
        }
      >
        <Reveal>
          <p className="eyebrow">[ Outcomes ]</p>
          <h2 className="t-h1 mt-4 text-black-400">One key logs the call and moves the deal.</h2>
          <p className="mt-4 text-md leading-[26px] text-black-700">
            Nine outcomes, on keys 1 to 9. Each one writes to the contact&rsquo;s timeline and, where it should, moves the pipeline stage and creates a
            follow-up task. Reps stay in the dialler; the board catches up on its own.
          </p>
          <Checklist className="mt-8" items={['Notes autosave to the contact as you type', 'Recordings attach to the call record', 'Do not call takes effect for the whole workspace at once']} />
        </Reveal>
      </Split>

      <Section eyebrow="Today" title="A queue that tells reps who to call next." lede="Each morning the Today queue holds the callbacks and follow-ups that are due, so the day starts with the warmest conversations." flush>
        <Steps items={TODAY} />
      </Section>

      <section className="rail">
        <div className="grid md:grid-cols-2">
          <div className="border-b border-white-800 px-5 py-14 md:border-b-0 md:border-r md:px-10 md:py-20">
            <Reveal>
              <p className="eyebrow">[ Dashboards ]</p>
              <h2 className="t-h1 mt-4 text-black-400">Per-rep dashboards, no reporting chores.</h2>
              <p className="mt-4 text-md leading-[26px] text-black-700">
                Because outcomes are logged on every call, the numbers are already there: calls, connections and meetings for each rep, and how the pipeline
                is moving. Need it elsewhere? Export a CSV or{' '}
                <Link href="/integrations" className="link">
                  connect your tools
                </Link>
                .
              </p>
              <CtaPair location="pipeline_mid" size="default" className="mt-8" />
            </Reveal>
          </div>
          <div className="flex items-center bg-white-100 px-5 py-12 md:px-10">
            <Reveal delay={100} className="w-full">
              <p className="tabular-nums text-xs tracking-[0.06em] text-faint">[ Stages · sample ]</p>
              <pre aria-hidden className="mt-4 select-none overflow-hidden whitespace-pre text-[12px] leading-[24px] text-black-700" style={{ fontFamily: ASCII_FONT }}>
                {STAGE_ASCII.join('\n')}
              </pre>
            </Reveal>
          </div>
        </div>
      </section>

      <Related
        links={[
          { href: '/features/power-dialler', label: 'Power dialler', blurb: 'Call down a list from your browser' },
          { href: '/integrations', label: 'Integrations', blurb: 'CRMs, Zapier, webhooks and CSV' },
          { href: '/features/verified-mobiles', label: 'Verified mobiles', blurb: 'UK and EU decision makers, one credit per mobile' },
        ]}
      />
      <CtaStrip location="pipeline" />
    </>
  );
}

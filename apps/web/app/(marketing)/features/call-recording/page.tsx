import type { Metadata } from 'next';
import Link from 'next/link';
import { Console, Reveal, Status } from '@/components/marketing/daygent';
import { Faq, type FaqItem } from '@/components/marketing/faq';
import { ASCII_FONT, AsciiBox, CtaPair, CtaStrip, FeatureGrid, JsonLd, PageHero, Related, Section, Steps } from '@/components/marketing/page-kit';
import { PRO } from '@/lib/constants';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'Call recording with the recording notice handled',
  description:
    'Every Decibel dialler call is recorded, kept for a year and playable on the call record. The callee hears the notice on answer: always, per rep or never.',
  alternates: { canonical: '/features/call-recording' },
};

// A fixed waveform so the server render is stable: heights 1–8, drawn with block characters.
const WAVE = [2, 3, 5, 4, 6, 8, 5, 3, 2, 4, 6, 7, 5, 4, 3, 5, 7, 8, 6, 4, 2, 3, 4, 6, 5, 3, 2, 2, 4, 5, 7, 6, 4, 3, 2, 3, 5, 6, 4, 2, 3, 4, 3, 2];
const BLOCKS = ' ▁▂▃▄▅▆▇█';
const PLAYED = 17;

function RecordingMock() {
  return (
    <Console file="call · James Whitfield" right={<Status color="#1d9d5b">Meeting booked</Status>}>
      <div className="grid grid-cols-[minmax(0,1fr)] md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="border-b border-rule px-5 py-5 md:border-b-0 md:border-r">
          <div className="flex items-center justify-between tabular-nums text-xs text-faint">
            <span>Tue 6 Oct · 10:42 · outbound</span>
            <span>Kept until Oct next year</span>
          </div>
          <p aria-hidden className="mt-5 select-none overflow-hidden whitespace-nowrap text-[18px] leading-none tracking-[0.04em]" style={{ fontFamily: ASCII_FONT }}>
            <span className="text-black-400">{WAVE.slice(0, PLAYED).map((h) => BLOCKS[h]).join('')}</span>
            <span className="text-white-800">{WAVE.slice(PLAYED).map((h) => BLOCKS[h]).join('')}</span>
          </p>
          <div className="mt-4 flex items-center gap-3 tabular-nums text-xs">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white-800 text-black-400" aria-hidden>
              ❚❚
            </span>
            <span className="text-black-400">02:14</span>
            <span className="h-px flex-1 bg-white-800">
              <span className="block h-px w-[39%] bg-black-400" />
            </span>
            <span className="text-faint">05:46</span>
            <span className="text-faint">1×</span>
          </div>
          <p className="mt-5 tabular-nums text-xs tracking-[0.06em] text-success-500">✓ Recording notice played on answer</p>
        </div>
        <div className="px-5 py-5">
          <p className="tabular-nums text-xs tracking-[0.06em] text-faint">Notes</p>
          <p className="mt-2 text-sm leading-[21px] text-black-700">Fleet telematics renewal in Q1, 40 vehicles. Demo booked Thursday 10:30 with the finance lead joining.</p>
          <p className="mt-5 tabular-nums text-xs tracking-[0.06em] text-faint">Timeline</p>
          <ul className="mt-2 space-y-1.5 tabular-nums text-xs text-black-700">
            <li>10:48 · Stage moved to Meeting booked</li>
            <li>10:48 · Task: send pricing before Thursday</li>
            <li className="text-faint">Mon · No answer</li>
          </ul>
        </div>
      </div>
    </Console>
  );
}

const FEATURES = [
  { tag: 'Automatic', title: 'Every call, every rep', body: 'Calls from the dialler are recorded without anyone pressing a button, so there are no gaps in the record.' },
  { tag: 'On the record', title: 'Playable where you need it', body: 'Recordings sit on the call record beside the notes, the outcome and the timeline. Open the contact and press play.' },
  { tag: PRO.recordings, title: `Kept for ${PRO.recordings}`, body: `Recordings are stored for ${PRO.recordings} on ${PRO.name}, then deleted. Data is hosted in the UK, in London.` },
  { tag: 'ICO', title: 'The notice is handled', body: 'The person you call hears a recording notice when they answer, before the conversation starts.' },
  { tag: 'Policy', title: 'Set once by an admin', body: 'Choose always, the rep’s choice per call, or never. The setting applies across the workspace.' },
  { tag: 'Coaching', title: 'Listen with context', body: 'Per-rep dashboards show who called whom and what happened, so a manager can pick the calls worth reviewing.' },
];

const POLICIES: { name: string; body: string; note?: string }[] = [
  { name: 'Always', body: 'A recording announcement plays at the start of every answered call.', note: 'Recommended' },
  { name: 'Rep’s choice', body: 'The rep decides per call, for example when they will tell the person themselves.' },
  { name: 'Never', body: 'No automatic announcement. You are responsible for telling people another way.' },
];

const COACH: [string, string][] = [
  ['Open the rep’s dashboard', 'See the week’s calls, connections and outcomes for each person on the team.'],
  ['Pick the calls that matter', 'Find the meeting that was booked, or the deal that slipped, and open the call record.'],
  ['Play it beside the notes', 'Hear what was said while reading what the rep wrote down and which outcome they chose.'],
];

const FAQS: FaqItem[] = [
  {
    question: 'Is it legal to record sales calls in the UK?',
    answer:
      'Businesses can record calls, but the people on the call should be told. Decibel plays a notice on answer when your policy is set to always, which is our recommendation. This is product guidance, not legal advice.',
  },
  {
    question: 'How long are recordings kept?',
    answer: `${PRO.recordings[0].toUpperCase()}${PRO.recordings.slice(1)} on ${PRO.name}, and 90 days during a free trial. After that they are deleted. Recordings are stored in the UK.`,
  },
  {
    question: 'Do I need separate recording software?',
    answer: 'No. Recording is built into the browser dialler. There is nothing to install and no separate recording service to pay for.',
  },
];

export default function CallRecordingPage() {
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
        eyebrow="Call recording"
        location="call_recording_hero"
        corners={['Notice on answer', `Kept ${PRO.recordings}`]}
        title="Every call recorded, with the notice handled."
        lede={`Calls from the Decibel dialler are recorded automatically and kept for ${PRO.recordings}. The person you call hears the notice when they answer, and the recording is waiting on the call record.`}
      >
        <RecordingMock />
      </PageHero>

      <Section eyebrow="What you get" title="Recordings that are where you look for them." flush>
        <FeatureGrid items={FEATURES} />
      </Section>

      <Section
        eyebrow="Recording notice"
        title="Three policies, one setting."
        lede="Workspace admins choose how people are told a call is recorded. The notice plays for the callee when they answer, not while it rings."
        flush
      >
        <div className="grid border-t border-white-800 md:grid-cols-3">
          {POLICIES.map((p, i) => (
            <Reveal key={p.name} delay={i * 80} className={cn('border-b border-white-800 px-5 py-8 md:px-8', i < 2 && 'md:border-r')}>
              <p className="flex items-center justify-between tabular-nums text-xs tracking-[0.06em]">
                <span className="text-faint">{String(i + 1).padStart(2, '0')}</span>
                {p.note ? <span className="rounded-[4px] border border-white-800 bg-white-100 px-2 py-0.5 text-success-500">{p.note}</span> : null}
              </p>
              <h3 className="mt-4 text-lg font-medium tracking-[-0.03em] text-black-400">{p.name}</h3>
              <p className="mt-2 text-base leading-[23px] text-black-700">{p.body}</p>
            </Reveal>
          ))}
        </div>
        <div className="flex flex-col gap-6 px-5 py-8 md:flex-row md:items-center md:justify-between md:px-10">
          <p className="max-w-[560px] text-base leading-[24px] text-black-700">
            We recommend &ldquo;Always&rdquo; unless you have taken advice on your own approach.{' '}
            <Link href="/compliance" className="link">
              Read how compliance works
            </Link>
          </p>
          <AsciiBox lines={['♪ “This call may be recorded', '   for training and quality.”']} className="max-sm:hidden" />
        </div>
      </Section>

      <Section eyebrow="Coaching" title="Review the calls that matter." lede="Recordings are most useful next to the numbers. Managers go from a rep’s dashboard straight to the call they want to hear." flush>
        <Steps items={COACH} />
        <div className="border-t border-white-800 px-5 py-8 md:px-10">
          <CtaPair location="call_recording_mid" size="default" />
        </div>
      </Section>

      <section className="rail px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          <Reveal>
            <p className="eyebrow">[ FAQ ]</p>
            <h2 className="t-h1 mt-4 text-black-400">Questions about recording.</h2>
          </Reveal>
          <Faq items={FAQS} />
        </div>
      </section>

      <Related
        links={[
          { href: '/features/power-dialler', label: 'Power dialler', blurb: 'Call down a list from your browser' },
          { href: '/compliance', label: 'Compliance', blurb: 'TPS, CTPS, GDPR and recording rules' },
          { href: '/features/pipeline', label: 'Lists and pipeline', blurb: 'Outcomes move deals on their own' },
        ]}
      />
      <CtaStrip location="call_recording" />
    </>
  );
}

// Website visitor identification: a line of script on the customer's site; business visits are matched
// from the IP address to the company (never to the person), and the decision makers at that company come
// from Decibel's own B2B database, ready to reveal and call. The landing-page section lives here, and the
// mock feed is shared with /features/website-visitors. Every company and person below is fictional, and
// every number is in Ofcom's drama range (+44 7700 900xxx).
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Console, Reveal, Status } from './daygent';
import { ASCII_FONT, CtaPair } from './page-kit';

/** Honesty note: the feature is announced before it is live (see the marketing site rules). */
export const VISITORS_FOOTNOTE = 'Website visitor identification is coming soon. It will be included in Pro at no extra cost.';

type Visit = { company: string; domain: string; industry: string; town: string; pages: string[]; visits: number; when: string };

export const VISITS: Visit[] = [
  { company: 'Northgate Logistics', domain: 'northgatelogistics.co.uk', industry: 'Logistics', town: 'Leeds', pages: ['/pricing', '/features/power-dialler'], visits: 3, when: '10:42' },
  { company: 'Halden & Rowe', domain: 'haldenrowe.co.uk', industry: 'Legal services', town: 'Manchester', pages: ['/compliance'], visits: 1, when: '10:31' },
  { company: 'Brightwater Analytics', domain: 'brightwateranalytics.com', industry: 'Software', town: 'London', pages: ['/pricing', '/vs', '/demo'], visits: 2, when: '09:58' },
  { company: 'Kestrel Facilities Group', domain: 'kestrelfacilities.co.uk', industry: 'Facilities', town: 'Bristol', pages: ['/features/verified-mobiles'], visits: 1, when: '09:12' },
];

const PEOPLE = [
  { name: 'Sarah Linton', title: 'Operations Director', phone: '+44 7700 900•••' },
  { name: 'Marcus Feld', title: 'Chief Executive Officer', phone: '+44 7700 900•••' },
  { name: 'Priya Desai', title: 'Head of Commercial', phone: '+44 7700 900•••' },
];

/** The visitor feed: companies that visited today, and the decision makers at the first one. */
export function VisitorFeed({ compact, className }: { compact?: boolean; className?: string }) {
  const visits = compact ? VISITS.slice(0, 3) : VISITS;
  return (
    <Console file="website visitors · today" right={<Status color="#5f86e0">Live</Status>} className={className}>
      <div className={cn('grid grid-cols-[minmax(0,1fr)]', !compact && 'md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]')}>
        <div className={cn(!compact && 'border-b border-rule md:border-b-0 md:border-r')}>
          {visits.map((v, i) => (
            <div key={v.domain} className={cn('flex items-start justify-between gap-4 border-b border-rule px-5 py-3.5 last:border-b-0', i === 0 && 'bg-white-300')}>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-black-400">{v.company}</p>
                <p className="truncate tabular-nums text-xs text-white-900">
                  {v.industry} · {v.town} · {v.domain}
                </p>
                <p className="mt-1 truncate tabular-nums text-xs text-black-700">
                  {v.pages.join('  ')}
                  {v.visits > 1 ? <span className="text-faint"> · {v.visits} visits this week</span> : null}
                </p>
              </div>
              <span className="shrink-0 tabular-nums text-xs text-faint">{v.when}</span>
            </div>
          ))}
        </div>
        {compact ? null : (
          <div className="px-5 py-4">
            <p className="tabular-nums text-xs tracking-[0.06em] text-faint">Decision makers at Northgate Logistics</p>
            <ul className="mt-3 space-y-3">
              {PEOPLE.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-black-400">{p.name}</span>
                    <span className="block truncate text-xs text-white-900">{p.title}</span>
                  </span>
                  <span className="shrink-0 rounded-[4px] border border-white-800 px-2 py-0.5 tabular-nums text-xs text-black-700">{p.phone}</span>
                </li>
              ))}
            </ul>
            <p className="mt-4 tabular-nums text-xs tracking-[0.06em] text-success-500">✓ Company matched from a business network</p>
            <p className="mt-1 tabular-nums text-xs tracking-[0.06em] text-faint">The visitor themselves is never identified</p>
          </div>
        )}
      </div>
    </Console>
  );
}

// ---- landing-page section: the chain from an anonymous visit to the people worth calling -------------

/** Page views as the snippet sees them: the network decides whether a visit can be matched at all. */
const HITS: { time: string; path: string; network: string; matched: boolean }[] = [
  { time: '10:42:07', path: '/pricing', network: 'Business network', matched: true },
  { time: '10:42:31', path: '/features/power-dialler', network: 'Business network', matched: true },
  { time: '10:43:02', path: '/pricing', network: 'Business network', matched: true },
  { time: '10:43:40', path: '/blog/tps-explained', network: 'Home broadband', matched: false },
  { time: '10:44:15', path: '/demo', network: 'Business network', matched: true },
];

/** Where the company's attention went this week, for the intent bar. */
const INTENT: { label: string; views: number }[] = [
  { label: 'Pricing', views: 4 },
  { label: 'Power dialler', views: 2 },
  { label: 'Demo', views: 1 },
];

const GUARANTEES = ['One line of script', 'Business networks only', 'Visitors never identified', 'Included in Pro'];

function Stage({ n, title, meta, caption, children, delay, last }: { n: string; title: string; meta: string; caption: string; children: React.ReactNode; delay: number; last?: boolean }) {
  return (
    <Reveal delay={delay} className={cn('relative flex min-w-0 flex-col justify-between border-b border-white-800 md:border-b-0', !last && 'md:border-r')}>
      <div className="flex items-baseline justify-between gap-3 px-5 pt-7 md:px-7">
        <p className="text-sm text-black-400">
          <span className="tabular-nums text-faint">{n}</span> &nbsp;{title}
        </p>
        <p className="text-xs text-faint">{meta}</p>
      </div>
      <div className="flex-1 px-5 py-5 md:px-7">{children}</div>
      {/* captions line up across the three stages: room for three lines at every desktop width */}
      <p className="border-t border-white-800 px-5 py-4 text-sm leading-[20px] text-black-700 md:min-h-[113px] md:px-7 lg:min-h-[93px]">{caption}</p>
      {/* the hand-off to the next stage, sitting on the divider */}
      {last ? null : (
        <span
          aria-hidden
          className="absolute z-[1] flex h-7 w-7 items-center justify-center border border-white-800 bg-white-100 text-sm text-black-700 max-md:-bottom-3.5 max-md:left-1/2 max-md:-translate-x-1/2 max-md:rotate-90 md:-right-3.5 md:top-[46%]"
          style={{ fontFamily: ASCII_FONT }}
        >
          →
        </span>
      )}
    </Reveal>
  );
}

/** Landing-page section: website visitor identification, told as visit → company → decision makers. */
export function WebsiteVisitorsSection() {
  const maxViews = Math.max(...INTENT.map((x) => x.views));
  return (
    <section id="visitors" className="rail">
      <div className="mx-auto max-w-[760px] px-5 pb-12 pt-14 text-center md:pb-14 md:pt-20">
        <Reveal>
          <p className="eyebrow">[ Website visitors ]</p>
          <h2 className="t-h1 mx-auto mt-4 max-w-[640px] text-black-400">Someone at Northgate Logistics is reading your pricing page.</h2>
          <p className="mx-auto mt-4 max-w-[600px] text-md leading-[26px] text-black-700">
            Decibel turns anonymous business visits into the company behind them, and the company into the people you should call. The visitor
            themselves is never identified.
          </p>
        </Reveal>
      </div>

      <div className="grid border-t border-white-800 bg-white-100 md:grid-cols-3">
        <Stage
          n="01"
          title="Visit"
          meta="From your website"
          delay={0}
          caption="Your snippet sees each page view and the network it came from. Home and mobile connections are dropped straight away."
        >
          <ul className="space-y-2.5">
            {HITS.map((h) => (
              <li key={h.time} className={cn('flex items-center gap-3 text-sm', !h.matched && 'opacity-60')}>
                <span className="w-[62px] shrink-0 tabular-nums text-xs text-faint">{h.time}</span>
                <span className={cn('min-w-0 flex-1 truncate', h.matched ? 'text-black-400' : 'text-black-700 line-through decoration-white-900')}>{h.path}</span>
                <span className={cn('tag shrink-0', h.matched ? 'tag-0' : 'tag-7')}>{h.matched ? 'Business' : 'Ignored'}</span>
              </li>
            ))}
          </ul>
        </Stage>

        <Stage
          n="02"
          title="Company"
          meta="Matched"
          delay={120}
          caption="The business network is matched to the company that owns it. Nothing about the person browsing is kept."
        >
          <div className="flex items-center gap-3">
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center border border-white-800 text-sm font-medium text-black-400">
              NL
            </span>
            <div className="min-w-0">
              <p className="truncate text-md font-medium tracking-[-0.02em] text-black-400">Northgate Logistics</p>
              <p className="truncate text-xs text-white-900">northgatelogistics.co.uk</p>
            </div>
          </div>
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-white-800 pt-4 text-sm">
            {[
              ['Industry', 'Logistics'],
              ['Size', '201–500'],
              ['Based in', 'Leeds'],
            ].map(([k, v]) => (
              <div key={k} className="min-w-0">
                <dt className="text-xs text-faint">{k}</dt>
                <dd className="mt-0.5 truncate text-black-400">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 border-t border-white-800 pt-4">
            <p className="flex items-baseline justify-between text-xs">
              <span className="text-faint">Reading this week</span>
              <span className="tabular-nums text-black-700">3 visits · 7 pages</span>
            </p>
            <ul className="mt-2.5 space-y-2">
              {INTENT.map((x) => (
                <li key={x.label} className="grid grid-cols-[96px_1fr_16px] items-center gap-3 text-xs">
                  <span className="truncate text-black-700">{x.label}</span>
                  <span className="h-1.5 bg-[#edf2fd]">
                    <span className="block h-full bg-[#5f86e0]" style={{ width: `${(x.views / maxViews) * 100}%` }} />
                  </span>
                  <span className="text-right tabular-nums text-black-400">{x.views}</span>
                </li>
              ))}
            </ul>
          </div>
        </Stage>

        <Stage
          n="03"
          title="Decision makers"
          meta="From Decibel’s data"
          delay={240}
          last
          caption="The people who decide come from Decibel’s B2B data. Reveal a mobile for one credit and call from the browser."
        >
          <ul className="divide-y divide-white-800">
            {PEOPLE.map((p, i) => (
              <li key={p.name} className="flex items-center justify-between gap-3 py-2.5 first:pt-0">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-black-400">{p.name}</span>
                  <span className="block truncate text-xs text-white-900">{i === 0 ? '+44 7700 900214' : p.title}</span>
                </span>
                {i === 0 ? (
                  <span className="shrink-0 border border-black-400 px-2.5 py-1 text-xs text-black-400">Call</span>
                ) : (
                  <span className="shrink-0 border border-white-800 px-2.5 py-1 text-xs text-black-700">Reveal · 1 credit</span>
                )}
              </li>
            ))}
          </ul>
        </Stage>
      </div>

      <div className="flex flex-col gap-6 border-t border-white-800 px-5 py-7 md:px-10 lg:flex-row lg:items-center lg:justify-between">
        <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-black-500">
          {GUARANTEES.map((g) => (
            <li key={g} className="flex items-center gap-2">
              <span aria-hidden className="text-success-500">
                ✓
              </span>
              {g}
            </li>
          ))}
        </ul>
        <div className="flex shrink-0 flex-wrap items-center gap-5">
          <Link href="/features/website-visitors" className="link text-base">
            How it works
          </Link>
          <CtaPair location="landing_visitors" size="default" />
        </div>
      </div>
      <p className="border-t border-white-800 px-5 py-3 tabular-nums text-xs tracking-[0.06em] text-faint md:px-10">
        Fictional company and people shown. Numbers are from Ofcom&rsquo;s drama range. {VISITORS_FOOTNOTE}
      </p>
    </section>
  );
}

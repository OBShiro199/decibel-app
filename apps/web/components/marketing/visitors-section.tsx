// Website visitor identification: a line of script on the customer's site; business visits are matched
// from the IP address to the company (never to the person), and the decision makers at that company come
// from Decibel's own B2B database, ready to reveal and call. The landing-page section lives here, and the
// mock feed is shared with /features/website-visitors. Every company and person below is fictional, and
// every number is in Ofcom's drama range (+44 7700 900xxx).
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Console, Reveal, Status } from './daygent';
import { ASCII_FONT, CtaPair, SectionHead } from './page-kit';

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

const POINTS = [
  'One line of script on your website',
  'See the companies visiting, and which pages they read',
  'Reveal the decision makers there, then call from the browser',
  'Companies, not people: built for GDPR',
  'Included in Pro at no extra cost',
];

/** Landing-page section: website visitor identification. */
export function WebsiteVisitorsSection() {
  return (
    <section id="visitors" className="rail">
      <div className="grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-b border-white-800 px-5 py-14 md:border-b-0 md:border-r md:px-10 md:py-20">
          <SectionHead eyebrow="Website visitors" title="See which companies visit your website.">
            Decibel matches business visits to the company behind them, then shows you the decision makers at that company with verified mobiles. You
            call the people who matter while the interest is fresh. The visitor stays anonymous.
          </SectionHead>
          <Reveal delay={100}>
            <ul className="mt-8 border-t border-white-800">
              {POINTS.map((p) => (
                <li key={p} className="flex gap-3 border-b border-white-800 py-3 text-base text-black-500">
                  <span aria-hidden className="text-success-500">
                    ✓
                  </span>
                  {p}
                </li>
              ))}
            </ul>
            <Link href="/features/website-visitors" className="link mt-6 inline-block text-base">
              How website visitor identification works
            </Link>
            <CtaPair location="landing_visitors" size="default" className="mt-6" />
          </Reveal>
        </div>
        <div className="relative bg-white-100 px-5 py-10 md:px-8 md:py-14">
          <pre
            aria-hidden
            className="pointer-events-none absolute right-5 top-5 select-none text-[11px] leading-[14px] text-white-800 max-md:hidden"
            style={{ fontFamily: ASCII_FONT }}
          >
            {' [www]\n   |\n  (@)'}
          </pre>
          <Reveal delay={150}>
            <p className="tabular-nums text-xs tracking-[0.06em] text-faint">[ Website visitors · sample feed ]</p>
            <VisitorFeed className="mt-4" />
            <p className="mt-3 tabular-nums text-xs tracking-[0.06em] text-faint">
              Fictional companies and people shown. Numbers are from Ofcom&rsquo;s drama range. {VISITORS_FOOTNOTE}
            </p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

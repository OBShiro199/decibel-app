// Local businesses: map-style listings (category, town, rating, hours, website) with
// numbers and emails checked for validity. The landing-page section lives here, and the
// mock table is shared with /local-businesses. Every business below is fictional and every
// number is in Ofcom's drama range (+44 7700 900xxx).
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Reveal } from './daygent';
import { LOCAL_FOOTNOTE, ASCII_FONT, CtaPair, SectionHead } from './page-kit';

export type LocalBusiness = {
  name: string;
  category: string;
  town: string;
  rating: number;
  reviews: number;
  hours: string;
  open: boolean;
  website: string | null;
  phone: string;
  email: string | null;
};

export const LOCAL_BUSINESSES: LocalBusiness[] = [
  {
    name: 'Larkspur Plumbing & Heating',
    category: 'Plumber',
    town: 'Harrogate',
    rating: 4.8,
    reviews: 126,
    hours: 'Open · until 18:00',
    open: true,
    website: 'larkspurheating.co.uk',
    phone: '+44 7700 900231',
    email: 'hello@larkspurheating.co.uk',
  },
  {
    name: 'The Copper Kettle Tearoom',
    category: 'Café',
    town: 'Hebden Bridge',
    rating: 4.6,
    reviews: 312,
    hours: 'Open · until 16:00',
    open: true,
    website: null,
    phone: '+44 7700 900232',
    email: null,
  },
  {
    name: 'Fernhill Dental Studio',
    category: 'Dentist',
    town: 'Shrewsbury',
    rating: 4.9,
    reviews: 88,
    hours: 'Open · until 17:30',
    open: true,
    website: 'fernhilldentalstudio.co.uk',
    phone: '+44 7700 900233',
    email: 'reception@fernhilldentalstudio.co.uk',
  },
  {
    name: 'Ashgrove Auto Repairs',
    category: 'Garage',
    town: 'Didcot',
    rating: 4.3,
    reviews: 41,
    hours: 'Closed · opens 08:00',
    open: false,
    website: null,
    phone: '+44 7700 900234',
    email: null,
  },
  {
    name: 'Bramble & Birch Florist',
    category: 'Florist',
    town: 'Ludlow',
    rating: 4.7,
    reviews: 63,
    hours: 'Open · until 17:00',
    open: true,
    website: 'brambleandbirchludlow.co.uk',
    phone: '+44 7700 900235',
    email: 'orders@brambleandbirchludlow.co.uk',
  },
];

/** Five stars drawn as text, filled to the nearest whole star. */
function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span aria-hidden className="tracking-[0.02em]">
      <span className="text-[#5f86e0]">{'★'.repeat(full)}</span>
      <span className="text-white-800">{'★'.repeat(5 - full)}</span>
    </span>
  );
}

/**
 * The mock results table. `compact` drops the hours, website and email columns (landing section);
 * `selected` ticks rows to show the "select, add to list" step.
 */
export function LocalBusinessTable({ compact, selected = [], className }: { compact?: boolean; selected?: number[]; className?: string }) {
  const head = 'h-9 px-3 text-left font-normal text-xs tracking-[0.06em] text-faint';
  const cell = 'px-3 py-3 align-top';
  return (
    <div className={cn('overflow-x-auto', className)}>
      <table className={cn('w-full border-collapse tabular-nums text-xs text-black-700', compact ? 'min-w-[420px]' : 'min-w-[860px]')}>
        <caption className="sr-only">Sample local business listings (fictional)</caption>
        <thead>
          <tr className="border-b border-white-800">
            {selected.length ? <th className={cn(head, 'w-8')} aria-label="Selected" /> : null}
            <th className={head}>Business</th>
            <th className={head}>Rating</th>
            {compact ? null : <th className={head}>Hours</th>}
            {compact ? null : <th className={head}>Website</th>}
            <th className={head}>Phone</th>
            {compact ? null : <th className={head}>Email</th>}
          </tr>
        </thead>
        <tbody>
          {LOCAL_BUSINESSES.map((b, i) => {
            const on = selected.includes(i);
            return (
              <tr key={b.name} className={cn('border-b border-white-800 last:border-b-0', on && 'bg-white-300')}>
                {selected.length ? (
                  <td className={cell}>
                    <span
                      aria-label={on ? 'Selected' : 'Not selected'}
                      className={cn('inline-flex h-3.5 w-3.5 items-center justify-center rounded-[3px] border text-xs leading-none', on ? 'border-black-400 bg-black-400 text-white-100' : 'border-white-900')}
                    >
                      {on ? '✓' : ''}
                    </span>
                  </td>
                ) : null}
                <td className={cell}>
                  <span className="block whitespace-nowrap font-sans text-sm font-medium text-black-400">{b.name}</span>
                  <span className="block whitespace-nowrap text-white-900">
                    {b.category} · {b.town}
                  </span>
                </td>
                <td className={cn(cell, 'whitespace-nowrap')}>
                  <span className="block text-black-400">{b.rating.toFixed(1)}</span>
                  <span className="block text-white-900">
                    <Stars rating={b.rating} /> {b.reviews}
                  </span>
                </td>
                {compact ? null : (
                  <td className={cn(cell, 'whitespace-nowrap', b.open ? 'text-success-500' : 'text-white-900')}>{b.hours}</td>
                )}
                {compact ? null : (
                  <td className={cn(cell, 'whitespace-nowrap')}>{b.website ? <span className="text-black-500">{b.website}</span> : <span className="text-faint">No website</span>}</td>
                )}
                <td className={cn(cell, 'whitespace-nowrap')}>
                  <span className="block text-black-400">{b.phone}</span>
                  <span className="block text-success-500">✓ Valid mobile</span>
                </td>
                {compact ? null : (
                  <td className={cn(cell, 'whitespace-nowrap')}>
                    {b.email ? (
                      <>
                        <span className="block text-black-500">{b.email}</span>
                        <span className="block text-success-500">✓ Checked</span>
                      </>
                    ) : (
                      <span className="block text-faint">No email listed</span>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Filter chips as they appear above the results. */
export function LocalFilterChips({ className }: { className?: string }) {
  const chips = ['Category: plumber, café, dentist…', 'Town: Harrogate', 'Rating 4.0+', '40+ reviews', 'No website', 'Open now'];
  return (
    <ul className={cn('flex flex-wrap gap-2', className)} aria-label="Example filters">
      {chips.map((c) => (
        <li key={c} className="inline-flex h-7 items-center rounded-[4px] border border-white-800 bg-white-100 px-2.5 text-xs tracking-[0.02em] text-black-500">
          {c}
        </li>
      ))}
    </ul>
  );
}

const POINTS = [
  'Phone numbers and emails, checked for validity',
  'Star ratings and review counts',
  'Opening hours, website, category and town',
  'TPS and CTPS screening on every dial',
];

/** Landing-page section: local business listings. The lead places this on the landing page. */
export function LocalBusinessesSection() {
  return (
    <section id="local" className="rail">
      <div className="grid md:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <div className="border-b border-white-800 px-5 py-14 md:border-b-0 md:border-r md:px-10 md:py-20">
          <SectionHead eyebrow="Local businesses" title="Local businesses too, with numbers that are checked.">
            Find the kind of listings you see on Google Maps, with verified phone numbers and emails, ratings and reviews, and opening hours. Every
            number is checked for validity, then screened against TPS and CTPS when you dial.
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
            <Link href="/local-businesses" className="link mt-6 inline-block text-base">
              Explore local businesses
            </Link>
            <CtaPair location="landing_local" size="default" className="mt-6" />
          </Reveal>
        </div>
        <div className="relative bg-white-100 px-5 py-10 md:px-8 md:py-14">
          <pre
            aria-hidden
            className="pointer-events-none absolute right-5 top-5 select-none text-[11px] leading-[14px] text-white-800 max-md:hidden"
            style={{ fontFamily: ASCII_FONT }}
          >
            {'  .-.\n (   )\n  `+´\n   |'}
          </pre>
          <Reveal delay={150}>
            <p className="tabular-nums text-xs tracking-[0.06em] text-faint">[ Local search · sample listings ]</p>
            <LocalFilterChips className="mt-4" />
            <div className="mt-5 overflow-hidden rounded-[6px] border border-white-800 bg-white-100">
              <LocalBusinessTable compact />
            </div>
            <p className="mt-3 tabular-nums text-xs tracking-[0.06em] text-faint">Fictional businesses shown. Numbers are from Ofcom&rsquo;s drama range. {LOCAL_FOOTNOTE}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

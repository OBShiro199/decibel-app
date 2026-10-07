// Building blocks for the marketing sub-pages (features, industries, comparisons, careers...).
// They follow the landing page: bordered "rail" sections, [ bracketed ] eyebrows, Geist with
// close tracking, quiet ASCII accents, and every page ends on the trial + demo pair.
import Link from 'next/link';
import { TRIAL_CREDITS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { CtaLink } from './analytics';
import { Reveal } from './daygent';

/** The two actions every page offers: the free trial and a 15-minute demo with the founder. */
export function CtaPair({ location, className, size = 'lg' }: { location: string; className?: string; size?: 'lg' | 'default' }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-3', className)}>
      <CtaLink location={`${location}_trial`} href="/signup" variant="primary" size={size}>
        Start free trial
      </CtaLink>
      <CtaLink location={`${location}_demo`} href="/demo" size={size}>
        Book a 15-min demo
      </CtaLink>
    </div>
  );
}

export const TRIAL_LINE = `14 days · ${TRIAL_CREDITS.toLocaleString('en-GB')} credits · no card`;

const Corner = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`pointer-events-none absolute tabular-nums text-xs tracking-[0.06em] text-faint max-md:hidden ${className}`}>{children}</span>
);

/** Page hero: eyebrow, h1, lede, the trial + demo pair, optional corner labels and a visual below. */
export function PageHero({
  eyebrow,
  title,
  lede,
  location,
  corners,
  children,
}: {
  eyebrow: string;
  title: React.ReactNode;
  lede: React.ReactNode;
  /** analytics label for the CTAs, e.g. "vs_cognism" */
  location: string;
  corners?: [string, string];
  /** a visual under the CTAs (mock, ASCII, table) */
  children?: React.ReactNode;
}) {
  return (
    <section className="rail dotgrid relative overflow-hidden">
      {corners ? (
        <>
          <Corner className="left-5 top-5">[ {corners[0]} ]</Corner>
          <Corner className="right-5 top-5">[ {corners[1]} ]</Corner>
        </>
      ) : null}
      <div className="mx-auto max-w-[780px] px-5 pb-14 pt-16 text-center md:pb-16 md:pt-24">
        <Reveal eager>
          <p className="eyebrow">[ {eyebrow} ]</p>
        </Reveal>
        <Reveal eager delay={80}>
          <h1 className="t-display mx-auto mt-6 max-w-[760px] text-black-400">{title}</h1>
        </Reveal>
        <Reveal eager delay={160}>
          <p className="mx-auto mt-5 max-w-[620px] text-md leading-[27px] text-black-700">{lede}</p>
        </Reveal>
        <Reveal eager delay={220}>
          <CtaPair location={location} className="mt-8 justify-center" />
          <p className="mt-5 tabular-nums text-xs tracking-[0.06em] text-white-900">{TRIAL_LINE}</p>
        </Reveal>
      </div>
      {children ? (
        <Reveal eager delay={280} className="mx-auto max-w-[980px] px-5 pb-16 md:pb-20">
          {children}
        </Reveal>
      ) : null}
    </section>
  );
}

/** Section heading, as on the landing page. */
export function SectionHead({ eyebrow, title, children, center }: { eyebrow: string; title: string; children?: React.ReactNode; center?: boolean }) {
  return (
    <Reveal className={center ? 'mx-auto max-w-[640px] text-center' : 'max-w-[680px]'}>
      <p className="eyebrow">[ {eyebrow} ]</p>
      <h2 className="t-h1 mt-4 text-black-400">{title}</h2>
      {children ? <p className="mt-4 text-md leading-[26px] text-black-700">{children}</p> : null}
    </Reveal>
  );
}

/** A bordered section with a heading; put grids, steps or prose inside. */
export function Section({
  eyebrow,
  title,
  lede,
  id,
  children,
  flush,
}: {
  eyebrow: string;
  title: string;
  lede?: React.ReactNode;
  id?: string;
  children?: React.ReactNode;
  /** children run edge to edge under the heading (grids, steps) instead of inside the padding */
  flush?: boolean;
}) {
  return (
    <section id={id} className="rail">
      <div className="px-5 py-14 md:px-10 md:py-20">
        <SectionHead eyebrow={eyebrow} title={title}>
          {lede}
        </SectionHead>
        {!flush && children ? <div className="mt-10">{children}</div> : null}
      </div>
      {flush ? children : null}
    </section>
  );
}

export type Feature = { tag: string; title: string; body: React.ReactNode };

/** Bordered grid of short points: tag, title, sentence. */
export function FeatureGrid({ items, cols = 3 }: { items: Feature[]; cols?: 2 | 3 | 4 }) {
  const grid = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[cols];
  return (
    <div className={cn('grid border-t border-white-800', grid)}>
      {items.map((f, i) => (
        <Reveal key={f.title} delay={(i % cols) * 80} className="border-b border-white-800 px-5 py-7 sm:border-r md:px-8">
          <p className="tabular-nums text-xs tracking-[0.06em] text-success-500">✓ {f.tag}</p>
          <h3 className="mt-3 text-md font-medium tracking-[-0.02em] text-black-400">{f.title}</h3>
          <p className="mt-1.5 text-base leading-[23px] text-black-700">{f.body}</p>
        </Reveal>
      ))}
    </div>
  );
}

/** Numbered rows: 01 / title / explanation. */
export function Steps({ items }: { items: [string, string][] }) {
  return (
    <div>
      {items.map(([title, body], i) => (
        <Reveal key={title} delay={i * 80}>
          <div className="flex flex-col gap-2 border-t border-white-800 px-5 py-7 md:flex-row md:items-baseline md:gap-10 md:px-10">
            <span className="w-12 tabular-nums text-sm tracking-[0.06em] text-white-900">{String(i + 1).padStart(2, '0')}</span>
            <h3 className="text-lg font-medium tracking-[-0.03em] text-black-400 md:w-[340px]">{title}</h3>
            <p className="flex-1 text-base leading-[24px] text-black-700">{body}</p>
          </div>
        </Reveal>
      ))}
    </div>
  );
}

/** Ticked list. */
export function Checklist({ items, className }: { items: React.ReactNode[]; className?: string }) {
  return (
    <ul className={cn('border-t border-white-800', className)}>
      {items.map((item, i) => (
        <li key={i} className="flex gap-3 border-b border-white-800 py-3.5 text-base text-black-500">
          <span className="tabular-nums text-success-500" aria-hidden>
            ✓
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** Text left, visual right (stacks on mobile). */
export function Split({ children, visual, reverse }: { children: React.ReactNode; visual: React.ReactNode; reverse?: boolean }) {
  return (
    <section className="rail">
      <div className="grid md:grid-cols-2">
        <div className={cn('border-b border-white-800 px-5 py-14 md:border-b-0 md:px-10 md:py-20', reverse ? 'md:order-2 md:border-l' : 'md:border-r')}>{children}</div>
        <div className="relative min-h-[280px] bg-white-100">{visual}</div>
      </div>
    </section>
  );
}

/** ASCII art needs a true monospace face to line up; this is the only place the site uses one. */
export const ASCII_FONT = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace";

/**
 * An ASCII box drawn around lines of text, e.g.
 *   ┌────────────────────────┐
 *   │  ► Start free trial    │
 *   └────────────────────────┘
 * Purely decorative (aria-hidden); the real links sit beside it.
 */
export function AsciiBox({ lines, className, double }: { lines: string[]; className?: string; double?: boolean }) {
  const width = Math.max(...lines.map((l) => l.length)) + 4;
  const [tl, tr, bl, br, h, v] = double ? ['╔', '╗', '╚', '╝', '═', '║'] : ['┌', '┐', '└', '┘', '─', '│'];
  const art = [tl + h.repeat(width) + tr, ...lines.map((l) => `${v}  ${l.padEnd(width - 2)}${v}`), bl + h.repeat(width) + br].join('\n');
  return (
    // decorative: hidden on phones, where a fixed-width box would not fit
    <pre aria-hidden className={cn('inline-block select-none whitespace-pre text-left text-[12px] leading-[17px] text-white-900 max-sm:hidden', className)} style={{ fontFamily: ASCII_FONT }}>
      {art}
    </pre>
  );
}

/** The closing band on every page: ASCII box, headline, trial + demo pair. */
export function CtaStrip({ title = 'See Decibel on your own leads this week.', location, note }: { title?: string; location: string; note?: React.ReactNode }) {
  return (
    <section className="rail dotgrid relative px-5 py-20 text-center md:py-24">
      <Reveal>
        <AsciiBox lines={['► Start your 14-day free trial, no card', '► Or book a 15-minute demo with the founder']} className="max-sm:hidden" />
        <h2 className="t-h1 mx-auto mt-8 max-w-[640px] text-black-400">{title}</h2>
        <CtaPair location={`${location}_footer`} className="mt-8 justify-center" />
        <p className="mt-5 tabular-nums text-xs tracking-[0.06em] text-white-900">{TRIAL_LINE}</p>
        {note ? <p className="mx-auto mt-10 max-w-[600px] tabular-nums text-xs leading-[17px] tracking-[0.06em] text-faint">{note}</p> : null}
      </Reveal>
    </section>
  );
}

/** The sample-data footnote required wherever the database size is mentioned. */
export const DATA_FOOTNOTE = '* 1M+ verified mobiles is our launch target, not a current count. The product ships with labelled sample data while licensed sources are onboarded.';

/** The same honesty note for local business listings, which are also sample data at launch. */
export const LOCAL_FOOTNOTE = 'Local business search ships with labelled sample listings while licensed data sources are onboarded.';

/** Small "Related" link list for the bottom of pages. */
export function Related({ links }: { links: { href: string; label: string; blurb?: string }[] }) {
  return (
    <section className="rail">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="group border-b border-white-800 px-5 py-6 transition-colors hover:bg-white-100 sm:border-r md:px-8">
            <span className="flex items-center justify-between text-md font-medium tracking-[-0.02em] text-black-400">
              {l.label}
              <span className="tabular-nums text-xs text-faint transition-transform group-hover:translate-x-0.5">→</span>
            </span>
            {l.blurb ? <span className="mt-1 block text-base text-black-700">{l.blurb}</span> : null}
          </Link>
        ))}
      </div>
    </section>
  );
}

/** JSON-LD for search engines. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

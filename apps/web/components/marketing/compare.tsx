// Shared pieces for the comparison pages (/vs, /vs/cognism, /vs/lusha, /vs/kaspr).
// Competitor facts live in the pages themselves, each with its source URL in the SourcesNote.
// Keep comparisons fair and verifiable (CAP Code 3.33–3.44): like-for-like, attributed, no knocking copy.
import Link from 'next/link';
import type { FaqItem } from './faq';
import { cn } from '@/lib/utils';
import { FAIR_USE_NOTE, PRO, TRIAL_CREDITS } from '@/lib/constants';
import { SITE_URL } from '@/lib/site';
import { Reveal } from './daygent';
import { ASCII_FONT, AsciiBox, CtaPair, TRIAL_LINE } from './page-kit';

/** The date competitor details were last checked against their public websites. */
export const CHECKED_ON = '6 October 2026';

const n = (v: number) => v.toLocaleString('en-GB');

/** FAIR_USE_NOTE without its leading asterisk, for running text. */
export const FAIR_USE_TEXT = FAIR_USE_NOTE.replace(/^\*/, '');

/** Decibel's side of every table, from lib/constants so prices never drift. */
export const DECIBEL = {
  focus: 'UK and EU decision makers, built for calling mobiles',
  pricing: `One plan: £${PRO.monthly} per seat per month, or £${n(PRO.annual)} per seat per year (ex VAT)`,
  mobiles: `${n(PRO.credits)} verified mobile reveals per seat per month (1 credit = 1 reveal)`,
  data: '1M+ verified mobiles* (launch target; labelled sample data today)',
  dialler: 'Built in: browser and power dialler, a UK number per seat, unlimited calls (fair use)',
  pipeline: 'Built in: lists, stages, call outcomes and per-rep dashboards',
  recording: `Every call recorded, kept ${PRO.recordings}`,
  screening: 'TPS and CTPS checked on every dial, server-side',
  crm: 'CSV import and export today; native CRM integrations coming soon',
  extension: 'Web app; no extension needed',
  intent: 'No',
  trial: `14-day free trial: 1 seat, ${n(TRIAL_CREDITS)} credits, 60 minutes, no card`,
  bestFor: 'Small UK and EU teams (roughly 1–20 reps) whose main channel is calling mobiles',
} as const;

export type CompareRow = { label: string; cells: React.ReactNode[] };

/**
 * Comparison table. The first column is the row label; `highlight` (default 0, Decibel) gets a
 * faint fill. Scrolls sideways on small screens with the label column pinned.
 */
export function CompareTable({ columns, rows, caption, highlight = 0 }: { columns: string[]; rows: CompareRow[]; caption: string; highlight?: number }) {
  const minW = columns.length > 2 ? 'min-w-[880px]' : 'min-w-[600px]';
  return (
    <div className="overflow-x-auto border-t border-white-800">
      <table className={cn('w-full border-collapse text-left', minW)}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-white-800">
            <th scope="col" className="sticky left-0 z-10 h-12 w-[170px] bg-white-100 px-5 font-normal md:px-8">
              <span className="tabular-nums text-xs tracking-[0.06em] text-faint" style={{ fontFamily: ASCII_FONT }} aria-hidden>
                ┌─
              </span>
            </th>
            {columns.map((c, i) => (
              <th
                key={c}
                scope="col"
                className={cn(
                  'h-12 border-l border-white-800 px-5 text-sm font-medium tracking-[-0.01em]',
                  i === highlight ? 'bg-white-300 text-black-400' : 'text-black-500',
                )}
              >
                {i === highlight ? <span className="mr-1.5 tabular-nums text-success-500" aria-hidden>●</span> : null}
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-white-800 last:border-b-0">
              <th scope="row" className="sticky left-0 z-10 bg-white-100 px-5 py-4 align-top font-normal md:px-8">
                <span className="tabular-nums text-xs tracking-[0.06em] text-white-900">{r.label}</span>
              </th>
              {r.cells.map((cell, i) => (
                <td
                  key={i}
                  className={cn(
                    'border-l border-white-800 px-5 py-4 align-top text-sm leading-[21px]',
                    i === highlight ? 'bg-white-300 text-black-500' : 'text-black-700',
                  )}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Mid-page band after the table: the ASCII box beside the trial + demo pair. */
export function CompareCta({ location, title = 'Try it on your own call list before you decide.' }: { location: string; title?: string }) {
  return (
    <div className="grid items-center gap-8 border-t border-white-800 bg-white-100 px-5 py-10 md:grid-cols-[auto_1fr] md:gap-12 md:px-8">
      <AsciiBox lines={['► Start your 14-day free trial, no card', '► Or book a 15-minute demo with the founder']} className="max-sm:hidden" />
      <div>
        <p className="text-lg font-medium tracking-[-0.03em] text-black-400">{title}</p>
        <CtaPair location={`${location}_table`} size="default" className="mt-5" />
        <p className="mt-4 tabular-nums text-xs tracking-[0.06em] text-white-900">{TRIAL_LINE}</p>
      </div>
    </div>
  );
}

export type SideItem = { name: string; body: React.ReactNode; points?: React.ReactNode[] };

/** Two (or more) columns of prose under a small box-drawn label, one per product. */
export function SideBySide({ items }: { items: SideItem[] }) {
  const grid = items.length >= 4 ? 'md:grid-cols-2 lg:grid-cols-4' : items.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2';
  return (
    <div className={cn('grid border-t border-white-800', grid)}>
      {items.map((it, i) => (
        <Reveal key={it.name} delay={(i % 4) * 80} className="border-b border-white-800 px-5 py-8 md:border-r md:px-8">
          <p className="tabular-nums text-xs tracking-[0.06em] text-faint">
            <span style={{ fontFamily: ASCII_FONT }} aria-hidden>
              ┌─{' '}
            </span>
            {it.name}
          </p>
          <div className="mt-3 space-y-3 text-base leading-[24px] text-black-700">{it.body}</div>
          {it.points?.length ? (
            <ul className="mt-5 border-t border-white-800">
              {it.points.map((p, j) => (
                <li key={j} className="flex gap-3 border-b border-white-800 py-3 text-sm leading-[21px] text-black-500">
                  <span className="tabular-nums text-faint" aria-hidden>
                    →
                  </span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Reveal>
      ))}
    </div>
  );
}

export type ChooseItem = { name: string; points: React.ReactNode[] };

/** "Choose Decibel if… / Choose X if…" cards. Same marker for every product: this is advice, not a scorecard. */
export function ChooseCards({ items }: { items: ChooseItem[] }) {
  const grid = items.length >= 4 ? 'md:grid-cols-2 lg:grid-cols-4' : items.length === 3 ? 'md:grid-cols-3' : 'md:grid-cols-2';
  return (
    <div className={cn('grid border-t border-white-800', grid)}>
      {items.map((it, i) => (
        <Reveal key={it.name} delay={(i % 4) * 80} className="border-b border-white-800 px-5 py-8 md:border-r md:px-8">
          <p className="tabular-nums text-xs tracking-[0.06em] text-faint">{String(i + 1).padStart(2, '0')}</p>
          <h3 className="mt-3 text-lg font-medium tracking-[-0.03em] text-black-400">Choose {it.name} if…</h3>
          <ul className="mt-4 space-y-2.5">
            {it.points.map((p, j) => (
              <li key={j} className="flex gap-3 text-base leading-[23px] text-black-700">
                <span className="tabular-nums text-success-500" aria-hidden>
                  ✓
                </span>
                <span>{p}</span>
              </li>
            ))}
          </ul>
        </Reveal>
      ))}
    </div>
  );
}

export type Source = { label: string; url: string };

/** Where every competitor fact came from, and when it was checked. */
export function SourcesNote({ sources }: { sources: Source[] }) {
  return (
    <section className="rail">
      <div className="px-5 py-12 md:px-10 md:py-14">
        <p className="eyebrow">[ Sources ]</p>
        <p className="mt-4 max-w-[680px] text-base leading-[24px] text-black-700">
          Competitor details checked on {CHECKED_ON} from their public websites; check their site for current pricing. Product names belong to their owners
          and are used here only to identify them. Spotted something out of date? Email{' '}
          <a href="mailto:oliver@usedecibel.com" className="text-black-400 underline decoration-white-800 underline-offset-4 hover:decoration-black-400">
            oliver@usedecibel.com
          </a>{' '}
          and we will correct it.
        </p>
        <ul className="mt-6 grid gap-x-10 border-t border-white-800 sm:grid-cols-2">
          {sources.map((s) => (
            <li key={s.url} className="border-b border-white-800 py-3">
              <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" className="group flex items-baseline justify-between gap-4 text-sm text-black-500 hover:text-black-400">
                <span>{s.label}</span>
                <span className="shrink-0 truncate tabular-nums text-xs tracking-[0.02em] text-faint group-hover:text-white-900">{s.url.replace(/^https:\/\/(www\.)?/, '')} ↗</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/** FAQPage + breadcrumb structured data for a comparison page. */
export function compareJsonLd({ path, name, faqs }: { path: string; name: string; faqs: FaqItem[] }) {
  const crumbs = [
    { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
    { '@type': 'ListItem', position: 2, name: 'Compare', item: `${SITE_URL}/vs` },
    ...(path === '/vs' ? [] : [{ '@type': 'ListItem', position: 3, name, item: `${SITE_URL}${path}` }]),
  ];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'BreadcrumbList', itemListElement: crumbs },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })),
      },
    ],
  };
}

/** A link styled for running text; external links open in a new tab. */
export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  const cls = 'text-black-400 underline decoration-white-800 underline-offset-4 transition-colors hover:decoration-black-400';
  if (href.startsWith('http')) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer nofollow" className={cls}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** Source lists, shared by each comparison page and the hub. */
export const COGNISM_SOURCES: Source[] = [
  { label: 'Cognism pricing', url: 'https://www.cognism.com/pricing' },
  { label: 'Cognism compliance', url: 'https://www.cognism.com/compliance' },
  { label: 'Cognism FAQ', url: 'https://www.cognism.com/faq' },
  { label: 'Cognism integrations', url: 'https://www.cognism.com/integrations' },
  { label: 'Cognism for SMBs', url: 'https://www.cognism.com/for-smbs' },
  { label: 'Cognism free data sample', url: 'https://www.cognism.com/datasample' },
];
export const LUSHA_SOURCES: Source[] = [
  { label: 'Lusha pricing', url: 'https://www.lusha.com/pricing/' },
  { label: 'Lusha FAQ', url: 'https://www.lusha.com/faq/' },
  { label: 'Lusha and Nooks integration', url: 'https://www.lusha.com/integrations/nooks/' },
];
export const KASPR_SOURCES: Source[] = [
  { label: 'Kaspr pricing and plan comparison', url: 'https://www.kaspr.io/pricing' },
  { label: 'Kaspr home page', url: 'https://www.kaspr.io/' },
];

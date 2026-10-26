'use client';

// The /pricing card for one market: a talk-time slider that prices the month as you drag (plan + extra
// minutes, cheaper per minute in bigger bundles), the plan's features, and a country switcher for testing.
// With ?debug=1 it also shows what the minutes cost us and the margin at the slider's value.
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { formatPrice, MARKETS, quote, type Market } from '@/lib/regional-pricing';
import { cn } from '@/lib/utils';
import { CtaLink, trackMarketing } from './analytics';

const SHARED = [
  'The full 1M verified UK & EU lead database, ready to export',
  '300 website visitor identifications a month',
  'Unlimited call recording and call transcription',
  'AI call analysis to help every rep improve',
  'Analytics on calls, reps and outcomes',
];

const n = (v: number) => v.toLocaleString('en-GB');

const money = (m: Market, v: number, decimals = 0) => formatPrice(m, v, decimals);
/** a per-minute price: pence, cents or øre when under one unit */
function rate(m: Market, v: number) {
  if (v >= 1) return money(m, v, 2);
  const minor = Math.round(v * 1000) / 10;
  return m.currency === 'GBP' ? `${minor}p` : m.currency === 'DKK' ? `${minor} øre` : `${minor}¢`;
}

function Flag({ code }: { code: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`/flags/${code}.svg`} alt="" width={18} height={12} className="h-3 w-[18px] shrink-0 rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(8,9,10,0.08)]" />;
}

export function RegionalPricing({ market: m, detected, debug }: { market: Market; detected: string | null; debug: boolean }) {
  const [minutes, setMinutes] = useState(m.included);
  const q = useMemo(() => quote(m, minutes), [m, minutes]);
  const pct = ((minutes - m.included) / (m.max - m.included)) * 100;
  const marks = [m.included, Math.round((m.included + m.max) / 2 / 1000) * 1000, m.max];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2" aria-label="Pricing for another country">
        {Object.values(MARKETS).map((x) => (
          <Link
            key={x.code}
            href={`/pricing?country=${x.code}${debug ? '&debug=1' : ''}`}
            scroll={false}
            className={cn(
              'flex h-8 items-center gap-2 rounded-[6px] border px-3 text-[13px] transition-colors',
              x.code === m.code ? 'border-black-400 text-black-400' : 'border-white-800 text-black-700 hover:border-black-700',
            )}
          >
            <Flag code={x.code} />
            {x.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-card border border-white-800 bg-white-100">
        <div className="grid md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
          <div className="border-b border-rule p-7 md:border-b-0 md:border-r md:p-9">
            <div className="flex items-center gap-2">
              <Flag code={m.code} />
              <span className="text-base font-medium text-black-400">
                {m.plan} · {m.label}
              </span>
            </div>
            <p className="mt-8 flex flex-wrap items-end gap-x-2 gap-y-1">
              <span className="tabular text-3xl font-medium leading-[0.95] tracking-[-0.05em] text-black-300" data-testid="pricing-total">
                {money(m, q.total)}
              </span>
              <span className="pb-1.5 tabular-nums text-xs tracking-[0.06em] text-white-900">Per month, ex VAT</span>
            </p>
            <p className="mt-3 text-base leading-[23px] text-black-700">
              {n(minutes)} minutes of talk time a month · {rate(m, q.perMinuteEffective)} a minute all in
            </p>

            <div className="mt-8">
              <div className="flex items-baseline justify-between">
                <label htmlFor="talk-time" className="text-[13px] font-medium text-black-400">
                  Talk time per month
                </label>
                <span className="tabular-nums text-[13px] text-black-700">{n(minutes)} min</span>
              </div>
              <input
                id="talk-time"
                type="range"
                min={m.included}
                max={m.max}
                step={m.step}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
                onPointerUp={() => trackMarketing('pricing_slider', { country: m.code, minutes })}
                className="price-slider mt-3 w-full"
                style={{ '--fill': `${pct}%` } as React.CSSProperties}
                data-testid="pricing-slider"
              />
              <div className="mt-1.5 flex justify-between tabular-nums text-[12px] text-faint">
                {marks.map((v) => (
                  <span key={v}>{n(v)}</span>
                ))}
              </div>
            </div>

            <dl className="mt-7 border-t border-rule text-[13px]">
              <div className="flex justify-between border-b border-rule py-2.5">
                <dt className="text-black-700">
                  {m.plan}, {n(m.included)} minutes included
                </dt>
                <dd className="tabular-nums text-black-400">{money(m, m.base)}</dd>
              </div>
              <div className="flex justify-between border-b border-rule py-2.5">
                <dt className="text-black-700">
                  {n(q.extra)} extra minutes at {rate(m, m.perMinute * (1 - q.discount))}
                  {q.discount ? <span className="ml-1.5 rounded-[4px] bg-success-100 px-1.5 py-0.5 text-[12px] text-success-700">{Math.round(q.discount * 100)}% off</span> : null}
                </dt>
                <dd className="tabular-nums text-black-400">{money(m, q.extraPrice)}</dd>
              </div>
              {q.payg > q.total + 0.5 ? (
                <div className="flex justify-between py-2.5 text-faint">
                  <dt>Pay as you go would be</dt>
                  <dd className="tabular-nums line-through">{money(m, q.payg)}</dd>
                </div>
              ) : null}
            </dl>

            <div className="mt-7 flex flex-wrap gap-3">
              <CtaLink location={`pricing_page_${m.code.toLowerCase()}`} href="/signup" variant="primary" size="lg">
                Get started
              </CtaLink>
              <CtaLink location={`pricing_page_${m.code.toLowerCase()}_demo`} href="/demo" size="lg">
                Book a 15-min demo
              </CtaLink>
            </div>
            <p className="mt-5 tabular-nums text-xs tracking-[0.06em] text-white-900">
              3-day setup · past your bundle, extra minutes are {rate(m, m.perMinute)} each
            </p>
          </div>

          <ul className="p-7 md:p-9">
            {[...SHARED, ...m.extras].map((item) => (
              <li key={item} className="flex gap-3 border-b border-rule py-3.5 text-base text-black-500 last:border-b-0">
                <span className="tabular-nums text-success-500">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <p className="mt-4 text-[13px] text-faint">
        {detected ? (
          <>
            Showing prices for {m.label} based on your location ({detected}).
          </>
        ) : (
          <>Showing prices for {m.label}.</>
        )}{' '}
        Pick another country above to compare.
      </p>

      {debug ? (
        <div className="mt-6 rounded-[6px] border border-dashed border-white-800 p-4 text-[13px] text-black-700" data-testid="pricing-debug">
          <p className="font-medium text-black-400">Test view (debug=1): not shown to visitors</p>
          <p className="mt-2 tabular-nums">
            Telephony cost {rate(m, m.costPerMinute)}/min (Twilio mobile + browser leg) · we charge {rate(m, m.perMinute * (1 - q.discount))}/min ·{' '}
            margin on extra minutes {Math.round(q.minuteMargin * 100)}%
          </p>
          <p className="mt-1 tabular-nums">
            At {n(minutes)} min: revenue {money(m, q.total)} · telephony {money(m, q.telephony)} · gross margin {Math.round(q.margin * 100)}% (before data and AI costs)
          </p>
        </div>
      ) : null}
    </div>
  );
}

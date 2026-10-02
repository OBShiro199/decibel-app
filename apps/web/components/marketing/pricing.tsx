'use client';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { ANNUAL_DISCOUNT, PLANS } from '@/lib/constants';
import { cn } from '@/lib/utils';
import { CtaLink, trackMarketing } from './analytics';

type Interval = 'monthly' | 'annual';

const gbp = (n: number) => (Number.isInteger(n) ? `£${n.toLocaleString('en-GB')}` : `£${n.toFixed(2)}`);
const discountPct = Math.round(ANNUAL_DISCOUNT * 100);

const FEATURES: Record<keyof typeof PLANS, string[]> = {
  starter: [
    `${PLANS.starter.credits.toLocaleString('en-GB')} credits per seat each month`,
    `Recordings kept ${PLANS.starter.recordings}`,
    'Browser dialler with your own workspace number',
    'TPS/CTPS screening on every dial',
    'Lists, pipeline and CSV import',
  ],
  growth: [
    `${PLANS.growth.credits.toLocaleString('en-GB')} credits per seat each month`,
    `Recordings kept ${PLANS.growth.recordings}`,
    'Everything in Starter',
  ],
};

const SCALE_FEATURES = ['Everything in Growth', 'Terms for larger teams and higher volumes'];

function FeatureList({ items }: { items: string[] }) {
  return (
    <ul className="mt-6 space-y-3 border-t border-white-800 pt-6">
      {items.map((f) => (
        <li key={f} className="flex gap-2 text-black-700">
          <Check size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-black-400" aria-hidden />
          {f}
        </li>
      ))}
    </ul>
  );
}

export function Pricing() {
  const [interval, setInterval] = useState<Interval>('monthly');

  const pick = (next: Interval) => {
    if (next === interval) return;
    setInterval(next);
    trackMarketing('pricing_toggle', { interval: next });
  };

  return (
    <div>
      <div className="flex justify-center">
        <div role="radiogroup" aria-label="Billing interval" className="inline-flex rounded-md border border-white-800 bg-white-300 p-0.5">
          {(['monthly', 'annual'] as const).map((value) => {
            const on = interval === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => pick(value)}
                className={cn(
                  'flex h-8 items-center gap-2 rounded-sm border px-3 transition-colors',
                  on ? 'border-white-800 bg-white-100 text-black-0' : 'border-transparent text-black-700 hover:text-black-400',
                )}
              >
                {value === 'monthly' ? 'Monthly' : 'Annual'}
                {value === 'annual' ? <span className="t-caption rounded-sm bg-white-400 px-1.5 py-0.5 text-black-700">−{discountPct}%</span> : null}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-10 grid gap-4 lg:grid-cols-3">
        {(Object.keys(PLANS) as (keyof typeof PLANS)[]).map((id) => {
          const plan = PLANS[id];
          const perMonth = interval === 'annual' ? plan.monthly * (1 - ANNUAL_DISCOUNT) : plan.monthly;
          const highlighted = id === 'growth';
          return (
            <div key={id} className={cn('flex flex-col rounded-lg border bg-white-100 p-6', highlighted ? 'border-black-700' : 'border-white-800')}>
              <h3 className="t-h3 text-black-0">{plan.name}</h3>
              <p className="mt-4 flex items-baseline gap-1.5">
                <span className="t-h1 tabular text-black-0">{gbp(perMonth)}</span>
                <span className="text-black-700">/seat/mo</span>
              </p>
              <p className="t-small mt-2 min-h-4 text-black-700" aria-live="polite">
                {interval === 'annual' ? `Billed annually at ${gbp(perMonth * 12)} per seat. Usually ${gbp(plan.monthly)}.` : 'Billed monthly.'}
              </p>
              <CtaLink href="/signup" variant={highlighted ? 'primary' : 'outline'} location={`pricing_${id}`} className="mt-6 w-full">
                Start free trial
              </CtaLink>
              <FeatureList items={FEATURES[id]} />
            </div>
          );
        })}
        <div className="flex flex-col rounded-lg border border-white-800 bg-white-100 p-6">
          <h3 className="t-h3 text-black-0">Scale</h3>
          <p className="t-h1 mt-4 text-black-0">Talk to us</p>
          <p className="t-small mt-2 min-h-4 text-black-700">For larger teams and higher volumes.</p>
          <CtaLink href="mailto:sales@decibels.io" variant="outline" location="pricing_scale" className="mt-6 w-full">
            Email sales
          </CtaLink>
          <FeatureList items={SCALE_FEATURES} />
        </div>
      </div>

      <ul className="mx-auto mt-8 flex max-w-[720px] flex-col items-center gap-1 text-center text-black-700">
        <li>Credits = mobile reveals.</li>
        <li>Call minutes billed at cost + 20%.</li>
        <li>14-day free trial, 1 seat, 50 credits, 60 minutes. No card needed.</li>
        <li className="t-small">Prices exclude VAT.</li>
      </ul>
    </div>
  );
}

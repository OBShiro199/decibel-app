// Regional pricing test (2026-10-21): /pricing shows a different plan and per-minute price by the visitor's
// country (Vercel's IP country header, or ?country=XX to test). Telephony costs are Twilio's outbound rate to
// the main mobile networks in each country (Twilio pricing API, in GBP, 21 Oct 2026) plus about 0.3p a minute
// for the browser (Voice SDK) leg, converted at rough rates. Prices are set for a gross margin of 40–60% on
// minutes. This is a pricing experiment, not the published offer in lib/constants.ts.

export type MarketCode = 'GB' | 'US' | 'DK' | 'DE' | 'FR';

export interface Market {
  code: MarketCode;
  label: string;
  currency: 'GBP' | 'USD' | 'EUR' | 'DKK';
  plan: string;
  /** monthly price, including `included` minutes */
  base: number;
  included: number;
  /** price of each minute past the allowance, pay as you go */
  perMinute: number;
  /** the slider's top end and step, in minutes */
  max: number;
  step: number;
  /** what one minute costs us (Twilio + browser leg), in the market's currency */
  costPerMinute: number;
  /** a line or two that only this market gets */
  extras: string[];
}

const LEG = 0.003; // Twilio Voice SDK client leg, GBP a minute
const FX = { GBP: 1, USD: 1.33, EUR: 1.17, DKK: 8.7 } as const;
const cost = (gbpPerMin: number, cur: keyof typeof FX) => (gbpPerMin + LEG) * FX[cur];

export const MARKETS: Record<MarketCode, Market> = {
  GB: {
    code: 'GB',
    label: 'United Kingdom',
    currency: 'GBP',
    plan: 'Pro',
    base: 149,
    included: 1000,
    perMinute: 0.05,
    max: 10000,
    step: 250,
    costPerMinute: cost(0.023052, 'GBP'),
    extras: ['A UK number for every rep', 'TPS and CTPS screening on every dial'],
  },
  US: {
    code: 'US',
    label: 'United States',
    currency: 'USD',
    plan: 'Dialler',
    base: 179,
    included: 1500,
    perMinute: 0.03,
    max: 15000,
    step: 250,
    costPerMinute: cost(0.010581, 'USD'),
    extras: ['A US local number for every rep', 'Calls to US and Canadian numbers'],
  },
  DK: {
    code: 'DK',
    label: 'Denmark',
    currency: 'DKK',
    plan: 'Pro',
    base: 1395,
    included: 1000,
    perMinute: 0.95,
    max: 8000,
    step: 250,
    costPerMinute: cost(0.042627, 'DKK'),
    extras: ['A Danish number for every rep', 'Robinson list screening on every dial'],
  },
  DE: {
    code: 'DE',
    label: 'Germany',
    currency: 'EUR',
    plan: 'Pro',
    base: 179,
    included: 1000,
    perMinute: 0.09,
    max: 8000,
    step: 250,
    costPerMinute: cost(0.031744, 'EUR'),
    extras: ['A German number for every rep', 'Recording consent prompt built in'],
  },
  FR: {
    code: 'FR',
    label: 'France',
    currency: 'EUR',
    plan: 'Pro',
    base: 169,
    included: 1000,
    perMinute: 0.08,
    max: 8000,
    step: 250,
    costPerMinute: cost(0.030534, 'EUR'),
    extras: ['A French number for every rep', 'Bloctel screening on every dial'],
  },
};

/** the rest of the EU sees the euro plan */
const EU = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'EE', 'FI', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE']);

export function marketFor(country: string | null | undefined): Market {
  const c = (country ?? '').toUpperCase();
  if (c in MARKETS) return MARKETS[c as MarketCode];
  if (EU.has(c)) return MARKETS.DE;
  return MARKETS.GB;
}

/** prepaid minutes past the allowance get cheaper as the bundle grows */
export function discountFor(extra: number): number {
  if (extra >= 8000) return 0.2;
  if (extra >= 3000) return 0.1;
  return 0;
}

export function quote(m: Market, minutes: number) {
  const extra = Math.max(0, minutes - m.included);
  const discount = discountFor(extra);
  const extraPrice = extra * m.perMinute * (1 - discount);
  const total = m.base + extraPrice;
  const telephony = minutes * m.costPerMinute;
  return {
    extra,
    discount,
    extraPrice,
    total,
    perMinuteEffective: minutes ? total / minutes : 0,
    payg: m.base + extra * m.perMinute,
    telephony,
    margin: total ? (total - telephony) / total : 0,
    minuteMargin: m.perMinute ? (m.perMinute * (1 - discount) - m.costPerMinute) / (m.perMinute * (1 - discount)) : 0,
  };
}

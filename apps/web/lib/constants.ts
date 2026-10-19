import type { CallOutcome, CallStatus, CompanySizeBand, Seniority, TpsStatus } from './types';

/** Where the app opens after sign-in, sign-up and onboarding (there is no Today tab). */
export const HOME = '/app/leads';

export type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'accent';

/** Outcome picker order = keyboard shortcuts 1-9 (PRD 6.5: 1-6 on Today). */
export const OUTCOMES: { value: CallOutcome; label: string; tone: Tone }[] = [
  { value: 'connected', label: 'Connected', tone: 'success' },
  { value: 'no_answer', label: 'No answer', tone: 'neutral' },
  { value: 'voicemail', label: 'Voicemail', tone: 'neutral' },
  { value: 'busy', label: 'Busy', tone: 'neutral' },
  { value: 'wrong_number', label: 'Wrong number', tone: 'warning' },
  { value: 'meeting_booked', label: 'Meeting booked', tone: 'success' },
  { value: 'not_interested', label: 'Not interested', tone: 'neutral' },
  { value: 'call_back', label: 'Call back', tone: 'accent' },
  { value: 'do_not_call', label: 'Do not call', tone: 'danger' },
];
export const outcomeMeta = (o: CallOutcome | null | undefined) => OUTCOMES.find((x) => x.value === o);

export const CALL_STATUS_LABEL: Record<CallStatus, string> = {
  queued: 'Queued',
  initiated: 'Connecting',
  ringing: 'Ringing',
  in_progress: 'In call',
  completed: 'Ended',
  busy: 'Busy',
  no_answer: 'No answer',
  failed: 'Failed',
  canceled: 'Cancelled',
  blocked: 'Blocked',
};

export const BLOCK_REASONS: Record<string, { title: string; fix: string; href?: string }> = {
  tps_listed: { title: 'TPS listed', fix: 'This number is on the TPS/CTPS register and cannot be cold-called.' },
  do_not_call: { title: 'Do not call', fix: 'This person asked not to be called.' },
  dnc_list: { title: 'On your DNC list', fix: 'It can’t be called unless an owner or admin removes it from the DNC list.', href: '/app/dnc' },
  no_mobile: { title: 'No mobile', fix: 'Add a mobile number to this person first.' },
  no_minutes: { title: 'Out of minutes', fix: 'Add a card to keep calling.', href: '/app/settings/billing' },
  trial_expired: { title: 'Trial ended', fix: 'Pick a plan to keep calling.', href: '/app/settings/plans' },
  no_caller_id: { title: 'No number yet', fix: 'Get a number or verify your own to place calls.', href: '/app/settings/phone-numbers' },
  person_not_found: { title: 'Person not found', fix: 'This record no longer exists.' },
  forbidden: { title: 'Not allowed', fix: 'You are not a member of this workspace.' },
  test_number_not_yours: { title: 'Not your number', fix: 'Practice and test calls can only ring your own mobile (Settings, Profile) or a verified number.' },
};

export const TPS_LABEL: Record<TpsStatus, string> = {
  unchecked: 'Unchecked',
  clear: 'TPS clear',
  tps_listed: 'TPS listed',
  ctps_listed: 'CTPS listed',
};

export const SENIORITIES: { value: Seniority; label: string }[] = [
  { value: 'c_level', label: 'C-level' },
  { value: 'owner', label: 'Owner / Founder' },
  { value: 'vp', label: 'VP' },
  { value: 'director', label: 'Director' },
  { value: 'manager', label: 'Manager' },
  { value: 'ic', label: 'IC' },
];
export const seniorityLabel = (s: Seniority | null | undefined) => SENIORITIES.find((x) => x.value === s)?.label ?? '';

export const SIZE_BANDS: CompanySizeBand[] = ['1-10', '11-50', '51-200', '201-500', '501-1000', '1001-5000', '5001+'];

export const COUNTRIES: { code: string; name: string; warning?: boolean }[] = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IE', name: 'Ireland' },
  { code: 'DE', name: 'Germany', warning: true },
  { code: 'AT', name: 'Austria', warning: true },
  { code: 'CH', name: 'Switzerland' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'BE', name: 'Belgium' },
  { code: 'LU', name: 'Luxembourg' },
  { code: 'FR', name: 'France' },
  { code: 'SE', name: 'Sweden' },
  { code: 'NO', name: 'Norway' },
  { code: 'DK', name: 'Denmark' },
  { code: 'FI', name: 'Finland' },
  { code: 'ES', name: 'Spain' },
  { code: 'IT', name: 'Italy' },
  { code: 'PT', name: 'Portugal' },
];
export const countryName = (code: string | null | undefined) => COUNTRIES.find((c) => c.code === code)?.name ?? code ?? '';

/** Onboarding "markets" -> ISO country codes used to scope database search. */
export const MARKETS: Record<string, string[]> = {
  UK: ['GB'],
  Ireland: ['IE'],
  DACH: ['DE', 'AT', 'CH'],
  Benelux: ['NL', 'BE', 'LU'],
  Nordics: ['SE', 'NO', 'DK', 'FI'],
  France: ['FR'],
  'Southern Europe': ['ES', 'IT', 'PT'],
};

export const JOB_TITLE_SUGGESTIONS = ['CEO', 'Founder', 'Managing Director', 'Head of Sales', 'Sales Director', 'CTO', 'Operations Director', 'Head of Marketing', 'Finance Director', 'Head of Procurement', 'HR Director'];

/**
 * The one plan: £149 a month (excluding VAT), no free trial, live after a 3-day setup. `tier` is what
 * workspaces.plan stores and what the billing function receives (STRIPE_PRICE_GROWTH_* once Stripe is set up).
 */
export const PRO = {
  name: 'Pro',
  tier: 'growth',
  monthly: 149,
  setupDays: 3,
  minutes: 1000,
  /** each dialler minute past the monthly allowance, in pence (wholesale UK mobile is roughly 1.5–4p) */
  extraMinutePence: 5,
  visitors: 300,
  recordings: '1 year',
} as const;
const n = (v: number) => v.toLocaleString('en-GB');
/** "£149 a month · 3-day setup": the line under every call to action */
export const OFFER_LINE = `£${PRO.monthly} a month · ${PRO.setupDays}-day setup · ex VAT`;
/** Dialler minutes: an allowance each month, then a per-minute price (see /fair-use). */
export const FAIR_USE_MINUTES = PRO.minutes;
export const MINUTES_TEXT = `${n(PRO.minutes)} dialler minutes a month are included, then ${PRO.extraMinutePence}p a minute.`;
export const FAIR_USE_NOTE = `*${MINUTES_TEXT}`;
export const PRO_FEATURES = [
  'Instant access to the 1M verified UK & EU lead database, ready to export',
  `${n(PRO.minutes)} dialler minutes a month, then ${PRO.extraMinutePence}p a minute*`,
  `${n(PRO.visitors)} website visitor identifications a month`,
  'Unlimited call recording and call transcription',
  'AI call analysis to help every rep improve',
  'Analytics on calls, reps and outcomes',
  'Power dialler with a UK number and TPS/CTPS screening on every dial',
];
/** Welcome credits for every new account, granted once (enforced in the database, migration 0010). */
export const TRIAL_CREDITS = 5000;
export const CREDIT_PACKS = [
  { id: '500', credits: 500, price: 75 },
  { id: '2000', credits: 2000, price: 250 },
  { id: '10000', credits: 10000, price: 1000 },
];

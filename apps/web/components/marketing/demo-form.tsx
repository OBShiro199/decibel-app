'use client';
// The "Book a 15-min demo" form. Sends to the public demo-request function, which emails
// the founder. If NEXT_PUBLIC_DEMO_BOOKING_URL is set (Cal.com, Calendly...), people can
// also pick a slot straight away.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { trackMarketing } from './analytics';

const BOOKING_URL = /^https:\/\//.test(process.env.NEXT_PUBLIC_DEMO_BOOKING_URL ?? '') ? process.env.NEXT_PUBLIC_DEMO_BOOKING_URL! : null;
const SIZES = ['Just me', '2–5', '6–20', '21–50', '50+'];

const field = 'h-10 w-full rounded-[6px] border border-white-800 bg-white-100 px-3 text-base text-black-400 outline-none transition-colors placeholder:text-white-900 focus:border-white-900';
const label = 'mb-1.5 block text-[13px] text-black-700';

export function DemoForm() {
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');
  const [size, setSize] = useState('');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    setState('sending');
    setError('');
    try {
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/demo-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
        body: JSON.stringify({ ...data, team_size: size }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? 'failed');
      trackMarketing('demo_request', { team_size: size || 'unknown' });
      setState('sent');
    } catch (err) {
      const code = (err as Error).message;
      setError(
        code === 'email_invalid'
          ? 'Check your email address.'
          : code === 'name_required'
            ? 'Add your name.'
            : code === 'slow_down'
              ? 'We already have your request. Oliver will be in touch.'
              : 'That did not send. Try again, or email oliver@usedecibel.com.',
      );
      setState('idle');
    }
  }

  if (state === 'sent') {
    return (
      <div className="rounded-[6px] border border-white-800 bg-white-100 p-7">
        <p className="tabular-nums text-xs tracking-[0.06em] text-success-500">✓ Request sent</p>
        <h2 className="mt-3 text-lg font-medium tracking-[-0.03em] text-black-400">Thanks. Oliver will email you to find a time.</h2>
        <p className="mt-2 text-base leading-[23px] text-black-700">Usually within one working day. In the meantime you can start the free trial and have a look around.</p>
        {BOOKING_URL ? (
          <a href={BOOKING_URL} className="mt-5 inline-flex text-[13px] font-medium text-black-400 underline underline-offset-2">
            Or pick a slot now →
          </a>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-[6px] border border-white-800 bg-white-100 p-6 md:p-7" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="d-name" className={label}>
            Name
          </label>
          <input id="d-name" name="name" required autoComplete="name" className={field} />
        </div>
        <div>
          <label htmlFor="d-email" className={label}>
            Work email
          </label>
          <input id="d-email" name="email" type="email" required autoComplete="email" className={field} />
        </div>
        <div>
          <label htmlFor="d-company" className={label}>
            Company
          </label>
          <input id="d-company" name="company" autoComplete="organization" className={field} />
        </div>
        <div>
          <label htmlFor="d-phone" className={label}>
            Phone <span className="text-white-900">(optional)</span>
          </label>
          <input id="d-phone" name="phone" type="tel" autoComplete="tel" className={field} />
        </div>
      </div>
      <fieldset className="mt-4">
        <legend className={label}>How many people will be calling?</legend>
        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={size === s}
              onClick={() => setSize(size === s ? '' : s)}
              className={`h-8 rounded-[4px] border px-3 text-[13px] transition-colors ${size === s ? 'border-black-400 bg-white-100 text-black-400' : 'border-white-800 text-black-700 hover:border-white-900'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="mt-4">
        <label htmlFor="d-msg" className={label}>
          Anything you want to see? <span className="text-white-900">(optional)</span>
        </label>
        <textarea id="d-msg" name="message" rows={3} maxLength={2000} className={`${field} h-auto py-2.5 leading-[22px]`} />
      </div>
      {/* honeypot: hidden from people, irresistible to bots */}
      <div aria-hidden className="absolute left-[-10000px] h-0 w-0 overflow-hidden">
        <label htmlFor="d-website">Website</label>
        <input id="d-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {error ? <p className="mt-4 text-[13px] text-danger-700">{error}</p> : null}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="lg" loading={state === 'sending'}>
          Request a demo
        </Button>
        {BOOKING_URL ? (
          <a href={BOOKING_URL} className="text-[13px] text-black-700 underline underline-offset-2 hover:text-black-400">
            or pick a slot now
          </a>
        ) : null}
      </div>
      <p className="mt-4 text-xs leading-[17px] text-white-900">
        We use these details only to arrange your demo. See our <a href="/privacy" className="underline underline-offset-2">privacy policy</a>.
      </p>
    </form>
  );
}

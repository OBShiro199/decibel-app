'use client';
// The checker card used by the free tools (TPS/CTPS, email, phone). It calls the public
// `free-tools` Edge Function, which rate-limits, caches and pays for the lookup.
// If NEXT_PUBLIC_TURNSTILE_SITE_KEY is set, a Cloudflare Turnstile check runs first.
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CtaLink, trackMarketing } from './analytics';

export type ToolId = 'tps' | 'email' | 'phone';

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';
const ASCII_FONT = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace";

const COPY: Record<ToolId, { label: string; placeholder: string; button: string; type: string; mode: 'tel' | 'email' }> = {
  tps: { label: 'UK phone number', placeholder: '07700 900123', button: 'Check TPS and CTPS', type: 'tel', mode: 'tel' },
  email: { label: 'Email address', placeholder: 'name@company.co.uk', button: 'Verify email', type: 'email', mode: 'email' },
  phone: { label: 'Phone number', placeholder: '07700 900123 or +33 6 12 34 56 78', button: 'Validate number', type: 'tel', mode: 'tel' },
};

type TpsResult = { number: string; on_tps: boolean; on_ctps: boolean; checked_at: string };
type EmailResult = { email: string; verdict: 'deliverable' | 'risky' | 'unknown' | 'undeliverable'; label: string; free_provider: boolean; role_account: boolean; did_you_mean: string | null };
type PhoneResult = { number: string; valid: boolean; national_format?: string | null; country_code?: string | null; line_type?: string; carrier?: string | null; reason?: string };

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void };
  }
}

function useTurnstile() {
  const ref = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState('');
  const widget = useRef<string | null>(null);
  useEffect(() => {
    if (!SITE_KEY || !ref.current) return;
    const render = () => {
      if (!window.turnstile || !ref.current || widget.current) return;
      widget.current = window.turnstile.render(ref.current, { sitekey: SITE_KEY, size: 'flexible', callback: setToken, 'expired-callback': () => setToken('') });
    };
    if (window.turnstile) render();
    else {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = render;
      document.head.appendChild(s);
    }
  }, []);
  const reset = () => {
    setToken('');
    if (widget.current) window.turnstile?.reset(widget.current);
  };
  return { ref, token, ready: !SITE_KEY || !!token, reset };
}

const TONE = {
  good: { dot: '#1d9d5b', bg: 'bg-[#f1f8f3]', border: 'border-[#cfe8d8]', text: 'text-[#17784a]' },
  warn: { dot: '#c98a1a', bg: 'bg-[#fbf6ea]', border: 'border-[#efdfb6]', text: 'text-[#8a5d0f]' },
  bad: { dot: '#c0462e', bg: 'bg-[#fbf0ee]', border: 'border-[#f0d0c9]', text: 'text-[#a3391f]' },
  neutral: { dot: '#9a9a9a', bg: 'bg-white-200', border: 'border-white-800', text: 'text-black-700' },
} as const;

function Verdict({ tone, title, children }: { tone: keyof typeof TONE; title: string; children?: React.ReactNode }) {
  const t = TONE[tone];
  return (
    <div className={cn('rounded-[6px] border px-4 py-3.5', t.bg, t.border)}>
      <p className={cn('flex items-center gap-2 text-md font-medium tracking-[-0.02em]', t.text)}>
        <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: t.dot }} aria-hidden />
        {title}
      </p>
      {children ? <p className="mt-1 text-base leading-[22px] text-black-700">{children}</p> : null}
    </div>
  );
}

function Rows({ rows }: { rows: [string, React.ReactNode][] }) {
  return (
    <dl className="mt-3 divide-y divide-white-800 rounded-[6px] border border-white-800">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-baseline justify-between gap-4 px-4 py-2.5 text-base">
          <dt className="text-black-700">{k}</dt>
          <dd className="text-right tabular-nums text-black-400">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

const yesNo = (v: boolean) => (v ? 'Yes' : 'No');

function TpsView({ r }: { r: TpsResult }) {
  const listed = r.on_tps || r.on_ctps;
  const which = r.on_tps && r.on_ctps ? 'the TPS and the CTPS' : r.on_tps ? 'the TPS' : 'the CTPS';
  return (
    <>
      {listed ? (
        <Verdict tone="bad" title={`Registered on ${which}`}>
          Do not make unsolicited marketing calls to this number, unless the subscriber has told you they do not object to your calls.
        </Verdict>
      ) : (
        <Verdict tone="good" title="Not on the TPS or CTPS">
          This number is not registered. Before calling, also check your own do-not-call list and that they have not asked you to stop.
        </Verdict>
      )}
      <Rows rows={[['Number', r.number], ['TPS', r.on_tps ? 'Registered' : 'Not registered'], ['CTPS', r.on_ctps ? 'Registered' : 'Not registered'], ['Checked', new Date(r.checked_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })]]} />
    </>
  );
}

function EmailView({ r, onTry }: { r: EmailResult; onTry: (v: string) => void }) {
  const tone = r.verdict === 'deliverable' ? 'good' : r.verdict === 'risky' ? 'warn' : r.verdict === 'undeliverable' ? 'bad' : 'neutral';
  const body = {
    deliverable: 'The mailbox exists and accepts mail.',
    risky: 'The domain accepts every address, so this particular mailbox cannot be confirmed. Emails may still arrive.',
    unknown: 'The mail server did not give a clear answer. Try again later.',
    undeliverable: 'Emails to this address will bounce.',
  }[r.verdict];
  return (
    <>
      <Verdict tone={tone} title={r.label}>
        {body}
      </Verdict>
      {r.did_you_mean ? (
        <p className="mt-3 text-base text-black-700">
          Did you mean{' '}
          <button type="button" onClick={() => onTry(r.did_you_mean!)} className="font-medium text-black-400 underline underline-offset-2">
            {r.did_you_mean}
          </button>
          ?
        </p>
      ) : null}
      <Rows rows={[['Email', r.email], ['Free provider (Gmail, Outlook…)', yesNo(r.free_provider)], ['Role address (info@, sales@…)', yesNo(r.role_account)]]} />
    </>
  );
}

const LINE: Record<string, string> = { mobile: 'Mobile', landline: 'Landline', fixedVoip: 'Fixed VoIP', nonFixedVoip: 'Virtual (VoIP)', tollFree: 'Freephone', premium: 'Premium rate', sharedCost: 'Shared cost', uan: 'Business number', voicemail: 'Voicemail', pager: 'Pager', personal: 'Personal number', unknown: 'Unknown' };

function PhoneView({ r }: { r: PhoneResult }) {
  if (!r.valid) {
    return (
      <Verdict tone="bad" title="Not a valid number">
        This number is not in use under the national numbering plan, so it cannot be called. Check for a missing or extra digit.
      </Verdict>
    );
  }
  const type = LINE[r.line_type ?? 'unknown'] ?? r.line_type ?? 'Unknown';
  return (
    <>
      <Verdict tone="good" title={`Valid ${type.toLowerCase()} number`}>
        The number is valid and allocated to a network{r.carrier ? `: ${r.carrier}` : ''}.
      </Verdict>
      <Rows rows={[['International format', r.number], ['National format', r.national_format ?? '–'], ['Country', r.country_code ?? '–'], ['Line type', type], ['Network', r.carrier ?? '–']]} />
    </>
  );
}

export function FreeTool({ tool, dailyLimit }: { tool: ToolId; dailyLimit: number }) {
  const copy = COPY[tool];
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<unknown>(null);
  const [checks, setChecks] = useState(0);
  const ts = useTurnstile();

  async function run(v = value) {
    const input = v.trim();
    if (!input || busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/free-tools`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', apikey: key, authorization: `Bearer ${key}` },
        body: JSON.stringify({ tool, value: input, turnstile: ts.token }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message ?? 'The check could not be completed. Please try again.');
      setResult(data.result);
      setChecks((c) => c + 1);
      trackMarketing('free_tool_check', { tool });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      ts.reset();
    }
  }

  return (
    <div className="mx-auto w-full max-w-[560px] overflow-hidden rounded-[6px] border border-white-800 bg-white-100 text-left shadow-[0_18px_48px_rgba(18,18,18,0.06)]">
      <div className="flex items-center justify-between border-b border-white-800 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="h-2.5 w-2.5 rounded-full bg-white-800" />
          <span className="h-2.5 w-2.5 rounded-full bg-white-800" />
          <span className="h-2.5 w-2.5 rounded-full bg-white-800" />
        </span>
        <span className="text-xs text-faint" style={{ fontFamily: ASCII_FONT }}>
          decibel.tools/{tool}
        </span>
      </div>
      <form
        className="p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <label htmlFor={`tool-${tool}`} className="mb-1.5 block text-[13px] text-black-700">
          {copy.label}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id={`tool-${tool}`}
            type={copy.type}
            inputMode={copy.mode}
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={copy.placeholder}
            maxLength={254}
            className="h-11 min-w-0 flex-1 rounded-[6px] border border-white-800 bg-white-100 px-3.5 text-md text-black-400 outline-none transition-colors placeholder:text-white-900 focus:border-white-900"
          />
          <Button type="submit" variant="primary" size="lg" loading={busy} disabled={!value.trim() || !ts.ready} className="h-11">
            {copy.button}
          </Button>
        </div>
        {SITE_KEY ? <div ref={ts.ref} className="mt-3" /> : null}
        <div aria-live="polite">
          {error ? <p className="mt-4 rounded-[6px] border border-white-800 bg-white-200 px-4 py-3 text-base text-black-700">{error}</p> : null}
          {result ? (
            <div className="mt-5">
              {tool === 'tps' ? <TpsView r={result as TpsResult} /> : tool === 'email' ? <EmailView r={result as EmailResult} onTry={(v) => { setValue(v); void run(v); }} /> : <PhoneView r={result as PhoneResult} />}
            </div>
          ) : null}
        </div>
        <p className="mt-4 text-xs leading-[17px] text-white-900">
          {dailyLimit} free checks a day. We send what you enter to our checking provider and keep only a scrambled (hashed) copy so repeat checks are instant. See our{' '}
          <a href="/privacy" className="underline underline-offset-2">
            privacy policy
          </a>
          .
        </p>
      </form>
      {checks > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white-800 bg-white-200 px-5 py-3.5">
          <p className="text-[13px] text-black-700">Calling a whole list? Find, check and call numbers in one place with Decibel.</p>
          <CtaLink href="/signup" variant="primary" location={`tool_${tool}_result`} size="compact">
            Start free trial
          </CtaLink>
        </div>
      ) : null}
    </div>
  );
}

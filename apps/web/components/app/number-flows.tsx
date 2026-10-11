'use client';
// Number provisioning flows shared by onboarding step 4 and Settings → Phone numbers.
// Both talk to the telnyx-numbers Edge Function; no Telnyx credentials in the browser.
//
// UK numbers need business details and two documents (Telnyx reviews them, usually within 72
// hours). A workspace files them once per number type; later numbers of that type use the same
// approved details. Verifying an existing number (a texted code) lets a rep call straight away.
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock } from 'lucide-react';
import { useState } from 'react';
import { track } from '@/lib/analytics';
import { FunctionError, invoke, supabase } from '@/lib/supabase/client';
import type { PhoneNumber } from '@/lib/types';
import { formatPhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ErrorCard, Skeleton } from '@/components/ui/display';
import { Field, Input, PillSelect } from '@/components/ui/form';
import { countryFromInternational, DEFAULT_DIAL_COUNTRY, toE164, type DialCountry } from '@/lib/phone';
import { PhoneInput } from '@/components/ui/phone-input';

type NumberType = 'local' | 'national' | 'mobile';
const AREAS: { id: string; label: string; type: NumberType; area?: string }[] = [
  { id: 'london', label: 'London 020', type: 'local', area: '20' },
  { id: 'manchester', label: 'Manchester 0161', type: 'local', area: '161' },
  { id: 'birmingham', label: 'Birmingham 0121', type: 'local', area: '121' },
  { id: 'any', label: 'Any UK area', type: 'local' },
  { id: 'national', label: 'National 03', type: 'national' },
];

interface Available {
  e164: string;
  friendly: string;
  locality: string | null;
  upfront: number | null;
  monthly: number | null;
  currency: string;
}

const money = (n: number | null, currency: string) => (n === null ? '' : new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 2 }).format(n));

export function describeError(e: unknown): string {
  const err = e as FunctionError;
  const map: Record<string, string> = {
    email_not_verified: 'Verify your email address before buying a number. Check your inbox for the confirmation link.',
    forbidden: 'Only workspace owners and admins can manage numbers.',
    telephony_not_configured: 'Calling is not configured on the server yet.',
    unauthorized: 'Your session expired. Log in again.',
    missing_details: 'Fill in every field and add both documents.',
    requirements_changed: 'Telnyx has changed what it needs for UK numbers. We have been alerted and will fix this shortly.',
    invalid_code: 'Enter the code from the text message.',
  };
  if (map[err?.message]) return map[err.message];
  if (/Failed to send a request|Failed to fetch/i.test(err?.message ?? '')) return 'Could not reach the number service. Try again in a moment.';
  return err?.message || 'Something went wrong.';
}

/** Option A: buy a Decibel number (business details and documents the first time). */
export function BuyNumberPanel({ workspaceId, onDone }: { workspaceId: string; onDone: (n: PhoneNumber) => void }) {
  const qc = useQueryClient();
  const [area, setArea] = useState('london');
  const [results, setResults] = useState<Available[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detailsFor, setDetailsFor] = useState<Available | null>(null);
  const [pending, setPending] = useState<PhoneNumber | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const selected = AREAS.find((a) => a.id === area)!;
  const type = selected.type;

  const search = async () => {
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      const res = await invoke<{ numbers: Available[] }>('telnyx-numbers', { workspace_id: workspaceId, action: 'search', type, area: selected.area });
      setResults(res.numbers);
      track('number_requested', { kind: type, country: 'GB' });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSearching(false);
    }
  };

  const finished = (n: PhoneNumber) => {
    void qc.invalidateQueries({ queryKey: ['numbers'] });
    if (n.status === 'active') track('number_activated', { kind: type, country: 'GB' });
    else setPending(n);
    onDone(n);
  };

  const buy = async (n: Available) => {
    setBuying(n.e164);
    setError(null);
    setNotice(null);
    try {
      const res = await invoke<{ number?: PhoneNumber; needs_documents?: boolean }>('telnyx-numbers', { workspace_id: workspaceId, action: 'buy', e164: n.e164, type });
      if (res.needs_documents) setDetailsFor(n);
      else if (res.number) finished(res.number);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBuying(null);
    }
  };

  if (pending) {
    return (
      <div className="card flex items-start gap-3 p-4">
        <Clock size={20} strokeWidth={1.5} className="mt-0.5 shrink-0 text-warning-500" />
        <div>
          <p className="t-h4">
            <span className="tabular-nums">{formatPhone(pending.e164)}</span> is being reviewed
          </p>
          <p className="mt-1 text-black-700">
            Telnyx checks the business details for every UK number, usually within 72 hours. We will email you when it is live. Meanwhile, verify your own number as caller ID to start calling straight away.
          </p>
        </div>
      </div>
    );
  }

  if (detailsFor) {
    return (
      <DetailsForm
        workspaceId={workspaceId}
        number={detailsFor}
        type={type}
        onBack={() => setDetailsFor(null)}
        onSubmitted={(n) => finished(n)}
        onNumberGone={() => {
          setDetailsFor(null);
          setResults(null);
          setNotice('Your details are saved and under review. That number was taken meanwhile: search again and pick another, with no need to resend anything.');
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Area">
        <PillSelect single options={AREAS.map((a) => ({ value: a.id, label: a.label }))} value={[area]} onChange={(v) => { setArea(v[0]); setResults(null); }} />
      </Field>
      <div>
        <Button onClick={search} loading={searching}>
          Search available numbers
        </Button>
      </div>
      {notice ? <p className="card p-3 text-black-700">{notice}</p> : null}
      {error ? <ErrorCard message={error} onRetry={results ? undefined : search} /> : null}
      {searching ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      ) : results ? (
        results.length ? (
          <ul className="card divide-y divide-white-800">
            {results.map((n) => (
              <li key={n.e164} className="flex h-12 items-center gap-3 px-4">
                <span className="t-mono flex-1">{formatPhone(n.e164)}</span>
                {n.locality ? <span className="t-small capitalize text-black-700 max-sm:hidden">{n.locality.toLowerCase()}</span> : null}
                {n.monthly !== null ? <span className="t-small tabular-nums text-black-700 max-sm:hidden">{money(n.monthly, n.currency)}/month</span> : null}
                <Button size="compact" variant="primary" loading={buying === n.e164} disabled={!!buying} onClick={() => buy(n)}>
                  Choose
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-black-700">No numbers available for that area right now. Try another area.</p>
        )
      ) : null}
    </div>
  );
}

function FileField({ id, label, hint, onFile }: { id: string; label: string; hint: string; onFile: (f: File | null) => void }) {
  return (
    <Field label={label} htmlFor={id} hint={hint} className="sm:col-span-2">
      <input
        id={id}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png"
        required
        onChange={(e) => onFile(e.target.files?.[0] ?? null)}
        className="block w-full text-black-700 file:mr-3 file:h-9 file:rounded-sm file:border file:border-white-800 file:bg-white-100 file:px-3"
      />
    </Field>
  );
}

function DetailsForm({
  workspaceId,
  number,
  type,
  onBack,
  onSubmitted,
  onNumberGone,
}: {
  workspaceId: string;
  number: Available;
  type: NumberType;
  onBack: () => void;
  onSubmitted: (n: PhoneNumber) => void;
  onNumberGone: () => void;
}) {
  const [form, setForm] = useState({
    name: '',
    registration_number: '',
    website: 'https://',
    street: '',
    city: '',
    postcode: '',
    contact_first_name: '',
    contact_last_name: '',
    contact_phone: '',
  });
  const [identity, setIdentity] = useState<File | null>(null);
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const upload = async (file: File, kind: string) => {
    if (file.size > 20 * 1024 * 1024) throw new Error(`${file.name} is over 20 MB.`);
    const path = `${workspaceId}/numbers/${kind}-${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`;
    const { error: upErr } = await supabase().storage.from('imports').upload(path, file);
    if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
    return path;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identity || !proof) return setError('Add both documents.');
    setBusy(true);
    setError(null);
    try {
      const [identityPath, proofPath] = await Promise.all([upload(identity, 'identity'), upload(proof, 'address')]);
      const res = await invoke<{ number?: PhoneNumber; number_unavailable?: boolean }>('telnyx-numbers', {
        workspace_id: workspaceId,
        action: 'submit_documents',
        e164: number.e164,
        type,
        business: form,
        documents: { identity: identityPath, address_proof: proofPath },
      });
      track('number_details_submitted', { kind: type });
      if (res.number_unavailable) onNumberGone();
      else if (res.number) onSubmitted(res.number);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div>
        <p className="t-h4">
          Business details for <span className="tabular-nums">{formatPhone(number.e164)}</span>
        </p>
        <p className="mt-1 text-black-700">
          UK rules require every number to be registered to a real business. Telnyx reviews these details, usually within 72 hours. You only do this once: later numbers use the same approved details.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Registered company name" htmlFor="b-name">
          <Input id="b-name" required value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Company number" htmlFor="b-reg" hint="Your Companies House number">
          <Input id="b-reg" required value={form.registration_number} onChange={set('registration_number')} />
        </Field>
        <Field label="Company website" htmlFor="b-web" hint="A live site that names your business" className="sm:col-span-2">
          <Input id="b-web" required type="url" value={form.website} onChange={set('website')} />
        </Field>
        <Field label="Business address" htmlFor="b-street" className="sm:col-span-2">
          <Input id="b-street" required value={form.street} onChange={set('street')} />
        </Field>
        <Field label="Town or city" htmlFor="b-city">
          <Input id="b-city" required value={form.city} onChange={set('city')} />
        </Field>
        <Field label="Postcode" htmlFor="b-post">
          <Input id="b-post" required value={form.postcode} onChange={set('postcode')} />
        </Field>
        <Field label="Contact first name" htmlFor="b-first">
          <Input id="b-first" required value={form.contact_first_name} onChange={set('contact_first_name')} />
        </Field>
        <Field label="Contact last name" htmlFor="b-last">
          <Input id="b-last" required value={form.contact_last_name} onChange={set('contact_last_name')} />
        </Field>
        <Field label="Contact phone" htmlFor="b-phone" className="sm:col-span-2">
          <Input id="b-phone" required type="tel" value={form.contact_phone} onChange={set('contact_phone')} placeholder="07700 900123" />
        </Field>
        <FileField id="b-identity" label="Company registration certificate" hint="Your certificate of incorporation (PDF, JPG or PNG). Sole traders: a passport or driving licence." onFile={setIdentity} />
        <FileField id="b-proof" label="Proof of address" hint="A utility bill, bank statement or telecoms invoice for the business address, from the last 3 months." onFile={setProof} />
      </div>
      {error ? <ErrorCard message={error} /> : null}
      <div className="flex gap-2">
        <Button onClick={onBack}>Back</Button>
        <Button type="submit" variant="primary" loading={busy}>
          Submit for review
        </Button>
      </div>
    </form>
  );
}

/** Option B: verify an existing number as caller ID. We text it a code, the user types it in. */
export function VerifyCallerIdPanel({ workspaceId, onDone, initialNumber = '' }: { workspaceId: string; onDone: (n: PhoneNumber) => void; initialNumber?: string }) {
  const qc = useQueryClient();
  const [raw, setRaw] = useState(initialNumber);
  const [verifyCountry, setVerifyCountry] = useState<DialCountry>(() => countryFromInternational(initialNumber ?? '') ?? DEFAULT_DIAL_COUNTRY);
  const [sent, setSent] = useState<'sms' | 'call' | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<null | 'send' | 'check'>(null);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<PhoneNumber | null>(null);
  const e164 = toE164(raw, verifyCountry);

  const send = async (method: 'sms' | 'call') => {
    if (!e164) return setError('Enter a valid phone number, for example 07700 900123.');
    setBusy('send');
    setError(null);
    try {
      await invoke('telnyx-numbers', { workspace_id: workspaceId, action: 'verify_start', e164, method });
      setSent(method);
      setCode('');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  const check = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('check');
    setError(null);
    try {
      const res = await invoke<{ verified: boolean; number?: PhoneNumber; message?: string }>('telnyx-numbers', { workspace_id: workspaceId, action: 'verify_check', e164, code });
      if (res.verified && res.number) {
        setVerified(res.number);
        track('caller_id_verified', { kind: 'verified_caller_id', country: res.number.country_code });
        void qc.invalidateQueries({ queryKey: ['numbers'] });
        onDone(res.number);
      } else setError('That code did not work. Check it and try again, or send a new one.');
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  };

  if (verified) {
    return (
      <div className="card flex items-center gap-3 p-4">
        <CheckCircle2 size={20} strokeWidth={1.5} className="shrink-0 text-success-500" />
        <p>
          <span className="tabular-nums">{formatPhone(verified.e164)}</span> is verified. Your calls will show this number.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Field label="Your phone number" htmlFor="verify-number" hint="We send a 6-digit code to prove the number is yours." error={sent ? null : error}>
        <div className="flex gap-2">
          <PhoneInput id="verify-number" value={raw} onChange={setRaw} country={verifyCountry} onCountryChange={setVerifyCountry} disabled={!!sent} />
          <Button variant="primary" loading={busy === 'send' && !sent} disabled={!!sent} onClick={() => send('sms')}>
            Text me a code
          </Button>
        </div>
      </Field>
      {sent ? (
        <form onSubmit={check} className="card flex flex-col gap-3 p-4" aria-live="polite">
          <p className="text-black-700">{sent === 'sms' ? 'We texted' : 'We are calling'} <span className="tabular-nums">{formatPhone(e164!)}</span> with a code. Enter it here.</p>
          <div className="flex gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" autoComplete="one-time-code" placeholder="123456" aria-label="Verification code" className="w-40 tabular-nums" />
            <Button type="submit" variant="primary" loading={busy === 'check'} disabled={code.replace(/\D/g, '').length < 4}>
              Verify
            </Button>
          </div>
          {error ? <p className="text-danger-700">{error}</p> : null}
          <div className="flex flex-wrap gap-3 text-black-700">
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => send(sent)}>
              Send again
            </button>
            {sent === 'sms' ? (
              <button type="button" className="underline-offset-2 hover:underline" onClick={() => send('call')}>
                Call me with the code instead
              </button>
            ) : null}
            <button type="button" className="underline-offset-2 hover:underline" onClick={() => setSent(null)}>
              Change number
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

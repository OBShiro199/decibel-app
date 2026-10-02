'use client';
// Number provisioning flows shared by onboarding step 4 and Settings → Phone numbers.
// Both talk to the twilio-numbers Edge Function; no Twilio credentials in the browser.
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { FunctionError, invoke, supabase } from '@/lib/supabase/client';
import type { PhoneNumber } from '@/lib/types';
import { formatPhone, normalizePhone } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { ErrorCard, Skeleton } from '@/components/ui/display';
import { Field, Input, PillSelect, Select } from '@/components/ui/form';

type NumberType = 'local' | 'national' | 'mobile';
const AREAS: { id: string; label: string; type: NumberType; prefix: string }[] = [
  { id: 'london', label: 'London 020', type: 'local', prefix: '+4420' },
  { id: 'manchester', label: 'Manchester 0161', type: 'local', prefix: '+44161' },
  { id: 'national', label: 'National 0333', type: 'national', prefix: '+44333' },
  { id: 'mobile', label: 'Mobile 07', type: 'mobile', prefix: '+447' },
];
const NUMBER_COUNTRIES = [
  { code: 'GB', name: 'United Kingdom' },
  { code: 'IE', name: 'Ireland' },
  { code: 'NL', name: 'Netherlands' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
];

interface Available {
  e164: string;
  friendly: string;
  locality: string | null;
}

export function describeError(e: unknown): string {
  const err = e as FunctionError;
  const map: Record<string, string> = {
    email_not_verified: 'Verify your email address before buying a number. Check your inbox for the confirmation link.',
    forbidden: 'Only workspace owners and admins can manage numbers.',
    twilio_not_configured: 'Twilio is not configured on the server yet.',
    unauthorized: 'Your session expired. Log in again.',
  };
  if (map[err?.message]) return map[err.message];
  if (/Failed to send a request|Failed to fetch/i.test(err?.message ?? '')) return 'Could not reach the number service. Check that the Edge Functions are deployed.';
  return err?.message || 'Something went wrong.';
}

/** Option A: buy a Decibel number (with the regulatory bundle step when Twilio requires it). */
export function BuyNumberPanel({ workspaceId, onDone }: { workspaceId: string; onDone: (n: PhoneNumber) => void }) {
  const qc = useQueryClient();
  const [country, setCountry] = useState('GB');
  // Mobile 07 first: it needs no address check, so it can be bought straight away with an approved bundle
  const [area, setArea] = useState('mobile');
  const [euType, setEuType] = useState<NumberType>('local');
  const [results, setResults] = useState<Available[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bundleFor, setBundleFor] = useState<Available | null>(null);
  const [pending, setPending] = useState<PhoneNumber | null>(null);

  const selected = AREAS.find((a) => a.id === area)!;
  const type: NumberType = country === 'GB' ? selected.type : euType;

  const search = async () => {
    setSearching(true);
    setError(null);
    setResults(null);
    try {
      const res = await invoke<{ numbers: Available[] }>('twilio-numbers', {
        workspace_id: workspaceId,
        action: 'search',
        country,
        type,
        prefix: country === 'GB' ? selected.prefix : undefined,
      });
      setResults(res.numbers);
      track('number_requested', { kind: type, country });
    } catch (e) {
      setError(describeError(e));
    } finally {
      setSearching(false);
    }
  };

  const buy = async (n: Available) => {
    setBuying(n.e164);
    setError(null);
    try {
      const res = await invoke<{ number?: PhoneNumber; needs_bundle?: boolean }>('twilio-numbers', {
        workspace_id: workspaceId,
        action: 'buy',
        e164: n.e164,
        type,
        country,
      });
      if (res.needs_bundle) setBundleFor(n);
      else if (res.number) {
        track('number_activated', { kind: type, country });
        void qc.invalidateQueries({ queryKey: ['numbers'] });
        onDone(res.number);
      }
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
            Your number activates once Twilio approves your details (usually under 1 business day). We will email you. Meanwhile, verify your own number as caller ID to start calling straight away.
          </p>
        </div>
      </div>
    );
  }

  if (bundleFor) {
    return (
      <BundleForm
        workspaceId={workspaceId}
        number={bundleFor}
        type={type}
        country={country}
        onBack={() => setBundleFor(null)}
        onSubmitted={(n) => {
          void qc.invalidateQueries({ queryKey: ['numbers'] });
          setPending(n);
          onDone(n);
        }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <Field label="Country" htmlFor="num-country">
          <Select id="num-country" value={country} onChange={(e) => { setCountry(e.target.value); setResults(null); }}>
            {NUMBER_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={country === 'GB' ? 'Area' : 'Type'}>
          {country === 'GB' ? (
            <PillSelect single options={AREAS.map((a) => ({ value: a.id, label: a.label }))} value={[area]} onChange={(v) => { setArea(v[0]); setResults(null); }} />
          ) : (
            <PillSelect<NumberType>
              single
              options={[
                { value: 'local', label: 'Local' },
                { value: 'national', label: 'National' },
                { value: 'mobile', label: 'Mobile' },
              ]}
              value={[euType]}
              onChange={(v) => { setEuType(v[0]); setResults(null); }}
            />
          )}
        </Field>
      </div>
      <div>
        <Button onClick={search} loading={searching}>
          Search available numbers
        </Button>
      </div>
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
                {n.locality ? <span className="t-small text-black-700 max-sm:hidden">{n.locality}</span> : null}
                <Button size="compact" variant="primary" loading={buying === n.e164} disabled={!!buying} onClick={() => buy(n)}>
                  Buy
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

function BundleForm({
  workspaceId,
  number,
  type,
  country,
  onBack,
  onSubmitted,
}: {
  workspaceId: string;
  number: Available;
  type: NumberType;
  country: string;
  onBack: () => void;
  onSubmitted: (n: PhoneNumber) => void;
}) {
  const [form, setForm] = useState({ name: '', registration_number: '', street: '', city: '', postcode: '', website: '' });
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let document: Record<string, string> | undefined;
      if (file) {
        const path = `${workspaceId}/bundles/${crypto.randomUUID()}-${file.name.replace(/[^\w.-]/g, '_')}`;
        const { error: upErr } = await supabase().storage.from('imports').upload(path, file);
        if (upErr) throw new Error(`Upload failed: ${upErr.message}`);
        document = { storage_path: path, filename: file.name, type: 'utility_bill' };
      }
      const res = await invoke<{ number: PhoneNumber }>('twilio-numbers', {
        workspace_id: workspaceId,
        action: 'create_bundle',
        e164: number.e164,
        type,
        country,
        business: form,
        document,
      });
      onSubmitted(res.number);
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
          Regulators require a verified business address for this number. Twilio reviews it, usually in under 1 business day.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Registered business name" htmlFor="b-name">
          <Input id="b-name" required value={form.name} onChange={set('name')} />
        </Field>
        <Field label="Company registration number" htmlFor="b-reg" hint="Companies House number for UK businesses">
          <Input id="b-reg" value={form.registration_number} onChange={set('registration_number')} />
        </Field>
        <Field label="Street address" htmlFor="b-street" className="sm:col-span-2">
          <Input id="b-street" required value={form.street} onChange={set('street')} />
        </Field>
        <Field label="City" htmlFor="b-city">
          <Input id="b-city" required value={form.city} onChange={set('city')} />
        </Field>
        <Field label="Postcode" htmlFor="b-post">
          <Input id="b-post" required value={form.postcode} onChange={set('postcode')} />
        </Field>
        <Field label="Proof of address" htmlFor="b-doc" hint="Utility bill or bank statement from the last 3 months (PDF, JPG or PNG)" className="sm:col-span-2">
          <input id="b-doc" type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block w-full text-black-700 file:mr-3 file:h-9 file:rounded-sm file:border file:border-white-800 file:bg-white-100 file:px-3" />
        </Field>
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

/** Option B: verify an existing number as caller ID. Twilio calls it and the user keys in the code shown. */
export function VerifyCallerIdPanel({ workspaceId, onDone, initialNumber = '' }: { workspaceId: string; onDone: (n: PhoneNumber) => void; initialNumber?: string }) {
  const qc = useQueryClient();
  const [raw, setRaw] = useState(initialNumber);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<PhoneNumber | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const e164 = normalizePhone(raw);

  useEffect(() => () => { if (poll.current) clearInterval(poll.current); }, []);

  const check = async (): Promise<boolean> => {
    const res = await invoke<{ verified: boolean; number?: PhoneNumber }>('twilio-numbers', { workspace_id: workspaceId, action: 'verify_check', e164 });
    if (res.verified && res.number) {
      if (poll.current) clearInterval(poll.current);
      setVerified(res.number);
      setCode(null);
      track('caller_id_verified', { kind: 'verified_caller_id', country: res.number.country_code });
      void qc.invalidateQueries({ queryKey: ['numbers'] });
      onDone(res.number);
      return true;
    }
    return false;
  };

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!e164) {
      setError('Enter a valid phone number, for example 07700 900123.');
      return;
    }
    setBusy(true);
    setError(null);
    setTimedOut(false);
    try {
      if (await check()) return; // already verified on this account
      const res = await invoke<{ validation_code: string }>('twilio-numbers', { workspace_id: workspaceId, action: 'verify_start', e164 });
      setCode(res.validation_code);
      let tries = 0;
      if (poll.current) clearInterval(poll.current);
      poll.current = setInterval(async () => {
        tries++;
        try {
          await check();
        } catch {
          /* keep polling */
        }
        if (tries >= 40 && poll.current) {
          clearInterval(poll.current);
          setTimedOut(true);
        }
      }, 3000);
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(false);
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
    <form onSubmit={start} className="flex flex-col gap-4">
      <Field label="Your phone number" htmlFor="verify-number" hint="Twilio will call this number now. Keep your phone to hand." error={error}>
        <div className="flex gap-2">
          <Input id="verify-number" type="tel" inputMode="tel" placeholder="07700 900123" value={raw} onChange={(e) => setRaw(e.target.value)} disabled={!!code && !timedOut} className="tabular-nums" />
          <Button type="submit" variant="primary" loading={busy} disabled={!!code && !timedOut}>
            {timedOut ? 'Call me again' : 'Call me'}
          </Button>
        </div>
      </Field>
      {code ? (
        <div className="card p-4" aria-live="polite">
          <p className="text-black-700">Answer the call and enter this code on your phone&apos;s keypad:</p>
          <p className="mt-2 tabular-nums text-xl leading-8 tracking-[0.06em]">{code}</p>
          <p className="t-caption mt-2 text-black-700">{timedOut ? 'We did not see the verification complete. Try again.' : 'Waiting for confirmation…'}</p>
        </div>
      ) : null}
    </form>
  );
}

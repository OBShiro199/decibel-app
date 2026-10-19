'use client';
// Settings sections shared across pages: the password form (Profile) and the Pro plan card (Plan & billing).
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { Field, Input, PillSelect } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { FAIR_USE_NOTE, PRO, PRO_FEATURES } from '@/lib/constants';
import { FOUNDER } from '@/lib/site';
import { useMembers } from '@/lib/hooks';
import { invoke, supabase } from '@/lib/supabase/client';
import { describeBillingError, errorMessage, isBillingNotConfigured, Notice, Section } from '@/app/app/settings/_components';

type Interval = 'monthly' | 'annual';

export function ChangePasswordSection() {
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const longEnough = password.length >= 10;
  const hasNumber = /\d/.test(password);
  const matches = password === confirm;

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!longEnough || !hasNumber || !matches) return;
    setPwBusy(true);
    setPwError(null);
    try {
      const { error: err } = await supabase().auth.updateUser({ password });
      if (err) throw err;
      setPassword('');
      setConfirm('');
      toast('Password changed');
    } catch (err) {
      setPwError(errorMessage(err));
    } finally {
      setPwBusy(false);
    }
  }

  return (
    <Section title="Password" description="At least 10 characters, including one number.">
      <form onSubmit={changePassword} className="card space-y-5 p-6" id="password">
        <Field label="New password" htmlFor="new_password" error={password && !longEnough ? 'Use at least 10 characters.' : password && !hasNumber ? 'Include at least one number.' : undefined}>
          <Input id="new_password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm_password" error={confirm && !matches ? 'The passwords do not match.' : undefined}>
          <Input id="confirm_password" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
        </Field>
        {pwError ? <Notice tone="danger">{pwError}</Notice> : null}
        <div className="flex justify-end">
          <Button type="submit" variant="primary" loading={pwBusy} disabled={!longEnough || !hasNumber || !matches}>
            Change password
          </Button>
        </div>
      </form>
    </Section>
  );
}

export function ProPlanSection() {
  const { workspace, isOwner } = useApp();
  const members = useMembers();
  // monthly only (no annual plan)
  const interval: Interval = 'monthly';
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; calm: boolean } | null>(null);
  const seats = members.data?.length ?? 1;

  const current = workspace.plan === PRO.tier;

  async function choose() {
    setBusy(true);
    setError(null);
    track('checkout_started', { plan: PRO.tier, seats });
    try {
      const { url } = await invoke<{ url: string }>('billing', { workspace_id: workspace.id, action: 'checkout', plan: PRO.tier, interval });
      window.location.assign(url);
    } catch (e) {
      setError({ message: describeBillingError(e), calm: isBillingNotConfigured(e) });
      setBusy(false);
    }
  }

  return (
    <div id="pro">
      <Section
        title="Decibel Pro"
        description={`You have ${seats} member${seats === 1 ? '' : 's'}, so you will be billed for ${seats} seat${seats === 1 ? '' : 's'}.`}
      >
        {error ? <Notice tone={error.calm ? 'neutral' : 'danger'} className="mb-4">{error.message}</Notice> : null}
        <div className="card flex max-w-[520px] flex-col p-6">
          <div className="flex items-center gap-2">
            <h3 className="t-h3">{PRO.name}</h3>
            {current ? <Badge tone="accent">Current plan</Badge> : null}
          </div>
          <p className="mt-4">
            <span className="t-h1 tabular">£{PRO.monthly}</span>
            <span className="text-black-700"> / seat / month</span>
          </p>
          <p className="t-small mt-1 text-black-700">
            {`Billed monthly, excluding VAT. We set you up in ${PRO.setupDays} days.`}
          </p>
          <ul className="mt-5 flex-1 space-y-2">
            {PRO_FEATURES.map((f) => (
              <li key={f} className="flex gap-2">
                <Check size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-black-700" />
                {f}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            {current ? (
              <Button disabled className="w-full">
                Current plan
              </Button>
            ) : isOwner ? (
              <Button variant="primary" className="w-full" loading={busy} disabled={busy} onClick={choose}>
                Choose {PRO.name}
              </Button>
            ) : (
              <p className="t-small flex h-9 items-center justify-center rounded-sm border border-white-800 bg-white-200 text-black-700">Ask the workspace owner</p>
            )}
          </div>
          <p className="t-small mt-4 text-black-700">
            {FAIR_USE_NOTE}{' '}
            <a href="/fair-use" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              How minutes work
            </a>
          </p>
          <p className="t-small mt-2 text-black-700">
            Bigger team? <a href={`mailto:${FOUNDER.email}`} className="underline underline-offset-2">Talk to us</a>
          </p>
        </div>
      </Section>
    </div>
  );
}

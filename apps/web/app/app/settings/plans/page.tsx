'use client';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { PillSelect } from '@/components/ui/form';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { ANNUAL_SAVING, ANNUAL_SAVING_PCT, FAIR_USE_NOTE, PRO, PRO_FEATURES } from '@/lib/constants';
import { FOUNDER } from '@/lib/site';
import { useMembers } from '@/lib/hooks';
import { invoke } from '@/lib/supabase/client';
import type { PlanTier } from '@/lib/types';
import { daysLeft, formatDate } from '@/lib/utils';
import { describeBillingError, isBillingNotConfigured, Notice, Section, SettingsPage } from '../_components';

type Interval = 'monthly' | 'annual';
const PLAN_NAME: Record<PlanTier, string> = { trial: 'Free trial', starter: 'Starter', growth: 'Pro', scale: 'Scale' };

export default function PlansPage() {
  const { workspace, isOwner } = useApp();
  const members = useMembers();
  const [interval, setIntervalValue] = useState<Interval>('monthly');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; calm: boolean } | null>(null);
  const seats = members.data?.length ?? 1;
  const trial = workspace.plan === 'trial';
  const left = daysLeft(workspace.trial_ends_at);

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
    <SettingsPage title="Plans" description="One plan, priced per seat. Seats follow the number of members in your workspace.">
      <Section title="Current plan">
        <div className="card flex flex-wrap items-center gap-4 p-6">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2">
              <span className="t-h4">{PLAN_NAME[workspace.plan]}</span>
              {trial ? <Badge tone={left <= 3 ? 'warning' : 'neutral'}>{left === 0 ? 'Trial ended' : `${left} day${left === 1 ? '' : 's'} left`}</Badge> : null}
            </p>
            <p className="t-small mt-1 text-black-700">
              {trial
                ? left === 0
                  ? `Your trial ended on ${formatDate(workspace.trial_ends_at)}. Choose a plan to keep calling.`
                  : `Your trial ends on ${formatDate(workspace.trial_ends_at)}. Choose a plan at any time to keep calling.`
                : `${seats} seat${seats === 1 ? '' : 's'}. Manage payment details and invoices in Billing.`}
            </p>
          </div>
          {!trial ? <ButtonLink href="/app/settings/billing">Go to Billing</ButtonLink> : null}
        </div>
      </Section>

      <Section
        title="Decibel Pro"
        description={`You have ${seats} member${seats === 1 ? '' : 's'}, so you will be billed for ${seats} seat${seats === 1 ? '' : 's'}.`}
        actions={
          <PillSelect<Interval>
            single
            value={[interval]}
            onChange={(v) => setIntervalValue(v[0] ?? 'monthly')}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'annual', label: `Annual, save ${ANNUAL_SAVING_PCT}%` },
            ]}
          />
        }
      >
        {error ? <Notice tone={error.calm ? 'neutral' : 'danger'} className="mb-4">{error.message}</Notice> : null}
        <div className="card flex max-w-[520px] flex-col p-6">
          <div className="flex items-center gap-2">
            <h3 className="t-h3">{PRO.name}</h3>
            {current ? <Badge tone="accent">Current plan</Badge> : null}
          </div>
          <p className="mt-4">
            <span className="t-h1 tabular">£{(interval === 'annual' ? PRO.annual : PRO.monthly).toLocaleString('en-GB')}</span>
            <span className="text-black-700"> / seat / {interval === 'annual' ? 'year' : 'month'}</span>
          </p>
          <p className="t-small mt-1 text-black-700">
            {interval === 'annual'
              ? `£${Math.round(PRO.annual / 12)} a month, saving £${ANNUAL_SAVING.toLocaleString('en-GB')} a year. Excluding VAT.`
              : `Billed monthly, or £${PRO.annual.toLocaleString('en-GB')} a year. Excluding VAT.`}
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
              Fair use policy
            </a>
          </p>
          <p className="t-small mt-2 text-black-700">
            Bigger team? <a href={`mailto:${FOUNDER.email}`} className="underline underline-offset-2">Talk to us</a>
          </p>
        </div>
      </Section>
    </SettingsPage>
  );
}

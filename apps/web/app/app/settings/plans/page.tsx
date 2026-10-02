'use client';
import { Check } from 'lucide-react';
import { useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/display';
import { PillSelect } from '@/components/ui/form';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { ANNUAL_DISCOUNT, PLANS } from '@/lib/constants';
import { useMembers } from '@/lib/hooks';
import { invoke } from '@/lib/supabase/client';
import type { PlanTier } from '@/lib/types';
import { cn, daysLeft, formatDate } from '@/lib/utils';
import { describeBillingError, isBillingNotConfigured, Notice, Section, SettingsPage } from '../_components';

type Interval = 'monthly' | 'annual';
type PaidPlan = keyof typeof PLANS;
const PLAN_NAME: Record<PlanTier, string> = { trial: 'Free trial', starter: 'Starter', growth: 'Growth', scale: 'Scale' };

const FEATURES: Record<PaidPlan | 'scale', string[]> = {
  starter: [`${PLANS.starter.credits.toLocaleString('en-GB')} data credits per seat each month`, 'Browser dialler and pipeline', 'TPS and DNC screening on every call', `Recordings kept for ${PLANS.starter.recordings}`],
  growth: [`${PLANS.growth.credits.toLocaleString('en-GB')} data credits per seat each month`, 'Everything in Starter', `Recordings kept for ${PLANS.growth.recordings}`],
  scale: ['Everything in Growth', 'Custom credit volumes', 'Pricing agreed with our team'],
};

export default function PlansPage() {
  const { workspace, isOwner } = useApp();
  const members = useMembers();
  const [interval, setIntervalValue] = useState<Interval>('monthly');
  const [busy, setBusy] = useState<PaidPlan | null>(null);
  const [error, setError] = useState<{ message: string; calm: boolean } | null>(null);
  const seats = members.data?.length ?? 1;
  const trial = workspace.plan === 'trial';
  const left = daysLeft(workspace.trial_ends_at);

  const price = (plan: PaidPlan) => {
    const monthly = PLANS[plan].monthly;
    const v = interval === 'annual' ? monthly * (1 - ANNUAL_DISCOUNT) : monthly;
    return Number.isInteger(v) ? String(v) : v.toFixed(2);
  };

  async function choose(plan: PaidPlan) {
    setBusy(plan);
    setError(null);
    track('checkout_started', { plan, seats });
    try {
      const { url } = await invoke<{ url: string }>('billing', { workspace_id: workspace.id, action: 'checkout', plan, interval });
      window.location.assign(url);
    } catch (e) {
      setError({ message: describeBillingError(e), calm: isBillingNotConfigured(e) });
      setBusy(null);
    }
  }

  const card = (plan: PaidPlan) => {
    const current = workspace.plan === plan;
    const highlighted = plan === 'growth';
    return (
      <div key={plan} className={cn('card flex flex-col p-6', highlighted && 'border-black-700')}>
        <div className="flex items-center gap-2">
          <h3 className="t-h3">{PLANS[plan].name}</h3>
          {current ? <Badge tone="accent">Current plan</Badge> : highlighted ? <Badge>Most popular</Badge> : null}
        </div>
        <p className="mt-4">
          <span className="t-h1 tabular">£{price(plan)}</span>
          <span className="text-black-700"> / seat / month</span>
        </p>
        <p className="t-small mt-1 text-black-700">{interval === 'annual' ? 'Billed annually, excluding VAT.' : 'Billed monthly, excluding VAT.'}</p>
        <ul className="mt-5 flex-1 space-y-2">
          {FEATURES[plan].map((f) => (
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
            <Button variant={highlighted ? 'primary' : 'outline'} className="w-full" loading={busy === plan} disabled={busy !== null} onClick={() => choose(plan)}>
              Choose {PLANS[plan].name}
            </Button>
          ) : (
            <p className="t-small flex h-9 items-center justify-center rounded-sm border border-white-800 bg-white-200 text-black-700">Ask the workspace owner</p>
          )}
        </div>
      </div>
    );
  };

  return (
    <SettingsPage title="Plans" description="Simple per-seat pricing. Seats follow the number of members in your workspace.">
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
        title="Choose a plan"
        description={`You have ${seats} member${seats === 1 ? '' : 's'}, so you will be billed for ${seats} seat${seats === 1 ? '' : 's'}.`}
        actions={
          <PillSelect<Interval>
            single
            value={[interval]}
            onChange={(v) => setIntervalValue(v[0] ?? 'monthly')}
            options={[
              { value: 'monthly', label: 'Monthly' },
              { value: 'annual', label: `Annual (−${Math.round(ANNUAL_DISCOUNT * 100)}%)` },
            ]}
          />
        }
      >
        {error ? <Notice tone={error.calm ? 'neutral' : 'danger'} className="mb-4">{error.message}</Notice> : null}
        <div className="grid gap-4 lg:grid-cols-3">
          {card('starter')}
          {card('growth')}
          <div className="card flex flex-col p-6">
            <div className="flex items-center gap-2">
              <h3 className="t-h3">Scale</h3>
              {workspace.plan === 'scale' ? <Badge tone="accent">Current plan</Badge> : null}
            </div>
            <p className="mt-4">
              <span className="t-h1">Talk to us</span>
            </p>
            <p className="t-small mt-1 text-black-700">For larger teams with custom needs.</p>
            <ul className="mt-5 flex-1 space-y-2">
              {FEATURES.scale.map((f) => (
                <li key={f} className="flex gap-2">
                  <Check size={16} strokeWidth={1.5} className="mt-0.5 shrink-0 text-black-700" />
                  {f}
                </li>
              ))}
            </ul>
            <ButtonLink href="mailto:sales@decibels.io" className="mt-6 w-full">
              Talk to us
            </ButtonLink>
          </div>
        </div>
      </Section>
    </SettingsPage>
  );
}

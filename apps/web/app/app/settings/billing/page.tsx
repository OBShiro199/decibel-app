'use client';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Badge, ErrorCard, Skeleton, StatTile, TableSkeleton } from '@/components/ui/display';
import { Dialog, useToast } from '@/components/ui/overlay';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { CREDIT_PACKS, type Tone } from '@/lib/constants';
import { useMemberNames, useMembers } from '@/lib/hooks';
import { invoke, supabase } from '@/lib/supabase/client';
import type { PlanTier, Subscription } from '@/lib/types';
import { cn, daysLeft, formatDate, formatTalkTime } from '@/lib/utils';
import { AdminOnly, describeBillingError, fetchAll, isBillingNotConfigured, Notice, Section, SettingsPage } from '../_components';

interface CreditTx {
  id: string | number;
  user_id: string | null;
  delta: number;
  reason: string;
  note: string | null;
  created_at: string;
}
interface Invoice {
  id: string;
  number: string | null;
  created: number;
  total: number;
  currency: string;
  status: string | null;
  url: string | null;
}

const PLAN_NAME: Record<PlanTier, string> = { trial: 'Free trial', starter: 'Starter', growth: 'Growth', scale: 'Scale' };
const SUB_STATUS: Record<Subscription['status'], { label: string; tone: Tone }> = {
  trialing: { label: 'Trialling', tone: 'neutral' },
  active: { label: 'Active', tone: 'success' },
  past_due: { label: 'Payment overdue', tone: 'danger' },
  canceled: { label: 'Cancelled', tone: 'neutral' },
  paused: { label: 'Paused', tone: 'warning' },
  incomplete: { label: 'Payment incomplete', tone: 'warning' },
};
const REASON: Record<string, string> = {
  trial_grant: 'Welcome credits',
  purchase: 'Credit pack',
  subscription_grant: 'Monthly plan credits',
  reveal: 'Contact reveal',
  refund: 'Refund',
  admin_adjustment: 'Adjustment',
};
const money = (pence: number, currency: string) => {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency: (currency || 'gbp').toUpperCase() }).format(pence / 100);
  } catch {
    return `£${(pence / 100).toFixed(2)}`;
  }
};

export default function BillingPage() {
  const { workspace, isAdmin, isOwner, refreshWorkspace } = useApp();
  const toast = useToast();
  const members = useMembers();
  const names = useMemberNames();
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; calm: boolean } | null>(null);

  // Stripe return URLs: ?checkout=success / ?credits=success
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const credits = params.get('credits') === 'success';
    const checkout = params.get('checkout') === 'success';
    if (!credits && !checkout) return;
    if (credits) {
      track('credits_purchased', {});
      toast('Credits added');
    }
    if (checkout) toast('Subscription started');
    void refreshWorkspace();
    window.history.replaceState(null, '', window.location.pathname);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sub = useQuery({
    queryKey: ['subscription', workspace.id],
    queryFn: async () => {
      const { data, error: err } = await supabase().from('subscriptions').select('*').eq('workspace_id', workspace.id).maybeSingle();
      if (err) throw err;
      return (data ?? null) as Subscription | null;
    },
  });

  const ledger = useQuery({
    queryKey: ['credit-tx', workspace.id],
    queryFn: async () => {
      const { data, error: err } = await supabase()
        .from('credit_transactions')
        .select('id,user_id,delta,reason,note,created_at')
        .eq('workspace_id', workspace.id)
        .order('id', { ascending: false })
        .limit(100);
      if (err) throw err;
      return (data ?? []) as CreditTx[];
    },
  });

  const minutes = useQuery({
    queryKey: ['minutes-used', workspace.id],
    queryFn: async () => {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const rows = await fetchAll<{ duration_seconds: number | null }>((from, to) =>
        supabase().from('calls').select('duration_seconds').eq('workspace_id', workspace.id).eq('direction', 'outbound').gte('started_at', start.toISOString()).order('started_at').range(from, to),
      );
      return rows.reduce((sum, r) => sum + (r.duration_seconds ?? 0), 0);
    },
  });

  const invoices = useQuery({
    queryKey: ['invoices', workspace.id],
    enabled: isAdmin,
    retry: false,
    queryFn: async () => (await invoke<{ invoices: Invoice[] }>('billing', { workspace_id: workspace.id, action: 'invoices' })).invoices ?? [],
  });

  async function go(key: string, body: Record<string, unknown>) {
    setBusy(key);
    setError(null);
    try {
      const { url } = await invoke<{ url: string }>('billing', { workspace_id: workspace.id, ...body });
      window.location.assign(url);
    } catch (e) {
      setError({ message: describeBillingError(e), calm: isBillingNotConfigured(e) });
      setBusy(null);
    }
  }

  const trial = workspace.plan === 'trial';
  const status = sub.data ? SUB_STATUS[sub.data.status] : null;
  const seats = members.data?.length;
  const errorNotice = error ? <Notice tone={error.calm ? 'neutral' : 'danger'}>{error.message}</Notice> : null;

  return (
    <SettingsPage title="Billing" description="Your plan, credits, minutes and invoices.">
      {!creditsOpen ? errorNotice : null}

      <Section title="Plan">
        {sub.isError ? (
          <ErrorCard message="Could not load your subscription." onRetry={() => sub.refetch()} />
        ) : (
          <div className="card flex flex-wrap items-center gap-4 p-6">
            <div className="min-w-0 flex-1">
              {sub.isLoading ? (
                <>
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="mt-2 w-56" />
                </>
              ) : (
                <>
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="t-h4">{PLAN_NAME[workspace.plan]}</span>
                    {status && !trial ? <Badge tone={status.tone}>{status.label}</Badge> : null}
                    {trial ? <Badge>{daysLeft(workspace.trial_ends_at)} days left</Badge> : null}
                  </p>
                  <p className="t-small mt-1 text-black-700">
                    {seats !== undefined ? `${seats} seat${seats === 1 ? '' : 's'} (one per member)` : 'Seats follow your member count'}
                    {trial
                      ? ` · Trial ends ${formatDate(workspace.trial_ends_at)}`
                      : sub.data?.current_period_end
                        ? ` · ${sub.data.cancel_at_period_end ? 'Ends' : 'Renews'} ${formatDate(sub.data.current_period_end)}`
                        : ''}
                  </p>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href="/app/settings/plans">{trial ? 'Choose a plan' : 'Change plan'}</ButtonLink>
              {isOwner ? (
                <Button loading={busy === 'portal'} disabled={busy !== null} onClick={() => go('portal', { action: 'portal' })}>
                  Manage in Stripe
                  <ExternalLink size={16} strokeWidth={1.5} />
                </Button>
              ) : null}
            </div>
          </div>
        )}
        {!isOwner ? <p className="t-small mt-3 text-black-700">Only the workspace owner can manage the subscription in Stripe.</p> : null}
      </Section>

      <Section
        title="Credits and minutes"
        actions={
          <Button variant="primary" disabled={!isAdmin} onClick={() => { setError(null); setCreditsOpen(true); }}>
            Buy credits
          </Button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-3">
          <StatTile label="Data credits" value={workspace.credit_balance.toLocaleString('en-GB')} sub="One credit reveals one contact." />
          <StatTile
            label={trial ? 'Trial minutes left' : 'Minutes balance'}
            value={formatTalkTime(workspace.minute_balance_seconds)}
            sub={trial ? 'Included with your trial.' : 'Remaining calling time.'}
          />
          <StatTile label="Minutes used this month" value={minutes.isError ? 'n/a' : formatTalkTime(minutes.data ?? 0)} loading={minutes.isLoading} sub="Outbound calls since the 1st." />
        </div>
        {!isAdmin ? <AdminOnly className="mt-4">Only owners and admins can buy credits.</AdminOnly> : null}
      </Section>

      <Section title="Credit activity" description="Every change to your credit balance, newest first. Entries are permanent and cannot be edited or removed.">
        {ledger.isError ? (
          <ErrorCard message="Could not load credit activity." onRetry={() => ledger.refetch()} />
        ) : (
          <div className="card overflow-x-auto">
            {ledger.isLoading ? (
              <TableSkeleton rows={5} cols={5} />
            ) : !ledger.data?.length ? (
              <p className="p-6 text-black-700">No credit activity yet.</p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Reason</th>
                    <th>Member</th>
                    <th className="text-right">Credits</th>
                    <th className="text-right">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {ledger.data.map((t, i) => (
                    <tr key={t.id}>
                      <td className="whitespace-nowrap text-black-700">{formatDate(t.created_at, true)}</td>
                      <td>
                        {REASON[t.reason] ?? t.reason}
                        {t.note ? <span className="text-black-700"> · {t.note}</span> : null}
                      </td>
                      <td className="text-black-700">{t.user_id ? names[t.user_id] ?? '' : ''}</td>
                      <td className={cn('tabular text-right', t.delta > 0 && 'text-success-700')}>
                        {t.delta > 0 ? '+' : t.delta < 0 ? '−' : ''}
                        {Math.abs(t.delta).toLocaleString('en-GB')}
                      </td>
                      {/* the balance after this entry: today's balance minus everything newer */}
                      <td className="tabular text-right text-black-700">
                        {(workspace.credit_balance - ledger.data!.slice(0, i).reduce((s, x) => s + x.delta, 0)).toLocaleString('en-GB')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Section>

      <Section title="Invoices">
        {!isAdmin ? (
          <AdminOnly>Only owners and admins can see invoices.</AdminOnly>
        ) : invoices.isError ? (
          isBillingNotConfigured(invoices.error) ? (
            <Notice>{describeBillingError(invoices.error)}</Notice>
          ) : (
            <ErrorCard message={describeBillingError(invoices.error)} onRetry={() => invoices.refetch()} />
          )
        ) : (
          <div className="card overflow-x-auto">
            {invoices.isLoading ? (
              <TableSkeleton rows={3} cols={4} />
            ) : !invoices.data?.length ? (
              <p className="p-6 text-black-700">No invoices yet.</p>
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Invoice</th>
                    <th>Date</th>
                    <th>Status</th>
                    <th className="text-right">Total</th>
                    <th className="w-20" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.data.map((inv) => (
                    <tr key={inv.id}>
                      <td className="t-mono">{inv.number ?? inv.id}</td>
                      <td className="whitespace-nowrap text-black-700">{formatDate(new Date(inv.created * 1000).toISOString())}</td>
                      <td>
                        <Badge tone={inv.status === 'paid' ? 'success' : inv.status === 'open' ? 'warning' : 'neutral'}>{inv.status ? inv.status.charAt(0).toUpperCase() + inv.status.slice(1) : 'Unknown'}</Badge>
                      </td>
                      <td className="tabular text-right">{money(inv.total, inv.currency)}</td>
                      <td className="text-right">
                        {inv.url ? (
                          <a href={inv.url} target="_blank" rel="noreferrer" className="link">
                            View
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Section>

      <Dialog open={creditsOpen} onClose={() => setCreditsOpen(false)} title="Buy credits" description="One-off packs. Credits are added once payment completes.">
        <ul className="space-y-2">
          {CREDIT_PACKS.map((p) => (
            <li key={p.id} className="flex items-center gap-4 rounded-md border border-white-800 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="t-h4 tabular">{p.credits.toLocaleString('en-GB')} credits</p>
                <p className="t-small mt-0.5 text-black-700">
                  £{p.price.toLocaleString('en-GB')} · {((p.price / p.credits) * 100).toFixed(1).replace(/\.0$/, '')}p per credit
                </p>
              </div>
              <Button variant="primary" loading={busy === `pack-${p.id}`} disabled={busy !== null} onClick={() => go(`pack-${p.id}`, { action: 'credits', pack: p.id })}>
                Buy
              </Button>
            </li>
          ))}
        </ul>
        {creditsOpen && errorNotice ? <div className="mt-4">{errorNotice}</div> : null}
      </Dialog>
    </SettingsPage>
  );
}

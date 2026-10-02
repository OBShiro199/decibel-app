'use client';
import { useQueryClient } from '@tanstack/react-query';
import { Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { BuyNumberPanel, describeError, VerifyCallerIdPanel } from '@/components/app/number-flows';
import { Button } from '@/components/ui/button';
import { Badge, EmptyState, ErrorCard, TableSkeleton } from '@/components/ui/display';
import { Select } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import type { Tone } from '@/lib/constants';
import { useApp } from '@/lib/app-context';
import { useMembers, useNumbers } from '@/lib/hooks';
import { invoke } from '@/lib/supabase/client';
import type { PhoneNumber, PhoneNumberKind, PhoneNumberStatus } from '@/lib/types';
import { cn, formatPhone } from '@/lib/utils';
import { AdminOnly, Notice, Section, SettingsPage } from '../_components';

const KIND: Record<PhoneNumberKind, string> = {
  twilio_local: 'Local',
  twilio_national: 'National',
  twilio_mobile: 'Mobile',
  verified_caller_id: 'Verified caller ID',
};
const STATUS: Record<PhoneNumberStatus, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  pending_review: { label: 'Pending review', tone: 'warning' },
  pending_bundle: { label: 'Pending bundle', tone: 'warning' },
  rejected: { label: 'Rejected', tone: 'danger' },
  released: { label: 'Released', tone: 'neutral' },
};

export default function PhoneNumbersPage() {
  const { workspace, isAdmin } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const numbers = useNumbers();
  const members = useMembers();
  const [buyOpen, setBuyOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [releasing, setReleasing] = useState<PhoneNumber | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: ['numbers'] });

  async function act(n: PhoneNumber, action: 'set_default' | 'assign' | 'release', extra: Record<string, unknown>, done: string) {
    setBusyId(n.id);
    setError(null);
    try {
      await invoke('twilio-numbers', { workspace_id: workspace.id, action, id: n.id, ...extra });
      await refresh();
      toast(done);
      return true;
    } catch (e) {
      setError(describeError(e));
      return false;
    } finally {
      setBusyId(null);
    }
  }

  const actions = (
    <>
      <Button disabled={!isAdmin} onClick={() => setVerifyOpen(true)}>
        Verify my number
      </Button>
      <Button variant="primary" disabled={!isAdmin} onClick={() => setBuyOpen(true)}>
        <Plus size={16} strokeWidth={1.5} />
        Get a number
      </Button>
    </>
  );

  return (
    <SettingsPage title="Phone numbers" description="The numbers your team calls from. The default is used when a rep has no number assigned." actions={actions}>
      {!isAdmin ? <AdminOnly>Only owners and admins can manage numbers.</AdminOnly> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Section title="Numbers">
        {numbers.isError ? (
          <ErrorCard message="Could not load phone numbers." onRetry={() => numbers.refetch()} />
        ) : numbers.isLoading ? (
          <div className="card">
            <TableSkeleton rows={3} cols={5} />
          </div>
        ) : !numbers.data?.length ? (
          <div className="card">
            <EmptyState
              title="No number yet"
              description="Get a local number, or verify a number you already own to use as your caller ID."
              action={
                <>
                  <Button variant="primary" disabled={!isAdmin} onClick={() => setBuyOpen(true)}>
                    Get a number
                  </Button>
                  <Button disabled={!isAdmin} onClick={() => setVerifyOpen(true)}>
                    Verify my number
                  </Button>
                </>
              }
            />
          </div>
        ) : (
          <div className="card overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th className="w-10">Default</th>
                  <th>Number</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="w-48">Assigned to</th>
                  <th className="w-24" />
                </tr>
              </thead>
              <tbody>
                {numbers.data.map((n) => {
                  const status = STATUS[n.status] ?? STATUS.active;
                  const assignee = (members.data ?? []).find((m) => m.user_id === n.assigned_user_id);
                  return (
                    <tr key={n.id}>
                      <td>
                        <button
                          type="button"
                          aria-label={n.is_default ? 'Default number' : `Make ${formatPhone(n.e164)} the default`}
                          aria-pressed={n.is_default}
                          title={n.is_default ? 'Default number' : n.status === 'active' ? 'Make default' : 'Only active numbers can be the default'}
                          disabled={!isAdmin || n.is_default || n.status !== 'active' || busyId === n.id}
                          onClick={() => act(n, 'set_default', {}, 'Default number updated')}
                          className={cn('flex h-8 w-8 items-center justify-center rounded-sm', n.is_default ? 'text-accent-500' : 'text-black-700 enabled:hover:bg-white-400 disabled:text-white-900')}
                        >
                          <Star size={16} strokeWidth={1.5} fill={n.is_default ? 'currentColor' : 'none'} />
                        </button>
                      </td>
                      <td className="t-mono whitespace-nowrap">{formatPhone(n.e164)}</td>
                      <td>
                        <Badge>{KIND[n.kind] ?? n.kind}</Badge>
                      </td>
                      <td>
                        <Badge tone={status.tone}>{status.label}</Badge>
                      </td>
                      <td>
                        {isAdmin ? (
                          <Select
                            aria-label={`Assign ${formatPhone(n.e164)}`}
                            value={n.assigned_user_id ?? ''}
                            disabled={busyId === n.id || members.isLoading}
                            onChange={(e) => act(n, 'assign', { user_id: e.target.value || null }, 'Assignment updated')}
                            className="[&_select]:h-8"
                          >
                            <option value="">Everyone</option>
                            {(members.data ?? []).map((m) => (
                              <option key={m.user_id} value={m.user_id}>
                                {m.profile?.full_name || m.profile?.email || 'Teammate'}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <span className="text-black-700">{assignee ? assignee.profile?.full_name || assignee.profile?.email : 'Everyone'}</span>
                        )}
                      </td>
                      <td className="text-right">
                        {isAdmin ? (
                          <Button variant="ghost" size="compact" disabled={busyId === n.id} onClick={() => setReleasing(n)}>
                            Release
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Dialog open={buyOpen} onClose={() => setBuyOpen(false)} title="Get a number" width={640}>
        <BuyNumberPanel
          workspaceId={workspace.id}
          onDone={() => {
            void refresh();
            setBuyOpen(false);
            toast('Number added');
          }}
        />
      </Dialog>

      <Dialog open={verifyOpen} onClose={() => setVerifyOpen(false)} title="Verify my number" description="Use a number you already own as your caller ID. We call it and ask you to enter a code.">
        <VerifyCallerIdPanel
          workspaceId={workspace.id}
          onDone={() => {
            void refresh();
            setVerifyOpen(false);
            toast('Number verified');
          }}
        />
      </Dialog>

      <Dialog
        open={Boolean(releasing)}
        onClose={() => setReleasing(null)}
        title="Release number"
        description={
          releasing?.kind === 'verified_caller_id'
            ? `${formatPhone(releasing.e164)} will be removed as a caller ID. You can verify it again later.`
            : `${formatPhone(releasing?.e164)} goes back to the carrier and you may not be able to get it again. Inbound calls to it will stop.`
        }
        footer={
          <>
            <Button onClick={() => setReleasing(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={Boolean(releasing) && busyId === releasing?.id}
              onClick={async () => {
                if (!releasing) return;
                await act(releasing, 'release', {}, 'Number released');
                setReleasing(null);
              }}
            >
              Release number
            </Button>
          </>
        }
      />
    </SettingsPage>
  );
}

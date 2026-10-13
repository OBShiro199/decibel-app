'use client';
// Team: members, invites, numbers and analytics in one place (migration 0032, `team` function).
// Owners and admins invite, change roles, give out numbers and remove people (their leads go to a
// colleague; their numbers are unassigned or released at Twilio). Everyone sees the team totals;
// calls and recordings themselves are admin-or-own, enforced by RLS.
import { CaretRight, Crown, Phone, UserMinus, UserPlus, UsersThree } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { OUTCOMES } from '@/lib/constants';
import { useMembers } from '@/lib/hooks';
import { invoke, supabase } from '@/lib/supabase/client';
import type { Invitation, Member } from '@/lib/types';
import { cn, formatDate, formatDuration, formatPhone, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Avatar, Badge } from '@/components/ui/display';
import { Checkbox, ChipsInput, Field, Select } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';

const BLUE = '#5f86e0';
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const n = (v: number) => v.toLocaleString('en-GB');
type Tab = 'members' | 'analytics';
type Range = 'today' | '7d' | '30d' | 'month';

interface Stat {
  user_id: string;
  full_name: string | null;
  email: string;
  avatar_url: string | null;
  role: 'owner' | 'admin' | 'member';
  joined_at: string;
  last_seen_at: string | null;
  dials: number;
  connects: number;
  meetings: number;
  talk_seconds: number;
  outcomes: Record<string, number>;
  recordings: number;
  last_call_at: string | null;
  numbers: { id: string; e164: string; kind: string; is_default: boolean }[];
}
interface NumberRow {
  id: string;
  e164: string;
  kind: string;
  is_default: boolean;
  assigned_user_id: string | null;
}

const errText = (e: unknown) => String((e as { data?: { message?: string } }).data?.message ?? (e as Error).message ?? 'Something went wrong.');

function rangeBounds(r: Range): { from: string; to: string; label: string } {
  const now = new Date();
  const start = new Date(now);
  if (r === 'today') start.setHours(0, 0, 0, 0);
  else if (r === '7d') start.setDate(now.getDate() - 7);
  else if (r === '30d') start.setDate(now.getDate() - 30);
  else start.setDate(1), start.setHours(0, 0, 0, 0);
  const label = { today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days', month: 'This month' }[r];
  return { from: start.toISOString(), to: new Date(now.getTime() + 60_000).toISOString(), label };
}

const teamStatsQuery = (workspaceId: string, r: Range) => {
  const { from, to } = rangeBounds(r);
  return {
    queryKey: ['team-stats', workspaceId, r],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase().rpc('team_stats', { p_workspace_id: workspaceId, p_from: from, p_to: to });
      if (error) throw error;
      return (data ?? []) as Stat[];
    },
  };
};

// ---- invite ------------------------------------------------------------------------------------------
function InviteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const [emails, setEmails] = useState<string[]>([]);
  const [role, setRole] = useState<'member' | 'admin'>('member');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<{ email: string; status: string; sent: boolean; link: string | null }[] | null>(null);

  const close = () => {
    setEmails([]);
    setRole('member');
    setResults(null);
    setError('');
    onClose();
  };
  async function send() {
    setBusy(true);
    setError('');
    try {
      const r = await invoke<{ results: { email: string; status: string; sent: boolean; link: string | null }[] }>('team', { action: 'invite', workspace_id: workspace.id, emails, role });
      track('invite_sent', { role, count: r.results.filter((x) => x.status === 'invited').length });
      void qc.invalidateQueries({ queryKey: ['invitations', workspace.id] });
      if (r.results.every((x) => x.status === 'invited' && x.sent)) {
        toast(r.results.length === 1 ? `Invite sent to ${r.results[0].email}` : `${r.results.length} invites sent`);
        close();
      } else setResults(r.results);
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={results ? 'Invites' : 'Invite your team'}
      description={results ? undefined : 'They get an email from Decibel with a link to set a password and join. Each person is one seat.'}
      footer={
        results ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!emails.length} onClick={() => void send()}>
              <UserPlus size={15} weight="duotone" /> Send {emails.length > 1 ? `${emails.length} invites` : 'invite'}
            </Button>
          </>
        )
      }
    >
      {results ? (
        <ul className="space-y-3">
          {results.map((r) => (
            <li key={r.email}>
              <p className="flex items-center gap-2">
                {r.email}
                {r.status === 'already_member' ? (
                  <Badge>Already in the team</Badge>
                ) : r.status === 'invalid' ? (
                  <Badge tone="danger">Not an email address</Badge>
                ) : r.sent ? (
                  <Badge tone="success">Email sent</Badge>
                ) : (
                  <Badge tone="warning">Email not sent</Badge>
                )}
              </p>
              {r.status === 'invited' && !r.sent && r.link ? (
                <button className="t-small mt-1 text-[#3653a3] underline" onClick={async () => toast((await navigator.clipboard.writeText(r.link!).then(() => true, () => false)) ? 'Invite link copied' : 'Could not copy')}>
                  Copy their invite link instead
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-5">
          <Field label="Email addresses" htmlFor="team-invite-emails" hint="Press Enter or comma after each address.">
            <ChipsInput id="team-invite-emails" value={emails} onChange={setEmails} placeholder="name@company.co.uk" validate={(v) => EMAIL.test(v)} />
          </Field>
          <Field label="Role" htmlFor="team-invite-role" hint="Admins can invite people, give out numbers and see everyone's calls and recordings.">
            <Select id="team-invite-role" value={role} onChange={(e) => setRole(e.target.value as 'member' | 'admin')}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
          {error ? (
            <p role="alert" className="text-danger-700">
              {error}
            </p>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}

// ---- remove ------------------------------------------------------------------------------------------
function RemoveDialog({ member, members, numbers, onClose }: { member: Member | null; members: Member[]; numbers: NumberRow[]; onClose: () => void }) {
  const { workspace, user } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const [reassign, setReassign] = useState('');
  const [release, setRelease] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const theirs = numbers.filter((x) => member && x.assigned_user_id === member.user_id);
  const name = member?.profile?.full_name || member?.profile?.email || 'This person';

  async function remove() {
    if (!member) return;
    setBusy(true);
    setError('');
    try {
      const r = await invoke<{ leads_moved: number; released: string[] }>('team', {
        action: 'remove',
        workspace_id: workspace.id,
        user_id: member.user_id,
        reassign_to: reassign || null,
        release_numbers: release,
      });
      track('member_removed', { leads_moved: r.leads_moved, released: r.released.length });
      ['members', 'team-stats', 'team-numbers', 'people'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
      toast(`${name} was removed${r.leads_moved ? `, ${n(r.leads_moved)} leads handed over` : ''}${r.released.length ? `, ${r.released.length} number${r.released.length === 1 ? '' : 's'} released` : ''}`);
      onClose();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={!!member}
      onClose={onClose}
      title={`Remove ${name}`}
      description="They lose access straight away. Their calls, notes and recordings stay in the workspace."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="danger" loading={busy} onClick={() => void remove()}>
            <UserMinus size={15} /> Remove
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Hand their leads to" htmlFor="team-reassign" hint="Leads they own move to this person. Leave it on No one to unassign them.">
          <Select id="team-reassign" value={reassign} onChange={(e) => setReassign(e.target.value)}>
            <option value="">No one</option>
            {members
              .filter((m) => m.user_id !== member?.user_id)
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.profile?.full_name || m.profile?.email}
                  {m.user_id === user.id ? ' (you)' : ''}
                </option>
              ))}
          </Select>
        </Field>
        {theirs.length ? (
          <div>
            <p className="mb-1.5 text-black-700">Their numbers: {theirs.map((x) => formatPhone(x.e164)).join(', ')}</p>
            <label className="flex items-start gap-2">
              <Checkbox checked={release} onChange={setRelease} aria-label="Release their numbers at Twilio" />
              <span>
                Release {theirs.length === 1 ? 'it' : 'them'} at Twilio <span className="text-black-700">(stops the monthly charge; this can’t be undone). Otherwise {theirs.length === 1 ? 'it goes' : 'they go'} back to the workspace, unassigned.</span>
              </span>
            </label>
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-danger-700">
            {error}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

// ---- members tab ---------------------------------------------------------------------------------------
function MembersTab({ stats }: { stats: Stat[] }) {
  const { user, workspace, isAdmin, isOwner } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const members = useMembers();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [transfer, setTransfer] = useState<Member | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const byUser = useMemo(() => new Map(stats.map((s) => [s.user_id, s])), [stats]);

  const invites = useQuery({
    queryKey: ['invitations', workspace.id],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase().from('invitations').select('*').eq('workspace_id', workspace.id).eq('status', 'pending').order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Invitation[];
    },
  });
  const numbers = useQuery({
    queryKey: ['team-numbers', workspace.id],
    queryFn: async () => {
      const { data, error } = await supabase().from('phone_numbers').select('id,e164,kind,is_default,assigned_user_id').eq('workspace_id', workspace.id).eq('status', 'active').order('e164');
      if (error) throw error;
      return (data ?? []) as NumberRow[];
    },
  });

  async function run(id: string, fn: () => Promise<unknown>, done: string) {
    setBusy(id);
    try {
      await fn();
      toast(done);
    } catch (e) {
      toast(errText(e));
    } finally {
      setBusy(null);
    }
  }
  const refresh = () => ['members', 'team-stats', 'team-numbers', 'invitations'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));

  const setRole = (m: Member, role: 'admin' | 'member') =>
    run(
      m.user_id,
      async () => {
        const { error } = await supabase().from('workspace_members').update({ role }).eq('workspace_id', workspace.id).eq('user_id', m.user_id);
        if (error) throw error;
        refresh();
      },
      'Role updated',
    );
  const assign = (m: Member, numberId: string) =>
    run(
      m.user_id,
      async () => {
        const mine = (numbers.data ?? []).filter((x) => x.assigned_user_id === m.user_id);
        for (const x of mine) if (x.id !== numberId) await invoke('twilio-numbers', { workspace_id: workspace.id, action: 'assign', id: x.id, user_id: null });
        if (numberId) await invoke('twilio-numbers', { workspace_id: workspace.id, action: 'assign', id: numberId, user_id: m.user_id });
        refresh();
      },
      numberId ? 'Number assigned' : 'Number unassigned',
    );

  const rows = members.data ?? [];
  const free = (numbers.data ?? []).filter((x) => !x.assigned_user_id && x.kind !== 'verified_caller_id');

  return (
    <div className="mt-6 space-y-8">
      <section aria-label="Members">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="font-medium text-black-400">
            Members <span className="font-normal tabular-nums text-black-700">{rows.length || ''}</span>
          </h2>
          {isAdmin ? (
            <Button variant="primary" size="compact" className="ml-auto" onClick={() => setInviteOpen(true)}>
              <UserPlus size={15} weight="duotone" /> Invite people
            </Button>
          ) : null}
        </div>
        <div className="mt-2 overflow-x-auto rounded-md border border-white-800">
          <table className="w-full min-w-[900px] table-fixed border-collapse" data-testid="team-members">
            <thead>
              <tr className="border-b border-white-800 text-left text-black-700">
                <th className="px-4 py-2 font-normal">Person</th>
                <th className="w-[130px] px-3 py-2 font-normal">Role</th>
                <th className="w-[230px] px-3 py-2 font-normal">Number</th>
                <th className="w-[110px] px-3 py-2 font-normal">Calls, 7 days</th>
                <th className="w-[120px] px-3 py-2 font-normal">Last active</th>
                {isAdmin ? <th className="w-[96px] px-3 py-2" /> : null}
              </tr>
            </thead>
            <tbody>
              {members.isLoading
                ? Array.from({ length: 3 }, (_, i) => (
                    <tr key={i} className="border-b border-white-800">
                      <td colSpan={6} className="px-4 py-3">
                        <span className="skeleton block h-4 w-1/2" />
                      </td>
                    </tr>
                  ))
                : rows.map((m) => {
                    const s = byUser.get(m.user_id);
                    const mine = (numbers.data ?? []).filter((x) => x.assigned_user_id === m.user_id && x.kind !== 'verified_caller_id');
                    const self = m.user_id === user.id;
                    return (
                      <tr key={m.user_id} className="border-b border-white-800 last:border-0">
                        <td className="px-4 py-2.5">
                          <span className="flex min-w-0 items-center gap-2.5">
                            <Avatar name={m.profile?.full_name || m.profile?.email} src={m.profile?.avatar_url} />
                            <span className="min-w-0">
                              <span className="block truncate text-black-400">
                                {m.profile?.full_name || 'Teammate'}
                                {self ? <span className="ml-1.5 text-black-700">You</span> : null}
                              </span>
                              <span className="block truncate text-black-700">{m.profile?.email}</span>
                            </span>
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {m.role === 'owner' ? (
                            <span className="tag tag-1">
                              <Crown size={12} weight="duotone" /> Owner
                            </span>
                          ) : isAdmin && !self ? (
                            <Select aria-label={`Role for ${m.profile?.full_name || m.profile?.email}`} value={m.role} disabled={busy === m.user_id} onChange={(e) => void setRole(m, e.target.value as 'admin' | 'member')} className="[&_select]:h-8">
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                            </Select>
                          ) : (
                            <span className="text-black-700">{m.role === 'admin' ? 'Admin' : 'Member'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {isAdmin ? (
                            <Select
                              aria-label={`Number for ${m.profile?.full_name || m.profile?.email}`}
                              value={mine[0]?.id ?? ''}
                              disabled={busy === m.user_id || numbers.isLoading}
                              onChange={(e) => void assign(m, e.target.value)}
                              className="[&_select]:h-8"
                            >
                              <option value="">{mine.length ? 'Unassign' : 'Workspace number'}</option>
                              {[...mine, ...free].map((x) => (
                                <option key={x.id} value={x.id}>
                                  {formatPhone(x.e164)}
                                  {x.is_default ? ' (main)' : ''}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <span className="tabular-nums text-black-700">{mine[0] ? formatPhone(mine[0].e164) : 'Workspace number'}</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 tabular-nums text-black-700">{s ? n(s.dials) : '–'}</td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-black-700">{s?.last_seen_at ? timeAgo(s.last_seen_at) : '–'}</td>
                        {isAdmin ? (
                          <td className="px-3 py-2.5 text-right">
                            {isOwner && m.role !== 'owner' ? (
                              <button className="mr-1 rounded-sm px-1.5 py-1 text-black-700 hover:bg-white-300" title="Make owner" aria-label={`Make ${m.profile?.full_name || m.profile?.email} the owner`} onClick={() => setTransfer(m)}>
                                <Crown size={15} />
                              </button>
                            ) : null}
                            {m.role !== 'owner' && !self ? (
                              <button className="rounded-sm px-1.5 py-1 text-black-700 hover:bg-white-300 hover:text-[#94402f]" title="Remove" aria-label={`Remove ${m.profile?.full_name || m.profile?.email}`} onClick={() => setRemoving(m)}>
                                <UserMinus size={15} />
                              </button>
                            ) : null}
                          </td>
                        ) : null}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
        {isAdmin ? (
          <p className="mt-2 text-black-700">
            {free.length ? `${free.length} unassigned number${free.length === 1 ? '' : 's'} to give out. ` : 'No spare numbers. '}
            <Link href="/app/settings/phone-numbers" className="text-[#3653a3] hover:underline">
              Get another number
            </Link>
            . People without their own number call from the workspace number.
          </p>
        ) : null}
      </section>

      {isAdmin ? (
        <section aria-label="Pending invites">
          <h2 className="font-medium text-black-400">
            Pending invites <span className="font-normal tabular-nums text-black-700">{invites.data?.length || ''}</span>
          </h2>
          <div className="mt-2 overflow-x-auto rounded-md border border-white-800">
            {!invites.data?.length ? (
              <p className="px-4 py-6 text-center text-black-700">{invites.isLoading ? 'Loading…' : 'No pending invites. Invite people to give them access.'}</p>
            ) : (
              <table className="w-full min-w-[700px] table-fixed border-collapse" data-testid="team-invites">
                <tbody>
                  {invites.data.map((inv) => {
                    const expired = new Date(inv.expires_at).getTime() < Date.now();
                    return (
                      <tr key={inv.id} className="border-b border-white-800 last:border-0">
                        <td className="px-4 py-2.5 text-black-400">{inv.email}</td>
                        <td className="w-[110px] px-3 py-2.5 text-black-700">{inv.role === 'admin' ? 'Admin' : 'Member'}</td>
                        <td className="w-[150px] px-3 py-2.5">{expired ? <Badge tone="warning">Expired</Badge> : <span className="text-black-700">Until {formatDate(inv.expires_at)}</span>}</td>
                        <td className="w-[250px] px-3 py-2.5 text-right">
                          <Button variant="ghost" size="compact" onClick={async () => toast((await navigator.clipboard.writeText(`${window.location.origin}/invite/${inv.token}`).then(() => true, () => false)) ? 'Invite link copied' : 'Could not copy')}>
                            Copy link
                          </Button>
                          <Button variant="ghost" size="compact" disabled={busy === inv.id} onClick={() => void run(inv.id, async () => { await invoke('team', { action: 'resend', invitation_id: inv.id }); refresh(); }, `Invite sent again to ${inv.email}`)}>
                            Resend
                          </Button>
                          <Button variant="ghost" size="compact" disabled={busy === inv.id} onClick={() => void run(inv.id, async () => { const { error } = await supabase().from('invitations').update({ status: 'revoked' }).eq('id', inv.id); if (error) throw error; refresh(); }, 'Invite revoked')}>
                            Revoke
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      ) : null}

      <InviteDialog open={inviteOpen} onClose={() => setInviteOpen(false)} />
      <RemoveDialog member={removing} members={rows} numbers={numbers.data ?? []} onClose={() => setRemoving(null)} />
      <Dialog
        open={!!transfer}
        onClose={() => setTransfer(null)}
        title={`Make ${transfer?.profile?.full_name || transfer?.profile?.email} the owner?`}
        description="They get full control, including billing and deleting the workspace. You become an admin."
        footer={
          <>
            <Button onClick={() => setTransfer(null)}>Cancel</Button>
            <Button
              variant="danger"
              loading={busy === 'transfer'}
              onClick={() =>
                void run(
                  'transfer',
                  async () => {
                    const { error } = await supabase().rpc('transfer_ownership', { p_workspace_id: workspace.id, p_new_owner: transfer!.user_id });
                    if (error) throw error;
                    setTransfer(null);
                    window.location.reload();
                  },
                  'Ownership transferred',
                )
              }
            >
              Transfer ownership
            </Button>
          </>
        }
      />
    </div>
  );
}

// ---- analytics tab ---------------------------------------------------------------------------------------
function OutcomeBar({ outcomes, total }: { outcomes: Record<string, number>; total: number }) {
  if (!total) return <span className="text-white-900">No outcomes</span>;
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-full bg-white-300" title={OUTCOMES.filter((o) => outcomes[o.value]).map((o) => `${o.label}: ${outcomes[o.value]}`).join(' · ')}>
      {OUTCOMES.filter((o) => outcomes[o.value]).map((o, i) => (
        <span key={o.value} style={{ width: `${(outcomes[o.value] / total) * 100}%`, background: ['#5f86e0', '#3f8f5e', '#c9a227', '#94402f', '#8a6fd1', '#5c5c5c', '#2f9aa0', '#d07a3a', '#b04a7d'][i % 9] }} />
      ))}
    </span>
  );
}

function AnalyticsTab({ range, setRange, stats, loading }: { range: Range; setRange: (r: Range) => void; stats: Stat[]; loading: boolean }) {
  const { user, isAdmin } = useApp();
  const totals = stats.reduce((a, s) => ({ dials: a.dials + s.dials, connects: a.connects + s.connects, meetings: a.meetings + s.meetings, talk: a.talk + s.talk_seconds, rec: a.rec + s.recordings }), { dials: 0, connects: 0, meetings: 0, talk: 0, rec: 0 });
  const tiles = [
    { label: 'Dials', value: n(totals.dials) },
    { label: 'Connects', value: n(totals.connects), sub: totals.dials ? `${Math.round((totals.connects / totals.dials) * 100)}% connect rate` : '' },
    { label: 'Meetings booked', value: n(totals.meetings) },
    { label: 'Talk time', value: formatDuration(totals.talk) },
    { label: 'Recordings', value: n(totals.rec) },
  ];
  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Period">
        {(['today', '7d', '30d', 'month'] as Range[]).map((r) => (
          <button key={r} role="radio" aria-checked={range === r} onClick={() => setRange(r)} className={cn('flex h-7 items-center rounded-sm border px-2.5 transition-colors', range === r ? 'border-[#c4d1f2] bg-[#f2f5fe] text-[#3653a3]' : 'border-white-800 text-black-700 hover:border-white-900 hover:text-black-400')}>
            {rangeBounds(r).label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5" data-testid="team-totals">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-md border border-white-800 px-4 py-3">
            <p className="text-black-700">{t.label}</p>
            <p className="mt-1 text-[20px] font-medium tabular-nums tracking-tight text-black-400">{loading ? '…' : t.value}</p>
            {t.sub ? <p className="text-black-700">{t.sub}</p> : null}
          </div>
        ))}
      </div>
      <div className="mt-6 overflow-x-auto rounded-md border border-white-800">
        <table className="w-full min-w-[900px] table-fixed border-collapse" data-testid="team-analytics">
          <thead>
            <tr className="border-b border-white-800 text-left text-black-700">
              <th className="px-4 py-2 font-normal">Rep</th>
              <th className="w-[80px] px-3 py-2 font-normal">Dials</th>
              <th className="w-[90px] px-3 py-2 font-normal">Connects</th>
              <th className="w-[90px] px-3 py-2 font-normal">Meetings</th>
              <th className="w-[100px] px-3 py-2 font-normal">Talk time</th>
              <th className="w-[200px] px-3 py-2 font-normal">Outcomes</th>
              <th className="w-[100px] px-3 py-2 font-normal">Recordings</th>
              <th className="w-[44px] px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => {
              const canOpen = isAdmin || s.user_id === user.id;
              const outcomeTotal = Object.values(s.outcomes).reduce((a, b) => a + b, 0);
              return (
                <tr key={s.user_id} className="border-b border-white-800 last:border-0">
                  <td className="px-4 py-2.5">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Avatar name={s.full_name || s.email} src={s.avatar_url} />
                      <span className="min-w-0">
                        <span className="block truncate text-black-400">{s.full_name || s.email}</span>
                        <span className="block truncate text-black-700">{s.numbers[0] ? formatPhone(s.numbers[0].e164) : 'Workspace number'}</span>
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-black-400">{n(s.dials)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-black-700">
                    {n(s.connects)}
                    {s.dials ? <span className="text-white-900"> · {Math.round((s.connects / s.dials) * 100)}%</span> : null}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-black-700">{n(s.meetings)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-black-700">{formatDuration(s.talk_seconds)}</td>
                  <td className="px-3 py-2.5">
                    <OutcomeBar outcomes={s.outcomes} total={outcomeTotal} />
                  </td>
                  <td className="px-3 py-2.5 tabular-nums text-black-700">{n(s.recordings)}</td>
                  <td className="px-2 py-2.5">
                    {canOpen ? (
                      <Link href={`/app/calls?rep=${s.user_id}`} aria-label={`Calls by ${s.full_name || s.email}`} className="flex h-7 w-7 items-center justify-center rounded-sm text-black-700 hover:bg-white-300">
                        <CaretRight size={14} />
                      </Link>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!loading && !stats.length ? (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-black-700">
                  No calls in this period.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {!isAdmin ? <p className="mt-2 text-black-700">You can open your own calls and recordings. Owners and admins can open everyone’s.</p> : null}
    </div>
  );
}

// ---- page ---------------------------------------------------------------------------------------------------
export function Team() {
  const { workspace } = useApp();
  const [tab, setTab] = useState<Tab>('members');
  const [range, setRange] = useState<Range>('7d');
  const week = useQuery(teamStatsQuery(workspace.id, '7d'));
  const ranged = useQuery({ ...teamStatsQuery(workspace.id, range), enabled: tab === 'analytics' });

  return (
    <div className="h-full overflow-y-auto bg-white-100">
      <div className="mx-auto w-full max-w-[1100px] px-6 pb-20 pt-10">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md" style={{ background: '#f1f5fd' }}>
            <UsersThree size={17} weight="duotone" style={{ color: BLUE }} />
          </span>
          <h1 className="t-h2">Team</h1>
        </div>
        <p className="mt-2 max-w-[640px] text-black-700">Invite your team, give everyone a number to call from, and see how each person’s calls are going.</p>
        <div className="mt-6 flex gap-1.5 border-b border-white-800" role="tablist">
          {([
            ['members', 'Members', UsersThree],
            ['analytics', 'Analytics', Phone],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={cn('-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 transition-colors', tab === id ? 'border-[#5f86e0] text-black-400' : 'border-transparent text-black-700 hover:text-black-400')}>
              <Icon size={15} weight={tab === id ? 'duotone' : 'regular'} /> {label}
            </button>
          ))}
        </div>
        {tab === 'members' ? <MembersTab stats={week.data ?? []} /> : <AnalyticsTab range={range} setRange={setRange} stats={ranged.data ?? []} loading={ranged.isLoading} />}
      </div>
    </div>
  );
}

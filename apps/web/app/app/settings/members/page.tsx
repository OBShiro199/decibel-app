'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { UserPlus } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, ErrorCard, TableSkeleton } from '@/components/ui/display';
import { ChipsInput, Field, Select } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import { useMembers } from '@/lib/hooks';
import { invoke, supabase } from '@/lib/supabase/client';
import type { Invitation, Member } from '@/lib/types';
import { formatDate } from '@/lib/utils';
import { AdminOnly, copyText, CopyField, errorMessage, Notice, Section, SettingsPage } from '../_components';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
type InviteRole = 'admin' | 'member';
interface InviteResult {
  email: string;
  sent: boolean;
  link?: string;
  error?: string;
}
const inviteLink = (token: string) => `${window.location.origin}/invite/${token}`;
const inSevenDays = () => new Date(Date.now() + 7 * 86400000).toISOString();

export default function MembersPage() {
  const { user, workspace, isAdmin } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const members = useMembers();
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removing, setRemoving] = useState<Member | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [manualLink, setManualLink] = useState<{ email: string; link: string } | null>(null);

  const invites = useQuery({
    queryKey: ['invitations', workspace.id],
    enabled: isAdmin,
    queryFn: async () => {
      const { data, error: err } = await supabase().from('invitations').select('*').eq('workspace_id', workspace.id).eq('status', 'pending').order('created_at', { ascending: false });
      if (err) throw err;
      return (data ?? []) as Invitation[];
    },
  });

  const syncSeats = () => invoke('billing', { workspace_id: workspace.id, action: 'sync_seats' }).catch(() => {});
  const refreshInvites = () => qc.invalidateQueries({ queryKey: ['invitations', workspace.id] });

  async function changeRole(m: Member, role: InviteRole) {
    setBusyId(m.user_id);
    setError(null);
    const { error: err } = await supabase().from('workspace_members').update({ role }).eq('workspace_id', workspace.id).eq('user_id', m.user_id);
    setBusyId(null);
    if (err) return setError(err.message);
    await qc.invalidateQueries({ queryKey: ['members', workspace.id] });
    toast('Role updated');
  }

  async function remove(m: Member) {
    setBusyId(m.user_id);
    setError(null);
    const { error: err } = await supabase().from('workspace_members').delete().eq('workspace_id', workspace.id).eq('user_id', m.user_id);
    setBusyId(null);
    setRemoving(null);
    if (err) return setError(err.message);
    await qc.invalidateQueries({ queryKey: ['members', workspace.id] });
    void syncSeats();
    toast('Member removed');
  }

  async function resend(inv: Invitation) {
    setBusyId(inv.id);
    setError(null);
    try {
      const { error: err } = await supabase().from('invitations').update({ expires_at: inSevenDays(), status: 'pending' }).eq('id', inv.id);
      if (err) throw err;
      await refreshInvites();
      let sent = false;
      try {
        sent = (await invoke<{ sent: boolean; link: string }>('send-email', { type: 'invite', invitation_id: inv.id })).sent;
      } catch {
        sent = false;
      }
      if (sent) toast(`Invite sent to ${inv.email}`);
      else setManualLink({ email: inv.email, link: inviteLink(inv.token) });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  async function revoke(inv: Invitation) {
    setBusyId(inv.id);
    setError(null);
    const { error: err } = await supabase().from('invitations').update({ status: 'revoked' }).eq('id', inv.id);
    setBusyId(null);
    if (err) return setError(err.message);
    await refreshInvites();
    toast('Invite revoked');
  }

  return (
    <SettingsPage
      title="Members"
      description="Seats = members. Your subscription updates automatically."
      actions={
        <Button variant="primary" disabled={!isAdmin} onClick={() => setInviteOpen(true)}>
          <UserPlus size={16} strokeWidth={1.5} />
          Invite
        </Button>
      }
    >
      {!isAdmin ? <AdminOnly>Only owners and admins can invite people or change roles.</AdminOnly> : null}
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Section title={`Members${members.data ? ` (${members.data.length})` : ''}`}>
        {members.isError ? (
          <ErrorCard message="Could not load members." onRetry={() => members.refetch()} />
        ) : (
          <div className="card overflow-x-auto">
            {members.isLoading ? (
              <TableSkeleton rows={4} cols={4} />
            ) : (
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Email</th>
                    <th className="w-36">Role</th>
                    <th>Joined</th>
                    <th className="w-24" />
                  </tr>
                </thead>
                <tbody>
                  {(members.data ?? []).map((m) => {
                    const self = m.user_id === user.id;
                    return (
                      <tr key={m.user_id}>
                        <td>
                          <span className="flex items-center gap-2 whitespace-nowrap">
                            <Avatar name={m.profile?.full_name || m.profile?.email} src={m.profile?.avatar_url} />
                            {m.profile?.full_name || 'Teammate'}
                            {self ? <span className="t-caption text-black-700">You</span> : null}
                          </span>
                        </td>
                        <td className="text-black-700">{m.profile?.email}</td>
                        <td>
                          {m.role === 'owner' ? (
                            <Badge>Owner</Badge>
                          ) : (
                            <Select
                              aria-label={`Role for ${m.profile?.full_name || m.profile?.email || 'member'}`}
                              value={m.role}
                              disabled={!isAdmin || self || busyId === m.user_id}
                              onChange={(e) => changeRole(m, e.target.value as InviteRole)}
                              className="[&_select]:h-8"
                            >
                              <option value="admin">Admin</option>
                              <option value="member">Member</option>
                            </Select>
                          )}
                        </td>
                        <td className="whitespace-nowrap text-black-700">{formatDate(m.joined_at)}</td>
                        <td className="text-right">
                          {isAdmin && m.role !== 'owner' && !self ? (
                            <Button variant="ghost" size="compact" disabled={busyId === m.user_id} onClick={() => setRemoving(m)}>
                              Remove
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Section>

      {isAdmin ? (
        <Section title="Pending invites" description="Invite links expire after 7 days.">
          {invites.isError ? (
            <ErrorCard message="Could not load invites." onRetry={() => invites.refetch()} />
          ) : (
            <div className="card overflow-x-auto">
              {invites.isLoading ? (
                <TableSkeleton rows={2} cols={4} />
              ) : !invites.data?.length ? (
                <p className="p-6 text-black-700">No pending invites.</p>
              ) : (
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Expires</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {invites.data.map((inv) => {
                      const expired = new Date(inv.expires_at).getTime() < Date.now();
                      return (
                        <tr key={inv.id}>
                          <td>{inv.email}</td>
                          <td className="text-black-700">{inv.role === 'admin' ? 'Admin' : 'Member'}</td>
                          <td className="whitespace-nowrap">{expired ? <Badge tone="warning">Expired</Badge> : <span className="text-black-700">{formatDate(inv.expires_at)}</span>}</td>
                          <td>
                            <span className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="compact"
                                onClick={async () => toast((await copyText(inviteLink(inv.token))) ? 'Invite link copied' : 'Could not copy the link')}
                              >
                                Copy link
                              </Button>
                              <Button variant="ghost" size="compact" disabled={busyId === inv.id} onClick={() => resend(inv)}>
                                Resend
                              </Button>
                              <Button variant="ghost" size="compact" disabled={busyId === inv.id} onClick={() => revoke(inv)}>
                                Revoke
                              </Button>
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </Section>
      ) : null}

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        memberEmails={(members.data ?? []).map((m) => (m.profile?.email ?? '').toLowerCase())}
        onInvited={() => {
          void refreshInvites();
          void syncSeats();
        }}
      />

      <Dialog open={Boolean(manualLink)} onClose={() => setManualLink(null)} title="Share this invite link" description={`We could not email ${manualLink?.email ?? 'them'}. Copy the link and send it yourself.`} footer={<Button onClick={() => setManualLink(null)}>Done</Button>}>
        {manualLink ? <CopyField value={manualLink.link} onCopied={() => toast('Invite link copied')} /> : null}
      </Dialog>

      <Dialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove member"
        description={`${removing?.profile?.full_name || removing?.profile?.email || 'This member'} will lose access straight away. Their calls and notes stay in the workspace.`}
        footer={
          <>
            <Button onClick={() => setRemoving(null)}>Cancel</Button>
            <Button variant="danger" loading={Boolean(removing) && busyId === removing?.user_id} onClick={() => removing && remove(removing)}>
              Remove
            </Button>
          </>
        }
      />
    </SettingsPage>
  );
}

function InviteDialog({ open, onClose, onInvited, memberEmails }: { open: boolean; onClose: () => void; onInvited: () => void; memberEmails: string[] }) {
  const { user, workspace } = useApp();
  const toast = useToast();
  const [emails, setEmails] = useState<string[]>([]);
  const [role, setRole] = useState<InviteRole>('member');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<InviteResult[] | null>(null);

  function close() {
    setEmails([]);
    setRole('member');
    setResults(null);
    onClose();
  }

  async function inviteOne(raw: string): Promise<InviteResult> {
    const email = raw.trim().toLowerCase();
    if (memberEmails.includes(email)) return { email, sent: false, error: 'Already a member of this workspace.' };
    try {
      let inv: Invitation | null = null;
      const ins = await supabase().from('invitations').insert({ workspace_id: workspace.id, email, role, invited_by: user.id }).select().single();
      if (ins.error) {
        if (ins.error.code !== '23505') throw ins.error;
        // Already invited once: put the existing row back to pending with a fresh expiry.
        const upd = await supabase()
          .from('invitations')
          .update({ status: 'pending', role, expires_at: inSevenDays() })
          .eq('workspace_id', workspace.id)
          .eq('email', email)
          .select()
          .single();
        if (upd.error) throw upd.error;
        inv = upd.data as Invitation;
      } else {
        inv = ins.data as Invitation;
      }
      track('invite_sent', { role });
      const link = inviteLink(inv.token);
      try {
        const res = await invoke<{ sent: boolean; link?: string }>('send-email', { type: 'invite', invitation_id: inv.id });
        return { email, sent: Boolean(res.sent), link };
      } catch {
        return { email, sent: false, link };
      }
    } catch (e) {
      return { email, sent: false, error: errorMessage(e) };
    }
  }

  async function submit() {
    if (!emails.length) return;
    setBusy(true);
    const out: InviteResult[] = [];
    for (const e of emails) out.push(await inviteOne(e));
    setBusy(false);
    onInvited();
    if (out.every((r) => r.sent)) {
      toast(out.length === 1 ? `Invite sent to ${out[0].email}` : `${out.length} invites sent`);
      close();
    } else {
      setResults(out);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={close}
      title={results ? 'Invites created' : 'Invite people'}
      description={results ? undefined : 'They get an email with a link to join. Each member uses one seat.'}
      footer={
        results ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button onClick={close}>Cancel</Button>
            <Button variant="primary" loading={busy} disabled={!emails.length} onClick={submit}>
              Send {emails.length > 1 ? `${emails.length} invites` : 'invite'}
            </Button>
          </>
        )
      }
    >
      {results ? (
        <ul className="space-y-4">
          {results.map((r) => (
            <li key={r.email}>
              <p className="flex items-center gap-2">
                {r.email}
                {r.error ? <Badge tone="danger">Not invited</Badge> : r.sent ? <Badge tone="success">Email sent</Badge> : <Badge tone="warning">Email not sent</Badge>}
              </p>
              {r.error ? (
                <p className="t-small mt-1 text-danger-700">{r.error}</p>
              ) : !r.sent && r.link ? (
                <div className="mt-2">
                  <p className="t-small mb-1.5 text-black-700">Copy this link and share it yourself.</p>
                  <CopyField value={r.link} onCopied={() => toast('Invite link copied')} />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-5">
          <Field label="Email addresses" htmlFor="invite_emails" hint="Press Enter or comma after each address. Anything that is not a valid email is dropped.">
            <ChipsInput id="invite_emails" value={emails} onChange={setEmails} placeholder="name@company.co.uk" validate={(v) => EMAIL.test(v)} />
          </Field>
          <Field label="Role" htmlFor="invite_role" hint="Admins can manage members, numbers, billing settings and compliance.">
            <Select id="invite_role" value={role} onChange={(e) => setRole(e.target.value as InviteRole)}>
              <option value="member">Member</option>
              <option value="admin">Admin</option>
            </Select>
          </Field>
        </div>
      )}
    </Dialog>
  );
}

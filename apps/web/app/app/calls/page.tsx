'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { CALLS_PAGE as PAGE, callsQuery, type CallLogRow } from '@/lib/queries';
import { BLOCK_REASONS, CALL_STATUS_LABEL, OUTCOMES } from '@/lib/constants';
import { useLists, useMemberNames, useMembers } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import type { Call, CallOutcome, Recording } from '@/lib/types';
import { formatDate, formatDuration, formatPhone } from '@/lib/utils';
import { RecordingPlayer } from '@/components/app/recording-player';
import { OutcomeBadge } from '@/components/app/records';
import { RevealOnce } from '@/components/ui/reveal';
import { Button, ButtonLink } from '@/components/ui/button';
import { Badge, EmptyState, ErrorCard, TableSkeleton } from '@/components/ui/display';
import { Field, Input, Select, Textarea } from '@/components/ui/form';
import { Drawer, useToast } from '@/components/ui/overlay';

type Row = CallLogRow;
const rec = (c: Row): Recording | null => (Array.isArray(c.recording) ? (c.recording[0] ?? null) : c.recording);

export default function CallsPage() {
  const { workspace } = useApp();
  const qc = useQueryClient();
  const names = useMemberNames();
  const { data: members } = useMembers();
  const { data: lists } = useLists();
  const [rep, setRep] = useState('');
  const [outcome, setOutcome] = useState('');
  const [listId, setListId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [page, setPage] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  const calls = useQuery(callsQuery(workspace.id, { rep, outcome, listId, from, to, page }));

  // new calls and status changes appear live
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const channel = supabase()
      .channel(`calls-log:${workspace.id}`)
      // status callbacks arrive in bursts: refresh at most once every 1.5s, in the background
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `workspace_id=eq.${workspace.id}` }, () => {
        if (timer) return;
        timer = setTimeout(() => {
          timer = null;
          void qc.invalidateQueries({ queryKey: ['calls'] });
        }, 1500);
      })
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void supabase().removeChannel(channel);
    };
  }, [qc, workspace.id]);

  const rows = calls.data?.rows ?? [];
  const current = rows.find((r) => r.id === openId) ?? null;
  const filtered = !!(rep || outcome || listId || from || to);
  const pages = Math.ceil((calls.data?.count ?? 0) / PAGE);
  const reset = () => {
    setRep('');
    setOutcome('');
    setListId('');
    setFrom('');
    setTo('');
    setPage(0);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-white-800 bg-white-100 px-4 py-2">
        <Select value={rep} onChange={(e) => { setRep(e.target.value); setPage(0); }} className="w-40 [&_select]:h-8" aria-label="Filter by rep">
          <option value="">All reps</option>
          {(members ?? []).map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.profile?.full_name || m.profile?.email}
            </option>
          ))}
        </Select>
        <Select value={outcome} onChange={(e) => { setOutcome(e.target.value); setPage(0); }} className="w-44 [&_select]:h-8" aria-label="Filter by outcome">
          <option value="">All outcomes</option>
          <option value="none">No outcome logged</option>
          {OUTCOMES.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select value={listId} onChange={(e) => { setListId(e.target.value); setPage(0); }} className="w-40 [&_select]:h-8" aria-label="Filter by list">
          <option value="">All lists</option>
          {(lists ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </Select>
        <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} className="h-8 w-40" aria-label="From date" />
        <span className="text-black-700">to</span>
        <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} className="h-8 w-40" aria-label="To date" />
        {filtered ? (
          <Button size="compact" variant="ghost" onClick={reset}>
            Clear
          </Button>
        ) : null}
        <span className="t-small tabular ml-auto text-black-700">{(calls.data?.count ?? 0).toLocaleString('en-GB')} calls</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-white-100">
        {calls.error ? (
          <div className="p-4">
            <ErrorCard message={(calls.error as Error).message} onRetry={() => calls.refetch()} />
          </div>
        ) : calls.isLoading ? (
          <TableSkeleton rows={10} cols={7} />
        ) : !rows.length ? (
          filtered ? (
            <EmptyState shape="diamond" title="No calls match" description="Loosen a filter to see more calls." action={<Button onClick={reset}>Clear filters</Button>} />
          ) : (
            <EmptyState title="No calls yet" description="Every call you make is logged here with its outcome, duration and recording." action={<ButtonLink variant="primary" href="/app">Make your first call</ButtonLink>} />
          )
        ) : (
          <RevealOnce id="calls">
          <div className="tbl-wrap"><table className="tbl tbl-fixed"><colgroup><col style={{ width: 160 }} /><col style={{ width: 150 }} /><col style={{ width: 200 }} /><col style={{ width: 180 }} /><col style={{ width: 120 }} /><col style={{ width: 150 }} /><col style={{ width: 100 }} /><col style={{ width: 250 }} /><col style={{ width: 280 }} /></colgroup>
            <thead>
              <tr>
                <th>Date</th>
                <th>Rep</th>
                <th>Person</th>
                <th>Company</th>
                <th>Direction</th>
                <th>Outcome</th>
                <th>Duration</th>
                <th>Recording</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const r = rec(c);
                return (
                  <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer">
                    <td className="t-caption whitespace-nowrap text-black-700">{formatDate(c.started_at, true)}</td>
                    <td className="max-w-[140px] truncate">{names[c.user_id ?? ''] ?? '–'}</td>
                    <td className="max-w-[180px] truncate">
                      {c.person?.full_name ?? <span className="tabular-nums text-black-700">{formatPhone(c.direction === 'inbound' ? c.from_e164 : c.to_e164)}</span>}
                      {c.kind === 'test' ? <Badge className="ml-2">Test</Badge> : null}
                      {c.kind === 'voicemail' ? <Badge className="ml-2">Voicemail</Badge> : null}
                    </td>
                    <td className="max-w-[160px] truncate text-black-700">{c.person?.company?.name ?? '–'}</td>
                    <td className="whitespace-nowrap text-black-700">
                      {c.direction === 'inbound' ? <ArrowDownLeft size={14} strokeWidth={1.5} className="mr-1 inline" /> : <ArrowUpRight size={14} strokeWidth={1.5} className="mr-1 inline" />}
                      {c.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                    </td>
                    <td>
                      {c.outcome ? <OutcomeBadge outcome={c.outcome} /> : c.status === 'blocked' ? <Badge tone="danger">Blocked</Badge> : <Badge>{CALL_STATUS_LABEL[c.status]}</Badge>}
                    </td>
                    <td className="t-mono">{formatDuration(c.duration_seconds)}</td>
                    <td onClick={(e) => e.stopPropagation()} className="py-0">
                      {/* always rendered at a fixed size: playing never changes the row or the column */}
                      {r ? <RecordingPlayer path={r.storage_path} duration={r.duration_seconds} compact /> : <span className="text-faint">No recording</span>}
                    </td>
                    <td className="text-black-700">{c.notes ?? ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
          </RevealOnce>
        )}
      </div>

      {pages > 1 ? (
        <div className="flex items-center justify-between border-t border-white-800 bg-white-100 px-4 py-2">
          <span className="t-small tabular text-black-700">
            Page {page + 1} of {pages}
          </span>
          <div className="flex gap-2">
            <Button size="compact" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <Button size="compact" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <Drawer open={!!current} onClose={() => setOpenId(null)} title={current ? (current.person?.full_name ?? formatPhone(current.to_e164)) : ''}>
        {current ? <CallDetail call={current} rep={names[current.user_id ?? ''] ?? '–'} /> : null}
      </Drawer>
    </div>
  );
}

function CallDetail({ call, rep: repName }: { call: Row; rep: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [notes, setNotes] = useState(call.notes ?? '');
  const [outcome, setOutcome] = useState<CallOutcome | ''>(call.outcome ?? '');
  const r = rec(call);
  useEffect(() => {
    setNotes(call.notes ?? '');
    setOutcome(call.outcome ?? '');
  }, [call.id, call.notes, call.outcome]);

  const save = async () => {
    const { error } = await supabase().from('calls').update({ notes: notes.trim() || null, outcome: outcome || null }).eq('id', call.id);
    toast(error ? `Could not save: ${error.message}` : 'Call updated');
    ['calls', 'person', 'people', 'dashboard', 'stats'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  };
  const blocked = call.status === 'blocked' ? BLOCK_REASONS[call.blocked_reason ?? ''] : null;

  return (
    <div className="flex flex-col gap-5 p-4">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {[
          ['When', formatDate(call.started_at, true)],
          ['Rep', repName],
          ['Direction', call.direction === 'inbound' ? 'Inbound' : 'Outbound'],
          ['Status', CALL_STATUS_LABEL[call.status]],
          ['From', formatPhone(call.from_e164) || '–'],
          ['To', formatPhone(call.to_e164)],
          ['Duration', formatDuration(call.duration_seconds)],
          ['Talk time', formatDuration(call.talk_seconds)],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="t-small text-black-700">{k}</dt>
            <dd className={k === 'From' || k === 'To' || k === 'Duration' || k === 'Talk time' ? 'tabular-nums' : ''}>{v}</dd>
          </div>
        ))}
      </dl>
      {blocked ? (
        <p className="rounded-md border border-white-800 bg-danger-100 p-3 text-danger-700">
          Blocked: {blocked.title}. {blocked.fix}
        </p>
      ) : null}
      <section>
        <h3 className="t-h4 mb-2">Recording</h3>
        {r ? <RecordingPlayer path={r.storage_path} duration={r.duration_seconds} /> : <p className="text-black-700">No recording for this call.</p>}
      </section>
      {call.status !== 'blocked' && call.kind === 'standard' ? (
        <Field label="Outcome" htmlFor="cd-outcome">
          <Select id="cd-outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome | '')}>
            <option value="">Not logged</option>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="Notes" htmlFor="cd-notes">
        <Textarea id="cd-notes" className="min-h-[120px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <div className="flex gap-2">
        <Button variant="primary" onClick={save} disabled={notes === (call.notes ?? '') && outcome === (call.outcome ?? '')}>
          Save
        </Button>
        {call.person ? (
          <Link href={`/app/people/${call.person.id}`} className="flex h-9 items-center rounded-sm border border-white-800 px-3 hover:border-black-700">
            Open record
          </Link>
        ) : null}
      </div>
    </div>
  );
}

'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity as ActivityIcon, AtSign, Briefcase, Building2, CalendarClock, Check, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, Eye,
  Flag, Linkedin, MapPin, Mic, Pencil, Phone, PhoneCall, ShieldAlert, Smartphone, StickyNote, Tag, Upload, UserRound, UserPlus, X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { countryName, outcomeMeta, seniorityLabel, TPS_LABEL } from '@/lib/constants';
import { PERSON_SELECT, useMemberNames, useMembers, useStages } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import type { Activity, Call, Note, Person, Recording, Task, TenantCompany } from '@/lib/types';
import { cn, dayLabel, formatDate, formatDuration, formatPhone, normalizePhone, timeAgo } from '@/lib/utils';
import { RecordingPlayer } from '@/components/app/recording-player';
import { RecordSkeleton } from '@/components/app/skeletons';
import { blockedLabel, getRecordNav, isBlocked, OutcomeBadge } from '@/components/app/records';
import { useSoftphoneActions } from '@/components/softphone/provider';
import { Button, ButtonLink } from '@/components/ui/button';
import { Avatar, Chip, EmptyState, ErrorCard, Skeleton, Tabs } from '@/components/ui/display';
import { Checkbox, ChipsInput, Field, Input, Textarea } from '@/components/ui/form';
import { Dialog, useToast } from '@/components/ui/overlay';

type CallRow = Call & { recording: Recording[] | Recording | null };
const firstRecording = (c: CallRow): Recording | null => (Array.isArray(c.recording) ? (c.recording[0] ?? null) : c.recording);

export default function PersonPage() {
  const { id } = useParams<{ id: string }>();
  const { workspace, user } = useApp();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const softphone = useSoftphoneActions();
  const names = useMemberNames();
  const { data: stages } = useStages();
  const db = supabase();
  const [tab, setTab] = useState('activity');
  const [editing, setEditing] = useState(false);
  const [railOpen, setRailOpen] = useState(true);

  const person = useQuery({
    queryKey: ['person', id], placeholderData: undefined,
    queryFn: async () => {
      const { data, error } = await db.from('people').select(`${PERSON_SELECT.replace('company:tenant_companies(id,name,domain)', 'company:tenant_companies(*)')}`).eq('id', id).maybeSingle();
      if (error) throw error;
      return data as unknown as (Person & { company: TenantCompany | null }) | null;
    },
  });
  const calls = useQuery({
    queryKey: ['person', id, 'calls'], placeholderData: undefined,
    queryFn: async () => ((await db.from('calls').select('*, recording:recordings(id,call_id,storage_path,duration_seconds)').eq('person_id', id).order('started_at', { ascending: false }).limit(100)).data ?? []) as unknown as CallRow[],
  });
  const notes = useQuery({
    queryKey: ['person', id, 'notes'], placeholderData: undefined,
    queryFn: async () => ((await db.from('notes').select('*').eq('person_id', id).order('created_at', { ascending: false }).limit(100)).data ?? []) as Note[],
  });
  const tasks = useQuery({
    queryKey: ['person', id, 'tasks'], placeholderData: undefined,
    queryFn: async () => ((await db.from('tasks').select('*').eq('person_id', id).order('completed_at', { ascending: false, nullsFirst: true }).order('due_at', { ascending: true, nullsFirst: false }).limit(100)).data ?? []) as Task[],
  });
  const activities = useQuery({
    queryKey: ['person', id, 'activities'], placeholderData: undefined,
    queryFn: async () => ((await db.from('activities').select('*').eq('person_id', id).order('created_at', { ascending: false }).limit(200)).data ?? []) as Activity[],
  });

  // live updates while a call to this person is in flight
  useEffect(() => {
    // A single call produces several status updates and trigger writes. Collect them and refresh
    // only the affected queries, at most once a second, keeping the current content on screen.
    const dirty = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const mark = (...parts: string[]) => {
      parts.forEach((p) => dirty.add(p));
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        dirty.forEach((p) => void qc.invalidateQueries({ queryKey: p === 'person' ? ['person', id] : ['person', id, p], exact: p === 'person' }));
        dirty.clear();
      }, 1000);
    };
    const channel = db
      .channel(`person:${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `person_id=eq.${id}` }, () => mark('calls', 'activities'))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'people', filter: `id=eq.${id}` }, () => mark('person', 'activities'))
      .subscribe();
    return () => {
      if (timer) clearTimeout(timer);
      void db.removeChannel(channel);
    };
  }, [db, id, qc]);

  const nav = useMemo(() => {
    const ids = getRecordNav();
    const i = ids.indexOf(id);
    return { prev: i > 0 ? ids[i - 1] : null, next: i >= 0 && i < ids.length - 1 ? ids[i + 1] : null };
  }, [id]);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['person', id] });
    ['people', 'today'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
  };

  if (person.error) {
    return (
      <div className="p-6">
        <ErrorCard message={(person.error as Error).message} onRetry={() => person.refetch()} />
      </div>
    );
  }
  if (person.isLoading) return <RecordSkeleton />;
  const p = person.data;
  if (!p) {
    return <EmptyState title="Person not found" description="This record may have been deleted." action={<ButtonLink href="/app/people">Back to People</ButtonLink>} />;
  }

  const blocked = blockedLabel(p);
  const stage = stages?.find((s) => s.id === p.stage_id);
  const openTasks = (tasks.data ?? []).filter((t) => !t.completed_at);
  const listed = p.tps_status === 'tps_listed' || p.tps_status === 'ctps_listed';

  const update = async (patch: Partial<Person>) => {
    const { error } = await db.from('people').update(patch).eq('id', p.id);
    if (error) toast(`Could not save: ${error.message}`);
    refresh();
  };

  return (
    <div className="flex h-full flex-col bg-white-100">
      {/* 56px top bar: close, previous / next */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-white-800 px-4">
        <Button size="icon-compact" aria-label="Close record" onClick={() => router.back()}>
          <X size={16} strokeWidth={1.5} />
        </Button>
        <Button size="icon-compact" aria-label="Previous record" disabled={!nav.prev} onClick={() => nav.prev && router.replace(`/app/people/${nav.prev}`)}>
          <ChevronLeft size={16} strokeWidth={1.5} />
        </Button>
        <Button size="icon-compact" aria-label="Next record" disabled={!nav.next} onClick={() => nav.next && router.replace(`/app/people/${nav.next}`)}>
          <ChevronRight size={16} strokeWidth={1.5} />
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Button size="compact" onClick={() => setEditing(true)}>
            <Pencil size={14} strokeWidth={1.5} /> Edit
          </Button>
          <Button size="compact" className="lg:hidden" onClick={() => setRailOpen((o) => !o)}>
            Details
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 max-lg:flex-col">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <header className="px-6 pt-6">
            <div className="flex flex-wrap items-center gap-3">
              <Avatar name={p.full_name} size={40} />
              <div className="min-w-0 flex-1">
                <h1 className="t-h3 truncate">{p.full_name}</h1>
                <p className="truncate text-black-700">{[p.job_title, p.company?.name].filter(Boolean).join(' · ')}</p>
              </div>
              <Button variant="primary" disabled={isBlocked(p)} title={blocked ?? undefined} onClick={() => softphone.callPerson(p)}>
                <Phone size={16} strokeWidth={1.5} /> Call
              </Button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Chip icon={PhoneCall}>{p.last_called_at ? `Called ${timeAgo(p.last_called_at)}` : 'Never called'}</Chip>
              {p.last_outcome ? <Chip icon={Flag} tone={p.last_outcome === 'meeting_booked' ? 'success' : undefined}>{outcomeMeta(p.last_outcome)?.label}</Chip> : null}
              {stage ? <Chip icon={ActivityIcon}>{stage.name}</Chip> : null}
              {listed ? <Chip icon={ShieldAlert} tone="danger">{TPS_LABEL[p.tps_status]}</Chip> : null}
              {p.do_not_call ? <Chip icon={ShieldAlert} tone="danger">Do not call</Chip> : null}
              {p.next_call_at && new Date(p.next_call_at) > new Date() ? <Chip icon={CalendarClock}>Call back {formatDate(p.next_call_at, true)}</Chip> : null}
            </div>
            {p.country_code === 'DE' || p.country_code === 'AT' ? (
              <p className="mt-3 rounded-md border border-white-800 bg-warning-100 px-3 py-2 text-warning-700">
                {countryName(p.country_code)} treats B2B cold calls more strictly than the UK. Take local advice before calling.
              </p>
            ) : null}
            {blocked ? (
              <p className="mt-3 rounded-md border border-white-800 bg-danger-100 px-3 py-2 text-danger-700">
                {listed
                  ? 'This number is on the TPS/CTPS register. Calling is blocked.'
                  : p.do_not_call
                    ? 'This person asked not to be called. Calling is blocked.'
                    : 'Add a mobile number to call this person.'}
              </p>
            ) : null}
            <Tabs
              className="mt-4"
              active={tab}
              onChange={setTab}
              tabs={[
                { id: 'activity', label: 'Activity', icon: ActivityIcon },
                { id: 'calls', label: 'Calls', icon: Phone, count: calls.data?.length ?? 0 },
                { id: 'notes', label: 'Notes', icon: StickyNote, count: notes.data?.length ?? 0 },
                { id: 'tasks', label: 'Tasks', icon: CheckSquare, count: openTasks.length },
                { id: 'company', label: 'Company', icon: Building2, count: p.company ? 1 : 0 },
              ]}
            />
          </header>

          <div className="px-6 py-6">
            {tab === 'activity' ? (
              <Timeline activities={activities.data} calls={calls.data ?? []} notes={notes.data ?? []} names={names} stageName={(sid) => stages?.find((s) => s.id === sid)?.name ?? 'a stage'} loading={activities.isLoading} personName={p.full_name} onCall={() => softphone.callPerson(p)} canCall={!isBlocked(p)} />
            ) : tab === 'calls' ? (
              calls.data?.length ? (
                <div className="flex flex-col gap-3">
                  {calls.data.map((c) => (
                    <CallCard key={c.id} call={c} who={names[c.user_id ?? ''] ?? 'Someone'} />
                  ))}
                </div>
              ) : (
                <EmptyState title="No calls yet" description={`You have not called ${p.full_name} yet.`} action={<Button variant="primary" disabled={isBlocked(p)} onClick={() => softphone.callPerson(p)}>Call now</Button>} />
              )
            ) : tab === 'notes' ? (
              <NotesTab personId={p.id} workspaceId={workspace.id} userId={user.id} notes={notes.data ?? []} names={names} onChange={refresh} personName={p.full_name} />
            ) : tab === 'tasks' ? (
              <TasksTab personId={p.id} workspaceId={workspace.id} userId={user.id} tasks={tasks.data ?? []} onChange={refresh} personName={p.full_name} />
            ) : p.company ? (
              <div className="card p-4">
                <div className="flex items-center gap-3">
                  <Avatar name={p.company.name} size={40} square />
                  <div>
                    <p className="t-h4">{p.company.name}</p>
                    <p className="text-black-700">{[p.company.industry, p.company.size_band ? `${p.company.size_band} employees` : null, p.company.city].filter(Boolean).join(' · ')}</p>
                  </div>
                </div>
                {p.company.domain ? (
                  <a href={`https://${p.company.domain}`} target="_blank" rel="noreferrer" className="link mt-3 inline-block">
                    {p.company.domain}
                  </a>
                ) : null}
              </div>
            ) : (
              <EmptyState shape="diamond" title="No company" description={`It seems ${p.full_name} is not linked to a company.`} action={<Button onClick={() => setEditing(true)}>Edit person</Button>} />
            )}
          </div>
        </div>

        {/* attribute rail */}
        <aside className={cn('w-[var(--rail-width)] shrink-0 overflow-y-auto border-l border-white-800 max-lg:border-l-0 max-lg:border-t', !railOpen && 'max-lg:hidden')} aria-label="Details">
          <RailSection title="Contact">
            <Attr icon={Smartphone} label="Mobile" value={p.mobile_e164 ? <span className="tabular-nums">{formatPhone(p.mobile_e164)}</span> : null} empty="Set phone" onEmpty={() => setEditing(true)} />
            <Attr icon={Phone} label="Direct dial" value={p.direct_dial_e164 ? <span className="tabular-nums">{formatPhone(p.direct_dial_e164)}</span> : null} empty="Set direct dial" onEmpty={() => setEditing(true)} />
            <Attr icon={AtSign} label="Email" value={p.email ? <a className="link" href={`mailto:${p.email}`}>{p.email}</a> : null} empty="Set email" onEmpty={() => setEditing(true)} />
            <Attr icon={Linkedin} label="LinkedIn" value={p.linkedin_url ? <a className="link" href={p.linkedin_url} target="_blank" rel="noreferrer">Profile</a> : null} empty="Set LinkedIn" onEmpty={() => setEditing(true)} />
            <Attr icon={MapPin} label="Location" value={[p.city, countryName(p.country_code)].filter(Boolean).join(', ') || null} empty="Set location" onEmpty={() => setEditing(true)} />
            <Attr icon={ShieldAlert} label="TPS" value={TPS_LABEL[p.tps_status]} />
          </RailSection>
          <RailSection title="Company">
            <Attr icon={Building2} label="Company" value={p.company?.name ?? null} empty="Set company" onEmpty={() => setEditing(true)} />
            <Attr icon={Briefcase} label="Title" value={p.job_title} empty="Set title" onEmpty={() => setEditing(true)} />
            <Attr icon={UserRound} label="Seniority" value={seniorityLabel(p.seniority) || null} empty="Not set" />
          </RailSection>
          <RailSection title="Pipeline">
            <div className="flex min-h-8 items-center gap-2 py-1">
              <ActivityIcon size={16} strokeWidth={1.5} className="shrink-0 text-black-700" />
              <span className="t-small w-24 shrink-0 text-black-700">Stage</span>
              <select aria-label="Stage" value={p.stage_id ?? ''} onChange={(e) => update({ stage_id: e.target.value || null })} className="h-7 min-w-0 flex-1 cursor-pointer rounded-sm border border-transparent bg-transparent hover:border-white-800">
                <option value="">No stage</option>
                {(stages ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <OwnerRow value={p.owner_id} onChange={(owner_id) => update({ owner_id })} />
            <Attr icon={PhoneCall} label="Calls" value={String(p.call_count)} />
            <Attr icon={Tag} label="Tags" value={p.tags.length ? p.tags.join(', ') : null} empty="Add tags" onEmpty={() => setEditing(true)} />
            <Attr icon={Upload} label="Source" value={p.source === 'database' ? 'Decibels database' : p.source === 'import' ? 'CSV import' : 'Added manually'} />
            <Attr icon={CalendarClock} label="Added" value={formatDate(p.created_at)} />
          </RailSection>
        </aside>
      </div>

      <EditPersonDialog open={editing} onClose={() => setEditing(false)} person={p} onSaved={refresh} />
    </div>
  );
}

function RailSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <section className="border-b border-white-800 px-4 py-3">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="t-small flex w-full items-center gap-1 py-1 font-semibold">
        <ChevronDown size={14} strokeWidth={1.5} className={cn('transition-transform', !open && '-rotate-90')} />
        {title}
      </button>
      {open ? <div className="mt-1">{children}</div> : null}
    </section>
  );
}

function Attr({ icon: Icon, label, value, empty, onEmpty }: { icon: LucideIcon; label: string; value: React.ReactNode; empty?: string; onEmpty?: () => void }) {
  return (
    <div className="flex min-h-8 items-center gap-2 py-1">
      <Icon size={16} strokeWidth={1.5} className="shrink-0 text-black-700" />
      <span className="t-small w-24 shrink-0 text-black-700">{label}</span>
      <span className="min-w-0 flex-1 truncate">
        {value ?? (onEmpty ? <button onClick={onEmpty} className="text-white-900 hover:text-black-700">{empty}</button> : <span className="text-white-900">{empty ?? '–'}</span>)}
      </span>
    </div>
  );
}

function OwnerRow({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  const { data: members } = useMembers();
  return (
    <div className="flex min-h-8 items-center gap-2 py-1">
      <UserPlus size={16} strokeWidth={1.5} className="shrink-0 text-black-700" />
      <span className="t-small w-24 shrink-0 text-black-700">Owner</span>
      <select aria-label="Owner" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} className="h-7 min-w-0 flex-1 cursor-pointer rounded-sm border border-transparent bg-transparent hover:border-white-800">
        <option value="">Unassigned</option>
        {(members ?? []).map((m) => (
          <option key={m.user_id} value={m.user_id}>
            {m.profile?.full_name || m.profile?.email}
          </option>
        ))}
      </select>
    </div>
  );
}

// ------------------------------------------------------------------ timeline --
const SYSTEM_ICON: Record<string, LucideIcon> = {
  task_created: CheckSquare,
  task_completed: Check,
  stage_changed: ActivityIcon,
  revealed: Eye,
  imported: Upload,
  created: UserPlus,
  assigned: UserPlus,
  note: StickyNote,
  call: Phone,
};

function Timeline({
  activities, calls, notes, names, stageName, loading, personName, onCall, canCall,
}: {
  activities: Activity[] | undefined;
  calls: CallRow[];
  notes: Note[];
  names: Record<string, string>;
  stageName: (id: string) => string;
  loading: boolean;
  personName: string;
  onCall: () => void;
  canCall: boolean;
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  }
  if (!activities?.length) {
    return <EmptyState title="No activity yet" description={`Calls, notes and stage changes for ${personName} show up here.`} action={<Button variant="primary" disabled={!canCall} onClick={onCall}>Make your first call</Button>} />;
  }
  const callById = new Map(calls.map((c) => [c.id, c]));
  const noteById = new Map(notes.map((n) => [n.id, n]));
  const groups: { day: string; items: Activity[] }[] = [];
  activities.forEach((a) => {
    const day = dayLabel(a.created_at);
    const g = groups[groups.length - 1];
    if (g?.day === day) g.items.push(a);
    else groups.push({ day, items: [a] });
  });

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <section key={g.day}>
          <h2 className="t-h4 mb-3">{g.day}</h2>
          <ol className="relative flex flex-col gap-3 before:absolute before:bottom-2 before:left-[9.5px] before:top-2 before:w-px before:bg-white-800">
            {g.items.map((a) => {
              const who = names[a.actor_id ?? ''] ?? 'Decibels';
              const Icon = SYSTEM_ICON[a.kind] ?? ActivityIcon;
              const call = a.call_id ? callById.get(a.call_id) : undefined;
              const note = a.note_id ? noteById.get(a.note_id) : undefined;
              const isCall = a.kind === 'call';
              const text =
                a.kind === 'call' ? 'made a call'
                : a.kind === 'note' ? 'added a note'
                : a.kind === 'task_created' ? `created a task: ${String(a.payload.title ?? '')}`
                : a.kind === 'task_completed' ? `completed a task: ${String(a.payload.title ?? '')}`
                : a.kind === 'stage_changed' ? `moved this person to ${stageName(String(a.payload.to))}`
                : a.kind === 'revealed' ? 'revealed this contact from the database'
                : a.kind === 'imported' ? 'imported this person from a CSV'
                : a.kind === 'assigned' ? 'assigned this person'
                : 'created this person';
              return (
                <li key={a.id} className="relative flex gap-3">
                  <span className={cn('relative z-[1] mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full', isCall ? 'bg-accent-500 text-white-100' : 'bg-white-300 text-black-700')}>
                    <Icon size={12} strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0 flex-1">
                    {(isCall && call) || note ? (
                      <div className="card p-4 transition-colors hover:border-black-700">
                        <div className="flex items-center gap-2">
                          <Avatar name={who} size={20} />
                          <span className="font-semibold">{who}</span>
                          <span>{text}</span>
                          <span className="t-caption ml-auto shrink-0 text-black-700">{timeAgo(a.created_at)}</span>
                        </div>
                        {call ? <CallBody call={call} /> : null}
                        {note ? <p className="mt-2 whitespace-pre-wrap">{note.body}</p> : null}
                      </div>
                    ) : (
                      <p className="py-0.5">
                        <span className="font-semibold">{who}</span> {text} <span className="t-caption text-black-700">· {timeAgo(a.created_at)}</span>
                        {isCall && a.payload.outcome ? <span className="ml-2 inline-block align-middle"><OutcomeBadge outcome={a.payload.outcome as Call['outcome']} /></span> : null}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      ))}
    </div>
  );
}

function CallBody({ call }: { call: CallRow }) {
  const rec = firstRecording(call);
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <OutcomeBadge outcome={call.outcome} />
        <span className="t-caption tabular text-black-700">{formatDuration(call.duration_seconds)} · {call.direction === 'inbound' ? 'Inbound' : 'Outbound'}</span>
      </div>
      {call.notes ? <p className="mt-2 whitespace-pre-wrap">{call.notes}</p> : null}
      {rec ? (
        <div className="mt-3">
          <RecordingPlayer path={rec.storage_path} duration={rec.duration_seconds} compact />
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Chip icon={Mic} className="text-black-700">No recording</Chip>
        </div>
      )}
    </>
  );
}

function CallCard({ call, who }: { call: CallRow; who: string }) {
  return (
    <div className="card p-4 transition-colors hover:border-black-700">
      <div className="flex items-center gap-2">
        <Avatar name={who} size={20} />
        <span className="font-semibold">{who}</span>
        <span className="t-caption ml-auto text-black-700">{formatDate(call.started_at, true)}</span>
      </div>
      <CallBody call={call} />
    </div>
  );
}

// ---------------------------------------------------------------- notes tab --
function NotesTab({ personId, workspaceId, userId, notes, names, onChange, personName }: { personId: string; workspaceId: string; userId: string; notes: Note[]; names: Record<string, string>; onChange: () => void; personName: string }) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    const { error } = await supabase().from('notes').insert({ workspace_id: workspaceId, person_id: personId, author_id: userId, body: body.trim() });
    setBusy(false);
    if (error) return toast(`Could not save: ${error.message}`);
    setBody('');
    onChange();
  };
  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="card p-3">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder={`Write a note about ${personName}`} aria-label="New note" className="border-0 px-1 hover:border-0 focus:outline-none" />
        <div className="mt-2 flex justify-end">
          <Button type="submit" size="compact" variant="primary" disabled={!body.trim()} loading={busy}>
            Add note
          </Button>
        </div>
      </form>
      {notes.length ? (
        notes.map((n) => (
          <div key={n.id} className="card p-4">
            <div className="flex items-center gap-2">
              <Avatar name={names[n.author_id ?? '']} size={20} />
              <span className="font-semibold">{names[n.author_id ?? ''] ?? 'Someone'}</span>
              {n.call_id ? <Chip icon={Phone}>From a call</Chip> : null}
              <span className="t-caption ml-auto text-black-700">{timeAgo(n.created_at)}</span>
            </div>
            <p className="mt-2 whitespace-pre-wrap">{n.body}</p>
          </div>
        ))
      ) : (
        <EmptyState shape="diamond" title="No notes yet" description={`It seems ${personName} doesn't have notes. Notes you take on calls land here too.`} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------- tasks tab --
function TasksTab({ personId, workspaceId, userId, tasks, onChange, personName }: { personId: string; workspaceId: string; userId: string; tasks: Task[]; onChange: () => void; personName: string }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const toast = useToast();
  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    const { error } = await supabase().from('tasks').insert({ workspace_id: workspaceId, person_id: personId, assignee_id: userId, created_by: userId, title: title.trim(), due_at: due ? new Date(due).toISOString() : null });
    if (error) return toast(`Could not save: ${error.message}`);
    setTitle('');
    setDue('');
    onChange();
  };
  const toggle = async (t: Task) => {
    await supabase().from('tasks').update({ completed_at: t.completed_at ? null : new Date().toISOString() }).eq('id', t.id);
    onChange();
  };
  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Send the proposal" aria-label="Task title" className="min-w-[200px] flex-1" />
        <Input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} aria-label="Due date" className="w-56" />
        <Button type="submit" variant="primary" disabled={!title.trim()}>
          Add task
        </Button>
      </form>
      {tasks.length ? (
        <ul className="card divide-y divide-white-800">
          {tasks.map((t) => (
            <li key={t.id} className="flex min-h-11 items-center gap-3 px-4 py-2">
              <Checkbox checked={!!t.completed_at} onChange={() => toggle(t)} aria-label={`Complete ${t.title}`} />
              <span className={cn('flex-1', t.completed_at && 'text-white-900 line-through')}>{t.title}</span>
              {t.due_at ? <span className={cn('t-caption', !t.completed_at && new Date(t.due_at) < new Date() ? 'text-danger-700' : 'text-black-700')}>{formatDate(t.due_at, true)}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState shape="diamond" title="No tasks yet" description={`It seems ${personName} doesn't have tasks. Follow-ups you set after a call appear here.`} />
      )}
    </div>
  );
}

// -------------------------------------------------------------- edit dialog --
function EditPersonDialog({ open, onClose, person, onSaved }: { open: boolean; onClose: () => void; person: Person; onSaved: () => void }) {
  const [form, setForm] = useState({ first_name: '', last_name: '', job_title: '', email: '', mobile: '', direct: '', linkedin_url: '', city: '' });
  const [tags, setTags] = useState<string[]>([]);
  const [dnc, setDnc] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setForm({
        first_name: person.first_name, last_name: person.last_name, job_title: person.job_title ?? '', email: person.email ?? '',
        mobile: person.mobile_e164 ?? '', direct: person.direct_dial_e164 ?? '', linkedin_url: person.linkedin_url ?? '', city: person.city ?? '',
      });
      setTags(person.tags);
      setDnc(person.do_not_call);
      setError(null);
    }
  }, [open, person]);
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const mobile = form.mobile.trim() ? normalizePhone(form.mobile) : null;
    const direct = form.direct.trim() ? normalizePhone(form.direct) : null;
    if (!form.first_name.trim()) return setError('First name is required.');
    if (form.mobile.trim() && !mobile) return setError('That mobile number does not look valid.');
    setBusy(true);
    const { error } = await supabase()
      .from('people')
      .update({
        first_name: form.first_name.trim(), last_name: form.last_name.trim(), job_title: form.job_title.trim() || null, email: form.email.trim() || null,
        mobile_e164: mobile, direct_dial_e164: direct, linkedin_url: form.linkedin_url.trim() || null, city: form.city.trim() || null, tags, do_not_call: dnc,
        // a changed number has not been screened yet
        ...(mobile !== person.mobile_e164 ? { tps_status: 'unchecked', tps_checked_at: null } : {}),
      })
      .eq('id', person.id);
    setBusy(false);
    if (error) return setError(/people_ws_mobile_uq/.test(error.message) ? 'Someone else in this workspace already has that mobile number.' : error.message);
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Edit person" width={600}>
      <form onSubmit={save} className="grid gap-4 sm:grid-cols-2">
        <Field label="First name" htmlFor="ep-first"><Input id="ep-first" value={form.first_name} onChange={set('first_name')} /></Field>
        <Field label="Last name" htmlFor="ep-last"><Input id="ep-last" value={form.last_name} onChange={set('last_name')} /></Field>
        <Field label="Job title" htmlFor="ep-title"><Input id="ep-title" value={form.job_title} onChange={set('job_title')} /></Field>
        <Field label="Email" htmlFor="ep-email"><Input id="ep-email" type="email" value={form.email} onChange={set('email')} /></Field>
        <Field label="Mobile" htmlFor="ep-mobile"><Input id="ep-mobile" className="tabular-nums" value={form.mobile} onChange={set('mobile')} /></Field>
        <Field label="Direct dial" htmlFor="ep-direct"><Input id="ep-direct" className="tabular-nums" value={form.direct} onChange={set('direct')} /></Field>
        <Field label="LinkedIn URL" htmlFor="ep-li"><Input id="ep-li" value={form.linkedin_url} onChange={set('linkedin_url')} /></Field>
        <Field label="City" htmlFor="ep-city"><Input id="ep-city" value={form.city} onChange={set('city')} /></Field>
        <Field label="Tags" className="sm:col-span-2"><ChipsInput value={tags} onChange={setTags} placeholder="Add a tag and press Enter" /></Field>
        <div className="sm:col-span-2">
          <Checkbox checked={dnc} onChange={setDnc} label="Do not call this person" />
        </div>
        {error ? <p className="text-danger-700 sm:col-span-2" role="alert">{error}</p> : null}
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" loading={busy}>Save</Button>
        </div>
      </form>
    </Dialog>
  );
}

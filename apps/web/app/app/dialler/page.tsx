'use client';
// Power dialler: a full screen, not a modal. Pick a lead source, start, and it calls
// each lead in turn. After every call a 20-second bar counts down while you write
// notes and pick an outcome; when it runs out the next lead is dialled automatically.
//
// Layout regions all have fixed heights, so moving between up next, ringing, in call
// and wrap-up swaps content in place without anything jumping.
import { useQuery } from '@tanstack/react-query';
import { Check, Mic, MicOff, Pause, Phone, PhoneOff, Play, SkipForward, Square, Zap } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { OUTCOMES, outcomeMeta } from '@/lib/constants';
import { personLead, practiceLeads, PRACTICE_DEFAULT_NUMBER, WRAP_SECONDS, type DialLead } from '@/lib/dialler';
import { useLists } from '@/lib/hooks';
import { peopleQuery, todayQueueQuery } from '@/lib/queries';
import { supabase } from '@/lib/supabase/client';
import { isLive, PHASE_LABEL } from '@/lib/twilio/call-machine';
import type { CallOutcome } from '@/lib/types';
import { cn, formatDuration, formatPhone, normalizePhone } from '@/lib/utils';
import { FilterMenu } from '@/components/app/filter-menu';
import { isBlocked } from '@/components/app/records';
import { useSoftphoneActions, useSoftphoneState, type NoteSaveStatus } from '@/components/softphone/provider';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, Skeleton, Tag } from '@/components/ui/display';
import { Input, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';

type Mode = 'setup' | 'running' | 'paused' | 'finished';
interface Result {
  state: 'pending' | 'calling' | 'done' | 'skipped';
  outcome?: CallOutcome;
  note?: string;
  reason?: string;
  seconds?: number;
}

function useTicker(startedAt: number | null, endedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || endedAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedAt, endedAt]);
  return startedAt ? Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 1000)) : 0;
}

export default function DiallerPage() {
  const { workspace, user, profile } = useApp();
  const actions = useSoftphoneActions();
  const sp = useSoftphoneState();
  const toast = useToast();
  const { data: lists } = useLists();

  // ---- lead source -----------------------------------------------------------
  const [source, setSource] = useState<string>('practice');
  const [practiceNumber, setPracticeNumber] = useState(PRACTICE_DEFAULT_NUMBER);
  const listId = source.startsWith('list:') ? source.slice(5) : undefined;
  const today = useQuery({ ...todayQueueQuery(workspace.id, user.id), enabled: source === 'today' });
  const listPeople = useQuery({ ...peopleQuery(workspace.id, listId), enabled: !!listId });
  const leads: DialLead[] = useMemo(() => {
    if (source === 'practice') return practiceLeads(normalizePhone(practiceNumber) ?? practiceNumber);
    const people = source === 'today' ? today.data : listPeople.data;
    return (people ?? []).map(personLead);
  }, [source, practiceNumber, today.data, listPeople.data]);
  const leadsLoading = source === 'today' ? today.isLoading : listId ? listPeople.isLoading : false;

  // ---- session ---------------------------------------------------------------
  const [mode, setMode] = useState<Mode>('setup');
  const [index, setIndex] = useState(0);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [wrap, setWrap] = useState<{ remaining: number; total: number } | null>(null);
  const [choice, setChoice] = useState<CallOutcome | null>(null);
  const [notes, setNotesLocal] = useState('');
  // autosave state for the notes pill; 'local' = practice call, kept only for this session
  const [noteStatus, setNoteStatus] = useState<NoteSaveStatus | 'local' | null>(null);
  // bumps whenever the notes box is cleared for a new lead, so a late save reply for
  // the previous call can't flip the pill on the next one
  const noteToken = useRef(0);
  const [notice, setNotice] = useState<string | null>(null);
  const answeredRef = useRef(false);
  const dialingRef = useRef<string | null>(null);
  const prevPhase = useRef(sp.phase);
  const phaseRef = useRef(sp.phase);
  phaseRef.current = sp.phase;

  const current = leads[index];
  const result = (id?: string) => (id ? results[id] : undefined);
  const mark = useCallback((id: string, r: Partial<Result>) => setResults((all) => ({ ...all, [id]: { ...(all[id] ?? { state: 'pending' }), ...r } as Result })), []);
  const seconds = useTicker(sp.startedAt, sp.endedAt);

  // this screen is the call UI: hide the overlay panel while it is open
  useEffect(() => {
    actions.setPanelSuppressed(true);
    return () => actions.setPanelSuppressed(false);
  }, [actions]);

  const setNotes = (v: string) => {
    setNotesLocal(v);
    const token = noteToken.current;
    const practice = !!current?.practice;
    actions.setNotes(v, (status) => {
      if (token !== noteToken.current) return;
      setNoteStatus(practice ? (status === 'saving' ? 'saving' : 'local') : status);
    });
  };
  const clearNotes = useCallback(() => {
    noteToken.current += 1;
    setNotesLocal('');
    setNoteStatus(null);
  }, []);

  const advance = useCallback(() => {
    setWrap(null);
    setChoice(null);
    clearNotes();
    dialingRef.current = null;
    setIndex((i) => {
      const next = i + 1;
      if (next >= leads.length) setMode('finished');
      return next;
    });
  }, [leads.length, clearNotes]);

  /** Saves the call (outcome + notes) and moves on. */
  const commit = useCallback(() => {
    if (!current) return;
    const r = results[current.id];
    if (r?.state === 'skipped') {
      advance();
      return;
    }
    const outcome = choice ?? (answeredRef.current ? 'connected' : 'no_answer');
    if (current.practice) actions.dismiss();
    else actions.finish({ outcome });
    mark(current.id, { state: 'done', outcome, note: notes.trim() || undefined });
    advance();
  }, [actions, advance, choice, current, mark, notes, results]);

  const dial = useCallback(async () => {
    if (!current || dialingRef.current === current.id) return;
    dialingRef.current = current.id;
    if (!current.practice && current.person && isBlocked(current.person)) {
      mark(current.id, { state: 'skipped', reason: current.person.mobile_e164 ? 'TPS or do not call' : 'No mobile' });
      setWrap({ remaining: 1.5, total: 1.5 });
      return;
    }
    mark(current.id, { state: 'calling' });
    answeredRef.current = false;
    const started = current.practice
      ? (void actions.testCall(current.number, { practice: true, name: current.name, company: current.company }), true)
      : await actions.callPerson(current.person!);
    if (!started && phaseRef.current === 'idle') {
      mark(current.id, { state: 'skipped', reason: 'Could not start' });
      setWrap({ remaining: 1.5, total: 1.5 });
    }
  }, [actions, current, mark]);

  // a call finished (or was refused): start the wrap-up countdown
  useEffect(() => {
    const was = prevPhase.current;
    prevPhase.current = sp.phase;
    if (!current || result(current.id)?.state !== 'calling') return;
    if (sp.phase === 'in_call') answeredRef.current = true;
    if (was === sp.phase) return;
    if (sp.phase === 'blocked') {
      // this lead can't be called (TPS, do not call): skip it and carry on
      mark(current.id, { state: 'skipped', reason: sp.message ?? 'Blocked' });
      actions.dismiss();
      setWrap({ remaining: 3, total: 3 });
    } else if (sp.phase === 'failed') {
      // the call couldn't start at all (microphone, connection): stop rather than skip every lead
      setNotice(sp.message ?? 'The call could not be started.');
      mark(current.id, { state: 'pending' });
      dialingRef.current = null;
      actions.dismiss();
      setMode('paused');
    } else if (sp.phase === 'ended') {
      mark(current.id, { seconds: sp.startedAt && sp.endedAt ? Math.round((sp.endedAt - sp.startedAt) / 1000) : 0 });
      setWrap({ remaining: WRAP_SECONDS, total: WRAP_SECONDS });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp.phase]);

  // countdown: runs only while the session is running
  useEffect(() => {
    if (!wrap || mode !== 'running') return;
    const t = setInterval(() => setWrap((w) => (w ? { ...w, remaining: Math.max(0, w.remaining - 0.1) } : w)), 100);
    return () => clearInterval(t);
  }, [wrap, mode]);
  useEffect(() => {
    if (wrap && wrap.remaining <= 0 && mode === 'running') commit();
  }, [wrap, mode, commit]);

  // auto-dial the next lead once the line is free
  useEffect(() => {
    if (mode !== 'running' || wrap || !current || sp.phase !== 'idle') return;
    if ((result(current.id)?.state ?? 'pending') !== 'pending') return;
    const t = setTimeout(() => void dial(), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, wrap, current?.id, sp.phase, results, dial]);

  const start = async () => {
    if (!leads.length) return;
    if (source === 'practice') {
      const e164 = normalizePhone(practiceNumber);
      if (!e164) return toast('Enter a valid mobile number for practice calls.');
      if (e164 !== profile.mobile_e164) {
        const { error } = await supabase().from('profiles').update({ mobile_e164: e164 }).eq('id', user.id);
        if (error) return toast(`Could not save your mobile: ${error.message}`);
      }
    }
    setNotice(null);
    setResults({});
    setIndex(0);
    setWrap(null);
    setChoice(null);
    clearNotes();
    dialingRef.current = null;
    setMode('running');
  };

  const end = () => {
    if (isLive(sp.phase)) actions.hangUp();
    setMode('finished');
    setWrap(null);
  };

  const skip = () => {
    if (!current) return;
    if (isLive(sp.phase)) {
      actions.hangUp();
      return;
    }
    mark(current.id, { state: 'skipped', reason: 'Skipped' });
    advance();
  };

  // keyboard: 1-9 outcome during wrap-up, N next now, P pause / resume
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (wrap && /^[1-9]$/.test(e.key)) setChoice(OUTCOMES[Number(e.key) - 1].value);
      else if (e.key === 'n' && wrap) commit();
      else if (e.key === 'p' && (mode === 'running' || mode === 'paused')) setMode(mode === 'running' ? 'paused' : 'running');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [wrap, mode, commit]);

  // ---- derived for display ---------------------------------------------------
  const done = Object.values(results).filter((r) => r.state === 'done');
  const connects = done.filter((r) => r.outcome === 'connected' || r.outcome === 'meeting_booked').length;
  const meetings = done.filter((r) => r.outcome === 'meeting_booked').length;
  const live = isLive(sp.phase) && result(current?.id)?.state === 'calling';
  const stage: 'setup' | 'next' | 'live' | 'wrap' | 'finished' =
    mode === 'setup' ? 'setup' : mode === 'finished' || !current ? 'finished' : wrap ? 'wrap' : live ? 'live' : 'next';
  const sourceOptions = [
    { value: 'practice', label: 'Practice run' },
    { value: 'today', label: 'Today queue' },
    ...(lists ?? []).map((l) => ({ value: `list:${l.id}`, label: l.name })),
  ];

  return (
    <div className="flex h-full flex-col">
      {/* toolbar */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white-800 px-4">
        <span className="flex items-center gap-1.5 text-sm font-medium text-black-400">
          <Zap size={15} strokeWidth={1.7} style={{ color: 'var(--dialler)' }} /> Power dialler
        </span>
        <span className="h-4 w-px bg-white-800" />
        {mode === 'setup' ? (
          <FilterMenu label="Leads" allLabel="Practice run" value={source === 'practice' ? '' : source} onChange={(v) => setSource(v || 'practice')} options={sourceOptions.slice(1)} />
        ) : (
          <span className="text-sm text-black-700">{sourceOptions.find((o) => o.value === source)?.label}</span>
        )}
        {mode !== 'setup' ? (
          <span className="text-sm tabular-nums text-black-700">
            {Math.min(index + (stage === 'finished' ? 0 : 1), leads.length)} of {leads.length} · {connects} connected · {meetings} booked
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {mode === 'running' ? (
            <Button size="compact" onClick={() => setMode('paused')}>
              <Pause size={14} strokeWidth={1.6} /> Pause
            </Button>
          ) : mode === 'paused' ? (
            <Button size="compact" variant="primary" onClick={() => { setNotice(null); setMode('running'); }}>
              <Play size={14} strokeWidth={1.6} /> Resume
            </Button>
          ) : null}
          {mode === 'running' || mode === 'paused' ? (
            <Button size="compact" onClick={end}>
              <Square size={13} strokeWidth={1.6} /> End session
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* lead list */}
        <aside className="flex w-[320px] shrink-0 flex-col border-r border-white-800">
          <p className="flex h-10 shrink-0 items-center px-4 text-xs text-white-900">
            {leadsLoading ? 'Loading leads' : `${leads.length} ${leads.length === 1 ? 'lead' : 'leads'}`}
          </p>
          <ol className="min-h-0 flex-1 overflow-y-auto">
            {leadsLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <li key={i} className="flex h-14 items-center gap-3 border-t border-rule px-4">
                    <Skeleton className="h-6 w-6" />
                    <Skeleton className="h-3 flex-1" />
                  </li>
                ))
              : leads.map((l, i) => {
                  const r = results[l.id];
                  const isCurrent = mode !== 'setup' && mode !== 'finished' && i === index;
                  return (
                    <li
                      key={l.id}
                      className={cn('relative flex h-14 items-center gap-3 border-t border-rule px-4 transition-colors', isCurrent && 'bg-[var(--dialler-soft)]')}
                    >
                      {isCurrent ? <span className="absolute inset-y-2 left-0 w-[3px] rounded-r-full" style={{ background: 'var(--dialler)' }} /> : null}
                      <span className="w-5 shrink-0 text-xs tabular-nums text-white-900">{i + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className={cn('block truncate text-sm', r?.state === 'done' || r?.state === 'skipped' ? 'text-black-700' : 'font-medium text-black-400')}>{l.name}</span>
                        <span className="block truncate text-xs text-white-900">{l.company}</span>
                      </span>
                      <span className="shrink-0">
                        {r?.state === 'calling' ? (
                          <span className="flex items-center gap-1.5 text-xs text-black-700">
                            <span className="pulse-dot" style={{ width: 6, height: 6, background: 'var(--dialler)' }} />
                            {PHASE_LABEL[sp.phase] === 'Ready' ? 'Dialling' : PHASE_LABEL[sp.phase]}
                          </span>
                        ) : r?.state === 'done' && r.outcome ? (
                          <Tag color={outcomeMeta(r.outcome)?.tone === 'success' ? 0 : outcomeMeta(r.outcome)?.tone === 'danger' ? 3 : outcomeMeta(r.outcome)?.tone === 'accent' ? 1 : 7}>
                            {outcomeMeta(r.outcome)!.label}
                          </Tag>
                        ) : r?.state === 'skipped' ? (
                          <span className="text-xs text-white-900" title={r.reason}>
                            Skipped
                          </span>
                        ) : isCurrent ? (
                          <span className="text-xs" style={{ color: 'var(--dialler)' }}>
                            Up next
                          </span>
                        ) : null}
                      </span>
                    </li>
                  );
                })}
          </ol>
        </aside>

        {/* current call */}
        <section className="flex min-w-0 flex-1 justify-center overflow-y-auto px-6 py-10">
          <div className="w-full max-w-[600px]">
            {/* who */}
            <div className="flex h-[112px] items-center gap-4">
              {stage === 'setup' || stage === 'finished' ? (
                <div>
                  <h1 className="text-xl font-medium text-black-400">{stage === 'setup' ? 'Ready when you are' : 'Session complete'}</h1>
                  <p className="mt-1 text-base text-black-700">
                    {stage === 'setup'
                      ? 'Calls each lead in turn. After every call you get 20 seconds for notes, then the next one dials.'
                      : `${done.length} calls · ${connects} connected · ${meetings} meetings booked`}
                  </p>
                </div>
              ) : (
                <>
                  <Avatar name={current!.name} size={48} />
                  <div className="min-w-0">
                    <p className="text-xs" style={{ color: 'var(--dialler)' }}>
                      {stage === 'wrap' ? 'Wrap-up' : stage === 'live' ? (sp.phase === 'in_call' ? 'On the line' : 'Calling') : mode === 'paused' ? 'Paused' : 'Up next'}
                    </p>
                    <h1 className="truncate text-xl font-medium text-black-400">{current!.name}</h1>
                    <p className="truncate text-base text-black-700">{[current!.title, current!.company].filter(Boolean).join(' · ')}</p>
                  </div>
                </>
              )}
            </div>

            {/* status line */}
            <div className="flex h-12 items-center gap-3 border-y border-white-800">
              {stage === 'setup' || stage === 'finished' ? (
                <span className="text-sm text-black-700">
                  {leads.length} {leads.length === 1 ? 'lead' : 'leads'} ·{' '}
                  {source === 'practice' ? 'practice calls ring your own mobile' : 'TPS-listed and do-not-call numbers are skipped'}
                </span>
              ) : (
                <>
                  <span className="text-base tabular-nums text-black-500">{formatPhone(current!.number)}</span>
                  <span className="ml-auto flex items-center gap-2">
                    {stage === 'live' ? <Badge tone={sp.phase === 'in_call' ? 'success' : 'accent'}>{PHASE_LABEL[sp.phase]}</Badge> : null}
                    <span className="w-14 text-right text-lg tabular-nums text-black-400">{formatDuration(stage === 'live' || stage === 'wrap' ? seconds : 0)}</span>
                  </span>
                </>
              )}
            </div>

            {/* action area: one fixed footprint for every stage */}
            <div className="h-[244px] py-5">
              {stage === 'setup' ? (
                <div className="flex h-full flex-col justify-between">
                  {source === 'practice' ? (
                    <div>
                      <label className="t-label mb-1.5 block" htmlFor="practice-number">
                        Practice number
                      </label>
                      <Input id="practice-number" type="tel" className="max-w-[260px] tabular-nums" value={practiceNumber} onChange={(e) => setPracticeNumber(e.target.value)} />
                      <p className="mt-1.5 text-xs text-white-900">Ten practice leads all ring this number, saved as your mobile. Nothing is written to your records.</p>
                    </div>
                  ) : (
                    <p className="text-sm text-black-700">Outcomes and notes are saved to each person, exactly as with single calls.</p>
                  )}
                  <div>
                    <Button variant="primary" size="lg" onClick={start} disabled={!leads.length || leadsLoading}>
                      <Phone size={16} strokeWidth={1.6} /> Start dialling
                    </Button>
                    <p className="mt-3 text-xs text-white-900">
                      Keys: <span className="kbd">1</span>–<span className="kbd">9</span> outcome · <span className="kbd">N</span> next now · <span className="kbd">P</span> pause
                    </p>
                  </div>
                </div>
              ) : stage === 'finished' ? (
                <div className="flex h-full flex-col justify-end">
                  <div className="flex gap-2">
                    <Button variant="primary" onClick={start} disabled={!leads.length}>
                      <Play size={14} strokeWidth={1.6} /> Run again
                    </Button>
                    <Button onClick={() => setMode('setup')}>Change leads</Button>
                  </div>
                </div>
              ) : stage === 'live' ? (
                <div className="flex h-full items-center justify-center gap-3">
                  <Button onClick={actions.toggleMute} disabled={sp.phase !== 'in_call'} className="w-28">
                    {sp.muted ? <MicOff size={15} strokeWidth={1.6} /> : <Mic size={15} strokeWidth={1.6} />} {sp.muted ? 'Unmute' : 'Mute'}
                  </Button>
                  <Button variant="danger" onClick={actions.hangUp} className="w-28">
                    <PhoneOff size={15} strokeWidth={1.6} /> Hang up
                  </Button>
                  <Button onClick={skip} className="w-28">
                    <SkipForward size={15} strokeWidth={1.6} /> Skip
                  </Button>
                </div>
              ) : stage === 'wrap' ? (
                <div className="flex h-full flex-col">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-black-700">
                      {results[current!.id]?.state === 'skipped'
                        ? `Skipped: ${results[current!.id]?.reason}`
                        : mode === 'paused'
                          ? 'Paused · next call waits for you'
                          : `Next call in ${Math.ceil(wrap!.remaining)}s`}
                    </span>
                    <button onClick={commit} className="text-sm font-medium text-black-400 hover:underline">
                      Call next now
                    </button>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white-300">
                    <div className="dialler-bar h-full rounded-full" style={{ background: 'var(--dialler)', transform: `scaleX(${wrap!.remaining / wrap!.total})` }} />
                  </div>
                  {results[current!.id]?.state !== 'skipped' ? (
                    <div className="mt-5 grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Outcome">
                      {OUTCOMES.map((o, i) => (
                        <button
                          key={o.value}
                          role="radio"
                          aria-checked={choice === o.value}
                          onClick={() => setChoice(o.value)}
                          className={cn(
                            'relative h-9 rounded-sm border text-sm transition-colors',
                            choice === o.value ? 'border-[var(--dialler-edge)] bg-[var(--dialler-soft)] font-medium text-black-400' : 'border-white-800 text-black-500 hover:border-btnborder',
                          )}
                        >
                          {o.label}
                          <span className="absolute right-1.5 top-1 text-[10px] leading-none text-white-900">{i + 1}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-black-700">
                  {notice ? <p className="max-w-[420px] text-center text-danger-700" role="alert">{notice}</p> : null}
                  {mode === 'paused' ? (
                    <Button variant="primary" onClick={() => { setNotice(null); setMode('running'); }}>
                      <Play size={14} strokeWidth={1.6} /> Resume and call {current?.name.split(' ')[0]}
                    </Button>
                  ) : (
                    'Dialling…'
                  )}
                </div>
              )}
            </div>

            {/* notes: always in the same place */}
            <div className="border-t border-white-800 pt-5">
              {/* fixed-height row, so the pill appearing never moves the box */}
              <div className="mb-1.5 flex h-5 items-center justify-between">
                <label className="t-label" htmlFor="dialler-notes">
                  Notes
                </label>
                <NoteSavePill status={notes.trim() ? noteStatus : null} />
              </div>
              <Textarea
                id="dialler-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={stage === 'setup' || stage === 'finished'}
                placeholder={stage === 'setup' || stage === 'finished' ? 'Notes appear here during a call' : `Notes on ${current?.name.split(' ')[0] ?? 'this call'}`}
                className="h-[132px] min-h-0"
              />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

const NOTE_PILL: Record<NoteSaveStatus | 'local', { label: string; tone: string }> = {
  saving: { label: 'Saving…', tone: 'tag-7' },
  saved: { label: 'Saved', tone: 'tag-0' },
  deferred: { label: 'Saves with the outcome', tone: 'tag-7' },
  local: { label: 'Practice call, kept for this session', tone: 'tag-7' },
};

/** Shows whether the call notes have been saved. Renders nothing until there is something to save. */
function NoteSavePill({ status }: { status: NoteSaveStatus | 'local' | null }) {
  if (!status) return null;
  const { label, tone } = NOTE_PILL[status];
  return (
    <span key={status} className={cn('tag t-fade gap-1', tone)} role="status" aria-live="polite">
      {status === 'saved' ? <Check size={12} strokeWidth={2} /> : null}
      {label}
    </span>
  );
}

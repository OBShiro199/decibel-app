'use client';
// Softphone: one call at a time, driven by the Twilio Voice SDK plus Realtime
// updates on the calls row. The browser chooses the call's row id before
// dialling, so notes and the outcome always have a row to attach to.
//
// Three contexts keep re-renders local:
//  - actions: stable functions (callPerson, hangUp, finish…). Never changes.
//  - status:  open / phase / live. Changes a few times per call.
//  - state:   everything, including notes. Only the panel reads it.
import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { BLOCK_REASONS, OUTCOMES } from '@/lib/constants';
import { supabase } from '@/lib/supabase/client';
import { initialState, isLive, needsOutcome, reducer, type Callee, type Phase, type SoftphoneState } from '@/lib/twilio/call-machine';
import { getDevice, isVoiceSupported, onIncoming, qualityFromWarnings, warmDevice, type Call } from '@/lib/twilio/device';
import type { Call as CallRow, CallOutcome, Person, RecordingPolicy } from '@/lib/types';
import { useToast } from '@/components/ui/overlay';
import { SoftphonePanel } from './drawer';

const RECORD_KEY = 'decibels.record';
const PENDING_KEY = 'decibels.pendingOutcomes';
const REMOVE_FROM_QUEUE: CallOutcome[] = ['not_interested', 'wrong_number', 'do_not_call'];

type Dialable = Pick<Person, 'id' | 'full_name' | 'mobile_e164'> & { company?: { name: string } | null };

interface Actions {
  /** Opens the panel at once, then checks DNC/TPS while the microphone and device get ready. */
  /** `testRoute`: ring this number (the rep's own) instead of the person's mobile; everything else is a normal call. */
  callPerson: (person: Dialable, opts?: { listId?: string | null; testRoute?: string }) => Promise<boolean>;
  /** Onboarding step 5: call the user's own mobile and play the test message. Resolves true if answered. */
  testCall: (e164: string, opts?: { practice?: boolean; name?: string; company?: string }) => Promise<boolean>;
  hangUp: () => void;
  accept: () => void;
  decline: () => void;
  toggleMute: () => void;
  toggleHold: () => void;
  toggleKeypad: () => void;
  sendDigit: (d: string) => void;
  /**
   * Updates the call notes and autosaves them after a short pause. `onStatus` reports
   * progress: 'saving' while waiting or writing, 'saved' once the call row has them,
   * 'deferred' when there is no row yet (or the write failed) and the notes will be
   * saved with the outcome instead.
   */
  setNotes: (notes: string, onStatus?: (status: NoteSaveStatus) => void) => void;
  setOutcome: (o: CallOutcome | null) => void;
  /** Saves the outcome in the background and closes the panel immediately. */
  finish: (opts: { followUpAt?: string | null; outcome?: CallOutcome }) => void;
  /** Minimises a live call, refuses to close a call without an outcome, otherwise closes. */
  dismiss: () => void;
  setMinimised: (m: boolean) => void;
  setRecordPref: (on: boolean) => void;
  /** Opens the panel over the app (dial pad when idle) or closes it when idle. */
  togglePanel: () => void;
  /** A full-screen caller (the power dialler) draws its own call UI and hides the overlay panel. */
  setPanelSuppressed: (on: boolean) => void;
}

export type NoteSaveStatus = 'saving' | 'saved' | 'deferred';

interface Status {
  open: boolean;
  minimised: boolean;
  phase: Phase;
  live: boolean;
  calleeName: string | null;
  calleeNumber: string | null;
  recordingPolicy: RecordingPolicy;
  recordPref: boolean;
}

const ActionsCtx = createContext<Actions | null>(null);
const StatusCtx = createContext<Status | null>(null);
const StateCtx = createContext<SoftphoneState | null>(null);

export function useSoftphoneActions(): Actions {
  const v = useContext(ActionsCtx);
  if (!v) throw new Error('useSoftphoneActions must be used inside <SoftphoneProvider>');
  return v;
}
export function useSoftphoneStatus(): Status {
  const v = useContext(StatusCtx);
  if (!v) throw new Error('useSoftphoneStatus must be used inside <SoftphoneProvider>');
  return v;
}
/** Full state, including notes. Only the softphone panel should use this. */
export function useSoftphoneState(): SoftphoneState {
  const v = useContext(StateCtx);
  if (!v) throw new Error('useSoftphoneState must be used inside <SoftphoneProvider>');
  return v;
}

/** Fired on window when a call has been dispositioned. */
export const CALL_FINISHED_EVENT = 'decibels:call-finished';

interface PendingOutcome {
  callId: string;
  workspaceId: string;
  personId: string | null;
  outcome: CallOutcome;
  notes: string;
  followUpAt: string | null;
  at: number;
}

function readPending(): PendingOutcome[] {
  try {
    return JSON.parse(localStorage.getItem(PENDING_KEY) ?? '[]');
  } catch {
    return [];
  }
}
function writePending(list: PendingOutcome[]) {
  try {
    localStorage.setItem(PENDING_KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable: the in-memory attempt still runs */
  }
}

function readableError(message: string): string {
  if (/twilio_not_configured/.test(message)) return 'Calling is not set up yet: Twilio credentials are missing on the server.';
  if (/Failed to send a request|Failed to fetch|not found/i.test(message)) return 'Could not reach the calling service. Check your connection and try again.';
  if (/rate_limited/.test(message)) return 'Too many attempts. Wait a minute and try again.';
  return message || 'The call could not be started.';
}

export function SoftphoneProvider({
  workspaceId,
  userId,
  recordingPolicy,
  listen = true,
  children,
}: {
  workspaceId: string;
  userId: string;
  recordingPolicy: RecordingPolicy;
  /** Register for inbound calls on load. Off during onboarding, where no number exists yet. */
  listen?: boolean;
  children: React.ReactNode;
}) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const callRef = useRef<Call | null>(null);
  const warnings = useRef(new Set<string>());
  const toast = useToast();
  const qc = useQueryClient();
  const recordRef = useRef(false);
  const practiceRef = useRef(false);
  const [panelSuppressed, setPanelSuppressed] = useState(false);
  const [recordPref, setRecordPrefState] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(RECORD_KEY) === '1';
    recordRef.current = saved;
    setRecordPrefState(saved);
  }, []);

  // ---- realtime: Twilio status callbacks land in Postgres, the panel follows --
  useEffect(() => {
    const channel = supabase()
      .channel(`softphone:${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'calls', filter: `user_id=eq.${userId}` }, (payload) => {
        const row = payload.new as CallRow;
        if (row?.id && row.id === stateRef.current.callId) dispatch({ type: 'ROW', row });
      })
      .subscribe();
    return () => {
      void supabase().removeChannel(channel);
    };
  }, [userId]);

  // ---- SDK events ------------------------------------------------------------
  const bind = useCallback((call: Call, onEnd?: (answered: boolean) => void) => {
    callRef.current = call;
    warnings.current.clear();
    let answered = false;
    let reached = false;
    call.on('ringing', () => {
      reached = true;
      dispatch({ type: 'RINGING' });
    });
    call.on('accept', () => {
      reached = true;
      answered = true;
      dispatch({ type: 'ACCEPTED' });
    });
    call.on('warning', (name: string) => {
      warnings.current.add(name);
      dispatch({ type: 'QUALITY', quality: qualityFromWarnings(warnings.current) });
    });
    call.on('warning-cleared', (name: string) => {
      warnings.current.delete(name);
      dispatch({ type: 'QUALITY', quality: qualityFromWarnings(warnings.current) });
    });
    const end = (error?: string) => {
      if (callRef.current !== call) return;
      callRef.current = null;
      if (error && !reached && !stateRef.current.reachedTwilio) dispatch({ type: 'FAILED', message: readableError(error) });
      else dispatch({ type: 'ENDED' });
      onEnd?.(answered);
    };
    call.on('disconnect', () => end());
    call.on('cancel', () => end());
    call.on('reject', () => end());
    call.on('error', (e: Error) => end(e.message || 'Call failed'));
  }, []);

  /** Mic permission and device, started together. Returns an error message or null. */
  const prepare = useCallback(async (): Promise<string | null> => {
    const [mic, dev] = await Promise.allSettled([
      navigator.mediaDevices.getUserMedia({ audio: true }).then((s) => s.getTracks().forEach((t) => t.stop())),
      getDevice(workspaceId),
    ]);
    if (mic.status === 'rejected') {
      return (mic.reason as Error)?.name === 'NotAllowedError' ? 'Microphone access is blocked. Allow it in your browser, then call again.' : 'No microphone found.';
    }
    if (dev.status === 'rejected') return readableError((dev.reason as Error)?.message ?? '');
    return null;
  }, [workspaceId]);

  const dial = useCallback(
    async (callee: Callee, kind: 'standard' | 'test', callId: string, onEnd?: (answered: boolean) => void) => {
      dispatch({ type: 'CONNECTING' });
      try {
        const device = await getDevice(workspaceId);
        const params: Record<string, string> = { To: callee.number, WorkspaceId: workspaceId, UserId: userId, CallId: callId };
        if (callee.personId) params.PersonId = callee.personId;
        if (callee.listId) params.ListId = callee.listId;
        if (callee.testRoute) params.TestRoute = 'true';
        if (kind === 'test') params.Kind = 'test';
        if (kind === 'test' && practiceRef.current) params.Practice = 'true';
        if (recordingPolicy === 'rep_choice' && recordRef.current) params.Record = 'true';
        const call = await device.connect({ params });
        bind(call, onEnd);
        track('call_started', { kind });
        return true;
      } catch (e) {
        dispatch({ type: 'FAILED', message: readableError((e as Error).message) });
        onEnd?.(false);
        return false;
      }
    },
    [bind, recordingPolicy, userId, workspaceId],
  );

  const busy = () => {
    const s = stateRef.current;
    if (isLive(s.phase)) {
      toast('Finish the current call first.');
      return true;
    }
    if (needsOutcome(s)) {
      toast('Log an outcome for the last call first.');
      return true;
    }
    return false;
  };

  const callPerson = useCallback<Actions['callPerson']>(
    async (person, opts) => {
      if (busy()) return false;
      if (!isVoiceSupported()) {
        toast('Calling needs a secure (https) page and a browser with microphone access.');
        return false;
      }
      const callId = crypto.randomUUID();
      notesWarned.current = false;
      const callee: Callee = {
        personId: person.id,
        name: person.full_name,
        company: person.company?.name ?? null,
        number: opts?.testRoute ?? person.mobile_e164 ?? '',
        listId: opts?.listId ?? null,
        testRoute: !!opts?.testRoute,
      };
      dispatch({ type: 'CHECK', callee, kind: 'standard', callId });
      // the dial check, microphone and device all start at once
      const [check, prep] = await Promise.all([
        supabase().rpc('can_dial', { p_workspace_id: workspaceId, p_person_id: person.id }).single(),
        prepare(),
      ]);
      if (stateRef.current.callId !== callId) return false; // superseded
      const c = check.data as { allowed: boolean; reason: string | null } | null;
      if (check.error || !c?.allowed) {
        const reason = BLOCK_REASONS[c?.reason ?? ''];
        dispatch({ type: 'BLOCKED', message: reason ? `${reason.title}. ${reason.fix}` : (check.error?.message ?? 'This number cannot be called.') });
        track('call_ended', { blocked_reason: c?.reason ?? 'error' });
        return false;
      }
      if (prep) {
        dispatch({ type: 'FAILED', message: prep });
        return false;
      }
      return dial(callee, 'standard', callId);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dial, prepare, workspaceId],
  );

  const testCall = useCallback<Actions['testCall']>(
    (e164, opts) =>
      new Promise<boolean>((resolve) => {
        void (async () => {
          if (busy()) return resolve(false);
          const callId = crypto.randomUUID();
          const callee: Callee = { personId: null, name: opts?.name ?? 'Test call', company: opts?.company ?? 'Your mobile', number: e164 };
          dispatch({ type: 'CHECK', callee, kind: 'test', callId });
          practiceRef.current = !!opts?.practice;
          const prep = await prepare();
          if (prep) {
            dispatch({ type: 'FAILED', message: prep });
            return resolve(false);
          }
          const started = await dial(callee, 'test', callId, (answered) => {
            track('test_call_completed', { success: answered });
            resolve(answered);
          });
          if (!started) resolve(false);
        })();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dial, prepare],
  );

  // ---- warm up + inbound -------------------------------------------------------
  useEffect(() => {
    if (!listen || !isVoiceSupported()) return;
    // Load the SDK, fetch a token and register while the rep looks at the page, so the first call
    // is quick, but only after the page's own data has had the network: wait a moment, then use
    // idle time. Starting a call before then warms the device on demand anyway.
    let cancelIdle: (() => void) | null = null;
    const warm = () => warmDevice(workspaceId);
    const t = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') {
        const id = window.requestIdleCallback(warm, { timeout: 8000 });
        cancelIdle = () => window.cancelIdleCallback(id);
      } else {
        const id = window.setTimeout(warm, 1000);
        cancelIdle = () => window.clearTimeout(id);
      }
    }, 2500);
    const off = onIncoming((call) => {
      if (isLive(stateRef.current.phase) || needsOutcome(stateRef.current)) {
        call.reject();
        return;
      }
      const from = call.parameters?.From ?? 'Unknown';
      const callId = call.customParameters?.get('CallId') || null;
      dispatch({ type: 'INCOMING', callId, callee: { personId: call.customParameters?.get('PersonId') || null, name: from, number: from } });
      bind(call);
    });
    return () => {
      clearTimeout(t);
      cancelIdle?.();
      off();
    };
  }, [bind, listen, workspaceId]);

  // ---- saving outcomes: optimistic, queued, retried, never dropped -------------
  const flushing = useRef(false);
  const flush = useCallback(async () => {
    if (flushing.current) return;
    flushing.current = true;
    try {
      for (const item of readPending()) {
        if (item.workspaceId !== workspaceId) continue;
        let done = false;
        let fatal: string | null = null;
        for (let attempt = 0; attempt < 4 && !done && !fatal; attempt++) {
          const { error } = await supabase().rpc('log_call_outcome', {
            p_call_id: item.callId,
            p_outcome: item.outcome,
            p_notes: item.notes || null,
            p_follow_up_at: item.followUpAt,
          });
          if (!error) done = true;
          else if (/forbidden/.test(error.message)) fatal = 'You no longer have access to this workspace.';
          else await new Promise((r) => setTimeout(r, 600 * 2 ** attempt)); // call_not_found or network: back off
        }
        if (done || fatal) writePending(readPending().filter((p) => p.callId !== item.callId));
        if (fatal) {
          toast(`Outcome not saved. ${fatal}`);
          continue;
        }
        if (!done) {
          toast('Could not save the call outcome yet. It will retry automatically.', { label: 'Retry now', onClick: () => void flush() });
          continue;
        }
        // targeted refresh: only what this call changed
        ['today', 'stats', 'calls', 'dashboard', 'workspace'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
        if (item.personId) void qc.invalidateQueries({ queryKey: ['person', item.personId] });
      }
    } finally {
      flushing.current = false;
    }
  }, [qc, toast, workspaceId]);

  useEffect(() => {
    void flush(); // anything left over from a closed tab or a dropped connection
    const online = () => void flush();
    window.addEventListener('online', online);
    const t = window.setInterval(() => readPending().length && void flush(), 20_000);
    return () => {
      window.removeEventListener('online', online);
      clearInterval(t);
    };
  }, [flush]);

  const finish = useCallback<Actions['finish']>(
    (opts) => {
      const { followUpAt } = opts;
      const s = stateRef.current;
      const outcome = opts.outcome ?? s.outcome;
      if (!s.callId || !outcome) return;
      const personId = s.callRow?.person_id ?? s.callee?.personId ?? null;
      const item: PendingOutcome = { callId: s.callId, workspaceId, personId, outcome, notes: s.notes.trim(), followUpAt: followUpAt ?? null, at: Date.now() };
      writePending([...readPending().filter((p) => p.callId !== item.callId), item]);

      // optimistic: the person's row updates in place everywhere, the panel closes now
      if (personId) {
        const now = new Date().toISOString();
        qc.setQueriesData<Person[]>({ queryKey: ['people'] }, (old) =>
          Array.isArray(old) ? old.map((p) => (p.id === personId ? { ...p, last_outcome: item.outcome, last_called_at: now, call_count: p.call_count + 1 } : p)) : old,
        );
        qc.setQueryData<Person[]>(['today', workspaceId, userId], (old) => {
          if (!old) return old;
          const row = old.find((p) => p.id === personId);
          const rest = old.filter((p) => p.id !== personId);
          const later = item.followUpAt && new Date(item.followUpAt) > new Date();
          if (!row || REMOVE_FROM_QUEUE.includes(item.outcome) || later) return rest;
          return [...rest, { ...row, last_outcome: item.outcome, last_called_at: now }];
        });
      }
      track('call_ended', { outcome: item.outcome, duration: s.callRow?.duration_seconds ?? 0 });
      dispatch({ type: 'RESET' });
      window.dispatchEvent(new CustomEvent(CALL_FINISHED_EVENT, { detail: { personId, outcome: item.outcome } }));
      void flush();
    },
    [flush, qc, userId, workspaceId],
  );

  // ---- controls ----------------------------------------------------------------
  const notesTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notesWarned = useRef(false);
  const actions = useMemo<Actions>(
    () => ({
      callPerson,
      testCall,
      finish,
      hangUp: () => {
        const call = callRef.current;
        if (!call) {
          // still checking: abandon before anything was dialled
          if (stateRef.current.phase === 'checking') dispatch({ type: 'RESET' });
          return;
        }
        if (stateRef.current.phase === 'incoming') call.reject();
        else call.disconnect();
      },
      accept: () => callRef.current?.accept(),
      decline: () => {
        callRef.current?.reject();
        callRef.current = null;
        dispatch({ type: 'RESET' });
      },
      toggleMute: () => {
        const call = callRef.current;
        if (!call || stateRef.current.held) return;
        const next = !stateRef.current.muted;
        call.mute(next);
        dispatch({ type: 'MUTE', muted: next });
      },
      toggleHold: () => {
        // local hold: silence both directions (no hold music)
        const call = callRef.current;
        if (!call) return;
        const next = !stateRef.current.held;
        call.mute(next);
        call.getRemoteStream()?.getAudioTracks().forEach((t) => (t.enabled = !next));
        dispatch({ type: 'HOLD', held: next });
        if (!next) dispatch({ type: 'MUTE', muted: false });
      },
      toggleKeypad: () => dispatch({ type: 'KEYPAD' }),
      sendDigit: (d) => callRef.current?.sendDigits(d),
      setNotes: (notes, onStatus) => {
        dispatch({ type: 'NOTES', notes });
        onStatus?.('saving');
        if (notesTimer.current) clearTimeout(notesTimer.current);
        notesTimer.current = setTimeout(() => {
          const id = stateRef.current.callId;
          // until twilio-voice has created the row there is nothing to update; the final save carries the notes
          if (!id || !stateRef.current.reachedTwilio) {
            onStatus?.('deferred');
            return;
          }
          void supabase()
            .from('calls')
            .update({ notes })
            .eq('id', id)
            .then(({ error }) => {
              // ignore a stale reply if the user has typed again since
              if (stateRef.current.notes !== notes) return;
              if (error) {
                onStatus?.('deferred');
                if (!notesWarned.current) {
                  notesWarned.current = true;
                  toast("Notes didn't autosave. They'll be saved with the outcome.");
                }
              } else onStatus?.('saved');
            });
        }, 800);
      },
      setOutcome: (o) => dispatch({ type: 'OUTCOME', outcome: o }),
      dismiss: () => {
        const s = stateRef.current;
        if (isLive(s.phase)) dispatch({ type: 'MINIMISE', minimised: true });
        else if (needsOutcome(s)) toast('Pick an outcome to finish this call.');
        else dispatch({ type: 'RESET' });
      },
      setMinimised: (m) => dispatch({ type: 'MINIMISE', minimised: m }),
      setPanelSuppressed,
      togglePanel: () => {
        const s = stateRef.current;
        if (s.phase === 'idle') dispatch(s.open ? { type: 'RESET' } : { type: 'OPEN' });
        else dispatch({ type: 'MINIMISE', minimised: !s.minimised && isLive(s.phase) });
      },
      setRecordPref: (on) => {
        recordRef.current = on;
        localStorage.setItem(RECORD_KEY, on ? '1' : '0');
        setRecordPrefState(on);
      },
    }),
    [callPerson, finish, testCall, toast],
  );

  const status = useMemo<Status>(
    () => ({
      open: state.open,
      minimised: state.minimised,
      phase: state.phase,
      live: isLive(state.phase),
      calleeName: state.callee?.name ?? null,
      calleeNumber: state.callee?.number ?? null,
      recordingPolicy,
      recordPref,
    }),
    [state.open, state.minimised, state.phase, state.callee, recordingPolicy, recordPref],
  );

  // keyboard: 1-9 pick an outcome after a call, Esc minimises or closes
  useEffect(() => {
    if (!state.open) return;
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if (e.key === 'Escape') actions.dismiss();
      else if (!typing && needsOutcome(stateRef.current) && /^[1-9]$/.test(e.key)) {
        actions.setOutcome(OUTCOMES[Number(e.key) - 1].value);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.open, actions]);

  return (
    <ActionsCtx.Provider value={actions}>
      <StatusCtx.Provider value={status}>
        <StateCtx.Provider value={state}>
          {children}
          {state.open && !panelSuppressed ? <SoftphonePanel mode="overlay" /> : null}
        </StateCtx.Provider>
      </StatusCtx.Provider>
    </ActionsCtx.Provider>
  );
}

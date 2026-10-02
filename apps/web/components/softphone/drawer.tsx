'use client';
// The softphone panel. Every region has a fixed height, so moving between
// checking, ringing, in call and ended swaps content in place and nothing jumps:
//
//   header      72px   who you are calling, minimise / close
//   dial block  112px  number, timer, status line
//   action area 236px  controls or keypad / outcome grid / message
//   notes       flex   always present for standard calls
//   footer      68px   the one primary action for the phase
import { ChevronDown, Circle, Grid3x3, Mic, MicOff, Pause, Phone, PhoneOff, Play, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { OUTCOMES } from '@/lib/constants';
import { isLive, needsOutcome, PHASE_LABEL, type SoftphoneState } from '@/lib/twilio/call-machine';
import { cn, formatDuration, formatPhone } from '@/lib/utils';
import { DialPad } from '@/components/app/quick-dial';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, SignalBars } from '@/components/ui/display';
import { Input, Switch, Textarea } from '@/components/ui/form';
import { ConnectionDot } from './connection-dot';
import { useSoftphoneActions, useSoftphoneState, useSoftphoneStatus } from './provider';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];

function useTimer(startedAt: number | null, endedAt: number | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt || endedAt) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [startedAt, endedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.floor(((endedAt ?? now) - startedAt) / 1000));
}

function RoundButton({ label, active, onClick, disabled, children }: { label: string; active?: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex w-16 flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onClick={onClick}
        className={cn(
          'flex h-12 w-12 items-center justify-center rounded-full border transition-colors active:scale-[0.98] disabled:border-white-500 disabled:text-white-900',
          active ? 'border-black-400 bg-white-300 text-black-400' : 'border-btnborder bg-white-100 hover:border-white-900',
        )}
      >
        {children}
      </button>
      <span className="t-caption text-black-700">{label}</span>
    </div>
  );
}

const tone = (s: SoftphoneState) => (s.phase === 'in_call' ? 'success' : s.phase === 'blocked' || s.phase === 'failed' ? 'danger' : s.phase === 'ended' ? 'neutral' : 'accent');

export function SoftphonePanel({ mode }: { mode: 'docked' | 'overlay' }) {
  const state = useSoftphoneState();
  const sp = useSoftphoneActions();
  const { recordingPolicy, recordPref } = useSoftphoneStatus();
  const seconds = useTimer(state.startedAt, state.endedAt);
  const [followUp, setFollowUp] = useState('');
  const live = isLive(state.phase);
  const mustLog = needsOutcome(state);
  const idle = state.phase === 'idle' || !state.callee;

  useEffect(() => {
    if (state.phase === 'idle' || state.phase === 'checking') setFollowUp('');
  }, [state.phase]);

  // ---- overlay, minimised: a 56px bar with timer and hang up -----------------
  if (mode === 'overlay' && state.minimised && live && state.callee) {
    return (
      <div className="fixed bottom-0 right-0 z-menu flex h-14 w-[min(var(--softphone-width),100vw)] items-center gap-3 border-l border-t border-white-800 bg-white-100 px-4">
        <button onClick={() => sp.setMinimised(false)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-label="Expand softphone">
          <Avatar name={state.callee.name} size={28} />
          <span className="min-w-0 flex-1 truncate">{state.callee.name}</span>
          <span className="t-mono w-14 text-right">{state.phase === 'in_call' ? formatDuration(seconds) : PHASE_LABEL[state.phase]}</span>
        </button>
        <button onClick={sp.hangUp} aria-label="Hang up" className="flex h-9 w-9 items-center justify-center rounded-full border border-danger-500/50 bg-white-100 text-danger-700 hover:bg-danger-100">
          <PhoneOff size={16} strokeWidth={1.5} />
        </button>
      </div>
    );
  }

  const shell = cn(
    'flex flex-col bg-white-100',
    mode === 'overlay'
      ? 'softphone-in fixed bottom-0 right-0 top-0 z-menu w-[min(var(--softphone-width),100vw)] border-l border-white-800 shadow-[-12px_0_32px_rgba(18,18,18,0.06)]'
      : 'h-full w-full',
  );

  // ---- docked and idle: ready state with a dial pad --------------------------
  if (idle) {
    return (
      <aside aria-label="Softphone" className={shell}>
        <div className="flex h-[72px] shrink-0 items-center justify-between border-b border-white-800 px-4">
          <div>
            <p className="t-h4">Phone</p>
            <p className="text-sm text-black-700">Ready to call</p>
          </div>
          <div className="flex items-center gap-2">
            <ConnectionDot />
            {mode === 'overlay' ? (
              <button onClick={sp.dismiss} aria-label="Close softphone" className="flex h-8 w-8 items-center justify-center hover:bg-white-300">
                <X size={16} strokeWidth={1.5} />
              </button>
            ) : null}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <DialPad onDone={() => undefined} />
        </div>
        <div className="flex h-[68px] shrink-0 items-center border-t border-white-800 px-4">
          <p className="t-caption text-black-700">
            Press <span className="kbd">C</span> on any row to call that person.
          </p>
        </div>
      </aside>
    );
  }

  const { callee } = state;
  const recording = state.phase === 'in_call' && state.kind === 'standard' && !!state.callRow?.['recording_consent_played' as keyof typeof state.callRow];
  const canClose = !live && !mustLog;

  return (
    <aside aria-label="Softphone" className={shell}>
      {/* header */}
      <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-white-800 px-4">
        <Avatar name={callee!.name} size={40} />
        <div className="min-w-0 flex-1">
          {callee!.personId ? (
            <Link href={`/app/people/${callee!.personId}`} className="t-h4 block truncate hover:underline">
              {callee!.name}
            </Link>
          ) : (
            <p className="t-h4 truncate">{callee!.name}</p>
          )}
          <p className="t-small h-4 truncate text-black-700">{callee!.company ?? ''}</p>
        </div>
        {mode === 'overlay' && live ? (
          <button onClick={() => sp.setMinimised(true)} aria-label="Minimise" className="flex h-8 w-8 items-center justify-center hover:bg-white-300">
            <ChevronDown size={16} strokeWidth={1.5} />
          </button>
        ) : (
          <button onClick={sp.dismiss} aria-label="Close" disabled={!canClose} title={mustLog ? 'Pick an outcome first' : undefined} className="flex h-8 w-8 items-center justify-center hover:bg-white-300 disabled:text-white-500 disabled:hover:bg-transparent">
            <X size={16} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* dial block */}
      <div className="flex h-[112px] shrink-0 flex-col items-center justify-center gap-1.5">
        <p className="tabular-nums text-lg leading-6">{formatPhone(callee!.number) || ' '}</p>
        <p className="tabular tabular-nums text-xl leading-8">{formatDuration(seconds)}</p>
        <div className="flex h-5 items-center gap-2">
          <Badge tone={tone(state)}>{PHASE_LABEL[state.phase]}</Badge>
          <span className="flex w-5 justify-center">{live ? <SignalBars level={state.quality} /> : null}</span>
          <span className={cn('t-caption inline-flex w-[84px] items-center gap-1 text-danger-700', !recording && 'invisible')}>
            <Circle size={8} fill="currentColor" strokeWidth={0} /> Recording
          </span>
        </div>
      </div>

      {/* action area: one footprint for every phase */}
      <div className="h-[236px] shrink-0 border-t border-white-800 px-4 py-3">
        {state.phase === 'incoming' ? (
          <div className="flex h-full items-center justify-center text-black-700">Incoming call from {formatPhone(callee!.number) || 'an unknown number'}</div>
        ) : live ? (
          state.keypad ? (
            <div className="mx-auto grid h-full w-[216px] grid-cols-3 content-center gap-1.5">
              {KEYS.map((k) => (
                <button key={k} onClick={() => sp.sendDigit(k)} className="h-10 border border-white-800 tabular-nums text-md hover:border-white-900 active:bg-white-300">
                  {k}
                </button>
              ))}
              <button onClick={sp.toggleKeypad} className="col-span-3 h-8 tabular-nums text-xs tracking-[0.06em] text-black-700 hover:text-black-400">
                Hide keypad
              </button>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center gap-4">
              <RoundButton label={state.muted ? 'Unmute' : 'Mute'} active={state.muted && !state.held} onClick={sp.toggleMute} disabled={state.phase !== 'in_call' || state.held}>
                {state.muted ? <MicOff size={20} strokeWidth={1.5} /> : <Mic size={20} strokeWidth={1.5} />}
              </RoundButton>
              <RoundButton label={state.held ? 'Resume' : 'Hold'} active={state.held} onClick={sp.toggleHold} disabled={state.phase !== 'in_call'}>
                {state.held ? <Play size={20} strokeWidth={1.5} /> : <Pause size={20} strokeWidth={1.5} />}
              </RoundButton>
              <RoundButton label="Keypad" onClick={sp.toggleKeypad} disabled={state.phase !== 'in_call'}>
                <Grid3x3 size={20} strokeWidth={1.5} />
              </RoundButton>
            </div>
          )
        ) : mustLog ? (
          <div className="flex h-full flex-col">
            <p className="t-label mb-2">Outcome · keys 1–9</p>
            <div className="grid grid-cols-3 gap-1.5" role="radiogroup" aria-label="Call outcome">
              {OUTCOMES.map((o, i) => (
                <button
                  key={o.value}
                  role="radio"
                  aria-checked={state.outcome === o.value}
                  onClick={() => sp.setOutcome(o.value)}
                  className={cn(
                    't-small relative h-10 border px-1 text-center transition-colors',
                    state.outcome === o.value ? 'border-black-400 bg-white-300 text-black-400' : 'border-btnborder hover:border-white-900',
                  )}
                >
                  {o.label}
                  <span className={cn('absolute right-1 top-0.5 tabular-nums text-xs', state.outcome === o.value ? 'text-white-900' : 'text-faint')}>{i + 1}</span>
                </button>
              ))}
            </div>
            <label className="t-label mb-1 mt-3 block" htmlFor="follow-up">
              Follow-up (optional)
            </label>
            <Input id="follow-up" type="datetime-local" className="h-8" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-2 text-center">
            {state.phase === 'blocked' || state.phase === 'failed' ? (
              <p className="text-danger-700" role="alert">
                {state.message ?? 'This number cannot be called.'}
              </p>
            ) : state.kind === 'test' ? (
              <p className="text-black-700">{state.startedAt ? 'Test call finished. Your setup works.' : 'The test call was not answered.'}</p>
            ) : (
              <p className="text-black-700">Call ended.</p>
            )}
          </div>
        )}
      </div>

      {/* notes */}
      <div className="flex min-h-0 flex-1 flex-col border-t border-white-800 p-4">
        {state.kind === 'standard' ? (
          <>
            <div className="mb-2 flex h-5 items-center justify-between">
              <label className="t-label" htmlFor="softphone-notes">
                Notes
              </label>
              {recordingPolicy === 'rep_choice' ? (
                <span className="flex items-center gap-2">
                  <span className="t-caption text-black-700">Record</span>
                  <Switch checked={recordPref} onChange={sp.setRecordPref} disabled={live} aria-label="Record my calls" />
                </span>
              ) : null}
            </div>
            <Textarea id="softphone-notes" value={state.notes} onChange={(e) => sp.setNotes(e.target.value)} placeholder="What did they say?" className="min-h-0 flex-1" />
          </>
        ) : (
          <p className="text-black-700">Test calls are not logged against a person.</p>
        )}
      </div>

      {/* footer: one primary action per phase */}
      <div className="flex h-[68px] shrink-0 items-center gap-2 border-t border-white-800 px-4">
        {state.phase === 'incoming' ? (
          <>
            <Button className="flex-1" onClick={sp.decline}>
              Decline
            </Button>
            <Button variant="primary" className="flex-1" onClick={sp.accept}>
              <Phone size={16} strokeWidth={1.5} /> Accept
            </Button>
          </>
        ) : live ? (
          <Button variant="danger" className="w-full" onClick={sp.hangUp}>
            <PhoneOff size={16} strokeWidth={1.5} /> {state.phase === 'checking' ? 'Cancel' : 'Hang up'}
          </Button>
        ) : mustLog ? (
          <Button variant="primary" className="w-full" disabled={!state.outcome} onClick={() => sp.finish({ followUpAt: followUp ? new Date(followUp).toISOString() : null })}>
            {state.outcome ? 'Save and close' : 'Pick an outcome'}
          </Button>
        ) : (
          <Button className="w-full" onClick={sp.dismiss}>
            Close
          </Button>
        )}
      </div>
    </aside>
  );
}

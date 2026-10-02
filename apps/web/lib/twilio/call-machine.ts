// Softphone call state machine. Pure and framework-free.
import type { Call as CallRow, CallOutcome } from '@/lib/types';

/**
 * checking: opened instantly while TPS/DNC, microphone and device setup run in parallel
 * blocked:  the call was refused before or by Twilio (no outcome needed)
 * failed:   the call never reached Twilio (no outcome needed)
 */
export type Phase = 'idle' | 'checking' | 'incoming' | 'connecting' | 'ringing' | 'in_call' | 'ended' | 'blocked' | 'failed';

export interface Callee {
  personId: string | null;
  name: string;
  company?: string | null;
  number: string;
  listId?: string | null;
}

export interface SoftphoneState {
  phase: Phase;
  kind: 'standard' | 'test';
  direction: 'outbound' | 'inbound';
  /** Row id in public.calls, chosen by the browser before dialling. */
  callId: string | null;
  callee: Callee | null;
  open: boolean;
  minimised: boolean;
  muted: boolean;
  held: boolean;
  keypad: boolean;
  startedAt: number | null;
  endedAt: number | null;
  callRow: CallRow | null;
  /** Twilio reached twilio-voice, so a calls row exists and an outcome is required. */
  reachedTwilio: boolean;
  notes: string;
  outcome: CallOutcome | null;
  message: string | null;
  quality: 0 | 1 | 2 | 3;
}

export const initialState: SoftphoneState = {
  phase: 'idle',
  kind: 'standard',
  direction: 'outbound',
  callId: null,
  callee: null,
  open: false,
  minimised: false,
  muted: false,
  held: false,
  keypad: false,
  startedAt: null,
  endedAt: null,
  callRow: null,
  reachedTwilio: false,
  notes: '',
  outcome: null,
  message: null,
  quality: 3,
};

export type Action =
  | { type: 'CHECK'; callee: Callee; kind: 'standard' | 'test'; callId: string }
  | { type: 'CONNECTING' }
  | { type: 'INCOMING'; callee: Callee; callId: string | null }
  | { type: 'RINGING' }
  | { type: 'ACCEPTED' }
  | { type: 'ENDED' }
  | { type: 'BLOCKED'; message: string }
  | { type: 'FAILED'; message: string }
  | { type: 'ROW'; row: CallRow }
  | { type: 'MUTE'; muted: boolean }
  | { type: 'HOLD'; held: boolean }
  | { type: 'KEYPAD' }
  | { type: 'NOTES'; notes: string }
  | { type: 'OUTCOME'; outcome: CallOutcome | null }
  | { type: 'QUALITY'; quality: 0 | 1 | 2 | 3 }
  | { type: 'MINIMISE'; minimised: boolean }
  | { type: 'RESET' };

const LIVE: Phase[] = ['checking', 'incoming', 'connecting', 'ringing', 'in_call'];
export const isLive = (phase: Phase) => LIVE.includes(phase);
/** A finished call that still needs an outcome before the panel can close. */
export const needsOutcome = (s: Pick<SoftphoneState, 'phase' | 'kind' | 'reachedTwilio'>) => s.phase === 'ended' && s.kind === 'standard' && s.reachedTwilio;

export function reducer(state: SoftphoneState, action: Action): SoftphoneState {
  switch (action.type) {
    case 'CHECK':
      if (isLive(state.phase) || needsOutcome(state)) return state; // one call at a time
      return { ...initialState, phase: 'checking', kind: action.kind, callee: action.callee, callId: action.callId, open: true };
    case 'CONNECTING':
      return state.phase === 'checking' ? { ...state, phase: 'connecting' } : state;
    case 'INCOMING':
      if (isLive(state.phase)) return state;
      return { ...initialState, phase: 'incoming', direction: 'inbound', callee: action.callee, callId: action.callId, open: true, reachedTwilio: true };
    case 'RINGING':
      return state.phase === 'connecting' ? { ...state, phase: 'ringing', reachedTwilio: true } : state;
    case 'ACCEPTED':
      return isLive(state.phase) ? { ...state, phase: 'in_call', reachedTwilio: true, startedAt: state.startedAt ?? Date.now() } : state;
    case 'ENDED':
      if (!isLive(state.phase)) return state;
      return { ...state, phase: 'ended', endedAt: Date.now(), muted: false, held: false, keypad: false, minimised: false, open: true };
    case 'BLOCKED':
      return { ...state, phase: 'blocked', message: action.message, endedAt: Date.now(), open: true, minimised: false, keypad: false, reachedTwilio: false };
    case 'FAILED':
      return { ...state, phase: 'failed', message: action.message, endedAt: Date.now(), open: true, minimised: false, keypad: false };
    case 'ROW': {
      if (action.row.id !== state.callId) return state;
      const row = action.row;
      if (row.status === 'blocked' && state.phase !== 'blocked') return { ...state, callRow: row, phase: 'blocked', message: null, reachedTwilio: false };
      let next: SoftphoneState = { ...state, callRow: row, reachedTwilio: true };
      if (row.status === 'ringing' && next.phase === 'connecting') next = { ...next, phase: 'ringing' };
      if (row.status === 'in_progress' && isLive(next.phase)) next = { ...next, phase: 'in_call', startedAt: next.startedAt ?? Date.now() };
      // suggest an outcome once, only if the rep hasn't picked one
      if (next.phase === 'ended' && !next.outcome) {
        if (row.status === 'busy') next = { ...next, outcome: 'busy' };
        else if (row.status === 'no_answer') next = { ...next, outcome: 'no_answer' };
      }
      return next;
    }
    case 'MUTE':
      return { ...state, muted: action.muted };
    case 'HOLD':
      return { ...state, held: action.held, muted: action.held ? true : state.muted };
    case 'KEYPAD':
      return { ...state, keypad: !state.keypad };
    case 'NOTES':
      return { ...state, notes: action.notes };
    case 'OUTCOME':
      return { ...state, outcome: action.outcome };
    case 'QUALITY':
      return state.quality === action.quality ? state : { ...state, quality: action.quality };
    case 'MINIMISE':
      return { ...state, minimised: action.minimised };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

export const PHASE_LABEL: Record<Phase, string> = {
  idle: 'Ready',
  checking: 'Checking',
  incoming: 'Incoming call',
  connecting: 'Connecting',
  ringing: 'Ringing',
  in_call: 'In call',
  ended: 'Ended',
  blocked: 'Blocked',
  failed: 'Not connected',
};

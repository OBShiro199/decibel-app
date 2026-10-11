'use client';
// Browser calling on Telnyx WebRTC. One client per session, logged in with a token from the
// telnyx-token Edge Function (the rep's own telephony credential; refreshed before it expires).
// The browser never holds Telnyx credentials and never chooses who is called: every outbound call
// is authorised first by telnyx-call, and the call it places is parked by Telnyx until the
// telnyx-webhook function dials the number stored on the call row.
//
// `Call` wraps a Telnyx call in the small event interface the softphone uses:
//   ringing · accept · disconnect · cancel · reject · error · warning · warning-cleared
import type { TelnyxRTC } from '@telnyx/webrtc';
import { invoke } from '@/lib/supabase/client';

type TelnyxCall = ReturnType<TelnyxRTC['newCall']>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (arg: any) => void;

// ---- connection status for the UI (connected / reconnecting dot) -------------
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'offline';
let connection: ConnectionStatus = 'idle';
const connectionListeners = new Set<() => void>();
function setConnection(next: ConnectionStatus) {
  if (connection === next) return;
  connection = next;
  connectionListeners.forEach((l) => l());
}
export function subscribeConnection(listener: () => void) {
  connectionListeners.add(listener);
  return () => connectionListeners.delete(listener);
}
export const getConnection = () => connection;

// ---- audio device preferences ---------------------------------------------------
const AUDIO_KEY = 'decibels.audio';
export interface AudioPrefs {
  input?: string;
  output?: string;
}
export function getAudioPrefs(): AudioPrefs {
  try {
    return JSON.parse(localStorage.getItem(AUDIO_KEY) ?? '{}');
  } catch {
    return {};
  }
}
export function saveAudioPrefs(prefs: AudioPrefs) {
  localStorage.setItem(AUDIO_KEY, JSON.stringify(prefs));
}

export function isVoiceSupported(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
}

/** One hidden <audio> element plays the far end of every call (and lets us pick the speaker). */
function remoteAudio(): HTMLAudioElement {
  let el = document.getElementById('decibel-remote-audio') as HTMLAudioElement | null;
  if (!el) {
    el = document.createElement('audio');
    el.id = 'decibel-remote-audio';
    el.autoplay = true;
    el.style.display = 'none';
    document.body.appendChild(el);
  }
  return el;
}

// ---- the call wrapper -----------------------------------------------------------------
const FAILURE_CAUSES = /^(?!NORMAL_CLEARING|ORIGINATOR_CANCEL|USER_BUSY|NO_ANSWER|NORMAL_UNSPECIFIED|CALL_REJECTED)/;
const QUALITY: Record<number, string> = { 31001: 'high-rtt', 31002: 'high-jitter', 31003: 'high-packet-loss', 31004: 'low-mos' };

export class Call {
  readonly direction: 'inbound' | 'outbound';
  /** For inbound calls: the caller's number as Telnyx presents it. */
  readonly from: string;
  private listeners = new Map<string, Set<Listener>>();
  private rang = false;
  private accepted = false;
  private ended = false;

  constructor(readonly raw: TelnyxCall) {
    this.direction = raw.direction === 'inbound' ? 'inbound' : 'outbound';
    const opts = (raw.options ?? {}) as { remoteCallerNumber?: string; callerNumber?: string };
    this.from = opts.remoteCallerNumber || opts.callerNumber || 'Unknown';
  }

  on(event: string, fn: Listener) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
  }
  private emit(event: string, arg?: unknown) {
    this.listeners.get(event)?.forEach((fn) => fn(arg));
  }

  /** Telnyx state changes, routed here by the client. */
  update(state: string) {
    if (this.ended) return;
    if ((state === 'early' || state === 'ringing' || state === 'trying') && !this.rang && this.direction === 'outbound') {
      this.rang = true;
      this.emit('ringing');
    } else if (state === 'active' && !this.accepted) {
      this.accepted = true;
      this.emit('accept');
    } else if (state === 'hangup' || state === 'destroy' || state === 'purge') {
      this.ended = true;
      const cause = String(this.raw.cause ?? '');
      if (this.direction === 'inbound' && !this.accepted) this.emit('cancel');
      else if (!this.accepted && cause && FAILURE_CAUSES.test(cause)) this.emit('error', new Error(this.raw.sipReason || cause));
      else this.emit('disconnect');
    }
  }
  warn(code: number) {
    const name = QUALITY[code];
    if (!name) return;
    this.emit('warning', name);
    setTimeout(() => this.emit('warning-cleared', name), 10_000);
  }

  accept() {
    void this.raw.answer();
  }
  reject() {
    void this.raw.hangup();
  }
  disconnect() {
    void this.raw.hangup();
  }
  mute(on: boolean) {
    if (on) this.raw.muteAudio();
    else this.raw.unmuteAudio();
  }
  sendDigits(digits: string) {
    this.raw.dtmf(digits);
  }
  getRemoteStream(): MediaStream | null {
    return this.raw.remoteStream ?? null;
  }
}

// ---- the client ------------------------------------------------------------------------------
let client: TelnyxRTC | null = null;
let clientWorkspace: string | null = null;
let creating: Promise<TelnyxRTC> | null = null;
const calls = new Map<string, Call>();
const incomingHandlers = new Set<(call: Call) => void>();

async function fetchToken(workspaceId: string): Promise<string> {
  const { token } = await invoke<{ token: string }>('telnyx-token', { workspace_id: workspaceId });
  return token;
}

/** The session's Telnyx client, logged in and ready (created on first use). */
export async function getDevice(workspaceId: string): Promise<TelnyxRTC> {
  if (client && clientWorkspace === workspaceId && client.connected) return client;
  if (creating) return creating;
  creating = (async () => {
    setConnection('connecting');
    const [{ TelnyxRTC }, token] = await Promise.all([import('@telnyx/webrtc'), fetchToken(workspaceId)]);
    if (client) await client.disconnect().catch(() => {});
    const c = new TelnyxRTC({ login_token: token });
    c.remoteElement = remoteAudio();
    const prefs = getAudioPrefs();
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Could not reach the calling service.')), 15_000);
      c.on('telnyx.ready', () => {
        clearTimeout(timer);
        setConnection('connected');
        resolve();
      });
      c.on('telnyx.error', (e: { error?: { message?: string }; message?: string }) => {
        clearTimeout(timer);
        console.warn('[softphone] telnyx error', e);
        if (connection === 'connecting') reject(new Error(e?.error?.message || e?.message || 'Could not connect the softphone.'));
        else setConnection(navigator.onLine ? 'reconnecting' : 'offline');
      });
      c.on('telnyx.socket.close', () => connection !== 'idle' && setConnection(navigator.onLine ? 'reconnecting' : 'offline'));
      c.on('telnyx.warning', async (w: { code?: number; callId?: string; call?: { id?: string } }) => {
        const code = Number(w?.code);
        if (code === 34001) {
          // token expiring: log in again with a fresh one
          try {
            await c.login({ creds: { login_token: await fetchToken(workspaceId) } as never });
          } catch (e) {
            console.error('[softphone] token refresh failed', e);
          }
          return;
        }
        const id = w?.callId ?? w?.call?.id;
        if (id) calls.get(id)?.warn(code);
      });
      c.on('telnyx.notification', (n: { type?: string; call?: TelnyxCall }) => {
        if (n?.type !== 'callUpdate' || !n.call) return;
        const raw = n.call;
        let call = calls.get(raw.id);
        if (!call && raw.direction === 'inbound' && raw.state === 'ringing') {
          call = new Call(raw);
          calls.set(raw.id, call);
          if (incomingHandlers.size) incomingHandlers.forEach((h) => h(call!));
          else void raw.hangup();
          return;
        }
        if (!call) return;
        call.update(raw.state);
        if (['hangup', 'destroy', 'purge'].includes(raw.state)) calls.delete(raw.id);
      });
      void c.connect().catch((e: Error) => {
        clearTimeout(timer);
        reject(e);
      });
    });
    if (prefs.input) await c.setAudioSettings({ micId: prefs.input }).catch(() => {});
    if (prefs.output) await setSink(prefs.output);
    client = c;
    clientWorkspace = workspaceId;
    return c;
  })();
  try {
    return await creating;
  } catch (e) {
    setConnection('offline');
    throw e;
  } finally {
    creating = null;
  }
}

/**
 * Places the browser leg of an authorised call. `destination` comes from telnyx-call (an
 * internal parking address); the call row id travels in a SIP header for the webhook.
 */
export async function placeCall(workspaceId: string, destination: string, callId: string): Promise<Call> {
  const c = await getDevice(workspaceId);
  const raw = c.newCall({
    destinationNumber: destination,
    audio: true,
    video: false,
    remoteElement: remoteAudio(),
    customHeaders: [{ name: 'X-Decibel-Call', value: callId }],
  } as never);
  const call = new Call(raw);
  calls.set(raw.id, call);
  return call;
}

export function onIncoming(handler: (call: Call) => void): () => void {
  incomingHandlers.add(handler);
  return () => incomingHandlers.delete(handler);
}

async function setSink(id: string) {
  const el = remoteAudio() as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> };
  if (typeof el.setSinkId === 'function') await el.setSinkId(id).catch(() => {});
}

export async function setInputDevice(id: string) {
  saveAudioPrefs({ ...getAudioPrefs(), input: id });
  if (client) await client.setAudioSettings({ micId: id }).catch(() => {});
}

export async function setOutputDevice(id: string) {
  saveAudioPrefs({ ...getAudioPrefs(), output: id });
  await setSink(id);
}

export function destroyDevice() {
  setConnection('idle');
  void client?.disconnect().catch(() => {});
  client = null;
  clientWorkspace = null;
  calls.clear();
}

/** Map quality warnings to the 3-bar indicator. */
export function qualityFromWarnings(active: Set<string>): 0 | 1 | 2 | 3 {
  if (active.size === 0) return 3;
  if (active.has('low-mos') || active.has('high-packet-loss')) return 1;
  return 2;
}

/** Starts loading the SDK and a token in the background so the first call connects quickly. */
export function warmDevice(workspaceId: string) {
  if (typeof window === 'undefined' || !isVoiceSupported()) return;
  void getDevice(workspaceId).catch(() => {});
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => connection !== 'idle' && setConnection('offline'));
  window.addEventListener('online', () => connection === 'offline' && setConnection(client ? 'reconnecting' : 'idle'));
}

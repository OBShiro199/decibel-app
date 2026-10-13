'use client';
// Wrapper around the Twilio Voice JS SDK Device: one per session, created after
// login, token minted by the twilio-token Edge Function and refreshed on
// tokenWillExpire. The browser never holds Twilio credentials.
import type { Call, Device } from '@twilio/voice-sdk';
import { invoke } from '@/lib/supabase/client';

let device: Device | null = null;

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
let deviceWorkspace: string | null = null;
let creating: Promise<Device> | null = null;
const incomingHandlers = new Set<(call: Call) => void>();

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

async function fetchToken(workspaceId: string): Promise<string> {
  const { token } = await invoke<{ token: string }>('twilio-token', { workspace_id: workspaceId });
  return token;
}

async function applyAudioPrefs(d: Device) {
  const prefs = getAudioPrefs();
  try {
    if (prefs.input) await d.audio?.setInputDevice(prefs.input);
    if (prefs.output && d.audio?.isOutputSelectionSupported) await d.audio.speakerDevices.set(prefs.output);
  } catch {
    // device unplugged since it was saved: fall back to the system default
  }
}

export function isVoiceSupported(): boolean {
  return typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;
}

/** Returns the session's Device, creating and registering it on first use. */
export async function getDevice(workspaceId: string): Promise<Device> {
  if (device && deviceWorkspace === workspaceId && device.state !== 'destroyed') return device;
  if (creating) return creating;
  creating = (async () => {
    setConnection('connecting');
    const [{ Device }, token] = await Promise.all([import('@twilio/voice-sdk'), fetchToken(workspaceId)]);
    device?.destroy();
    const d = new Device(token, {
      codecPreferences: ['opus', 'pcmu'] as never,
      closeProtection: 'A call is in progress. Leaving will hang up.',
      // The SDK logs every dropped signalling socket (close code 1006) with console.error and then
      // reconnects by itself. Keep its logger quiet and report real failures through the events below.
      logLevel: 'silent',
    });
    d.on('tokenWillExpire', async () => {
      try {
        d.updateToken(await fetchToken(workspaceId));
      } catch (e) {
        console.error('token refresh failed', e);
      }
    });
    d.on('incoming', (call: Call) => incomingHandlers.forEach((h) => h(call)));
    d.on('error', (e: Error & { code?: number }) => console.warn(`[softphone] Twilio error ${e.code ?? ''}: ${e.message}`));
    d.on('unregistered', () => setConnection(navigator.onLine ? 'reconnecting' : 'offline'));
    d.on('registering', () => connection !== 'connected' || setConnection('reconnecting'));
    d.on('registered', () => setConnection('connected'));
    // Registration is only needed for inbound calls. Never make an outbound call wait for it.
    d.register().catch((e) => {
      console.warn('[softphone] inbound registration failed (outbound still works)', e);
      setConnection('reconnecting');
    });
    await applyAudioPrefs(d);
    device = d;
    deviceWorkspace = workspaceId;
    return d;
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

export function onIncoming(handler: (call: Call) => void): () => void {
  incomingHandlers.add(handler);
  return () => incomingHandlers.delete(handler);
}

export async function setInputDevice(id: string) {
  saveAudioPrefs({ ...getAudioPrefs(), input: id });
  if (device) await device.audio?.setInputDevice(id);
}

export async function setOutputDevice(id: string) {
  saveAudioPrefs({ ...getAudioPrefs(), output: id });
  if (device?.audio?.isOutputSelectionSupported) await device.audio.speakerDevices.set(id);
}

export function destroyDevice() {
  setConnection('idle');
  device?.destroy();
  device = null;
  deviceWorkspace = null;
}

/** Map SDK quality warnings to the 3-bar indicator. */
export function qualityFromWarnings(active: Set<string>): 0 | 1 | 2 | 3 {
  if (active.size === 0) return 3;
  if (active.has('low-mos') || active.has('high-packet-loss') || active.has('high-packets-lost-fraction')) return 1;
  return 2;
}

export type { Call, Device };

/** Starts loading the SDK and a token in the background so the first call connects quickly. */
export function warmDevice(workspaceId: string) {
  if (typeof window === 'undefined' || !isVoiceSupported()) return;
  void getDevice(workspaceId).catch(() => {});
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => connection !== 'idle' && setConnection('offline'));
  window.addEventListener('online', () => connection === 'offline' && setConnection(device ? 'reconnecting' : 'idle'));
}

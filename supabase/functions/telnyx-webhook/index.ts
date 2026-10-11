// Telnyx Call Control webhooks for every call (both the Call Control app and the browser
// credential connection send here).
//
// Outbound (rep's browser → a person):
//   1. call.initiated on the credential connection: the browser leg, parked by Telnyx. Its
//      X-Decibel-Call header names a call row written by telnyx-call. We check the row is fresh,
//      unused and belongs to this rep, then dial the destination STORED on the row from the Call
//      Control app, linked to the browser leg, recording from answer when the workspace records.
//   2. call.answered on the far leg: the recording notice is spoken to the callee only, then
//      (call.speak.ended) the two legs are bridged. Without a notice they are bridged at once.
//   3. call.hangup on either leg ends the other and settles the row (status, cause, duration).
//   4. call.recording.saved: the file is copied to Storage (recordings/{ws}/{call}.mp3) and
//      deleted from Telnyx.
// Inbound (someone calls a workspace number):
//   call.initiated on the app → transfer to the assigned rep's browser (sip:<credential>), with the
//   call row id in a header. If the rep doesn't answer, the caller hears a prompt and can leave a
//   voicemail (up to 2 minutes), saved like a recording.
//
// Webhooks can repeat and arrive out of order: each event id is processed once, every command
// carries a command_id (Telnyx ignores repeats for 60s), and final call states are never overwritten.
import { admin, json } from '../_shared/http.ts';
import { normalizePhone } from '../_shared/phone.ts';
import {
  callAction,
  CC_APP_ID,
  CREDENTIAL_CONNECTION_ID,
  decodeState,
  encodeState,
  header,
  readWebhook,
  sipUri,
  telnyx,
  type LegState,
  type TelnyxEvent,
  VOICE,
} from '../_shared/telnyx.ts';

const FINAL = ['completed', 'busy', 'no_answer', 'failed', 'canceled', 'blocked'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SETUP_TEST = 'This is Decibel. Your setup works.';
const VOICEMAIL_PROMPT = 'Sorry, nobody is available to take your call. Please leave a message after the tone.';

type Db = ReturnType<typeof admin>;
interface CallRow {
  id: string;
  workspace_id: string;
  user_id: string | null;
  direction: string;
  kind: string;
  status: string;
  to_e164: string;
  from_e164: string | null;
  provider_call_id: string | null;
  provider_child_call_id: string | null;
  answered_at: string | null;
  created_at: string;
  recording_consent_played: boolean;
  practice: boolean;
}
const COLS = 'id,workspace_id,user_id,direction,kind,status,to_e164,from_e164,provider_call_id,provider_child_call_id,answered_at,created_at,recording_consent_played,practice';

/** Updates a call unless it already reached a final state. */
async function settle(db: Db, id: string, fields: Record<string, unknown>) {
  await db.from('calls').update(fields).eq('id', id).not('status', 'in', `(${FINAL.join(',')})`);
}

const seconds = (from: string | null, to: string) => (from ? Math.max(0, Math.round((Date.parse(to) - Date.parse(from)) / 1000)) : 0);

/** Our status for a far leg that ended without being answered. */
function unanswered(cause?: string): string {
  if (cause === 'user_busy' || cause === 'call_rejected') return 'busy';
  if (cause === 'timeout' || cause === 'no_answer') return 'no_answer';
  if (cause === 'originator_cancel') return 'canceled';
  return 'failed';
}

const hangup = (ccid: string | null | undefined, tag: string) => (ccid ? callAction(ccid, 'hangup', {}, tag).catch(() => {}) : Promise.resolve());

// ---- outbound: the browser's parked leg ---------------------------------------------------------
async function repLegStarted(db: Db, e: TelnyxEvent, signed: boolean) {
  const p = e.payload;
  const ccid = p.call_control_id!;
  const callId = header(e, 'X-Decibel-Call');
  const refuse = async (why: string, id?: string) => {
    console.warn('telnyx refuse rep leg', why, callId);
    await hangup(ccid, `refuse:${ccid}`);
    if (id) await settle(db, id, { status: 'failed', hangup_cause: why, ended_at: new Date().toISOString() });
  };
  if (!callId || !UUID.test(callId)) return refuse('no_call_id');

  const { data: call } = await db.from('calls').select(COLS).eq('id', callId).maybeSingle<CallRow>();
  if (!call || call.status !== 'queued' || call.provider_call_id) return refuse('call_not_startable');
  if (Date.now() - Date.parse(call.created_at) > 2 * 60_000) return refuse('call_expired', call.id);

  // the leg must come from this rep's own credential
  const { data: cred } = await db.from('telnyx_credentials').select('sip_username').eq('user_id', call.user_id!).maybeSingle();
  const from = String(p.from ?? '');
  if (cred && from && from.includes('gencred') && !from.includes(cred.sip_username)) return refuse('wrong_rep', call.id);
  if (!signed) {
    // unsigned webhooks are confirmed against the API before we spend money on a dial
    const live = await telnyx<{ is_alive?: boolean }>('GET', `/calls/${encodeURIComponent(ccid)}`).catch(() => null);
    if (!live?.is_alive) return refuse('not_live', call.id);
  }

  // claim the row for this leg (only one leg can)
  const { data: claimed } = await db
    .from('calls')
    .update({ provider_call_id: ccid, call_session_id: p.call_session_id ?? null, status: 'initiated', started_at: e.occurred_at })
    .eq('id', call.id)
    .is('provider_call_id', null)
    .eq('status', 'queued')
    .select('id');
  if (!claimed?.length) return refuse('already_claimed');

  const record = call.recording_consent_played;
  const greeting = call.kind === 'test' && !call.practice && !call.to_e164.startsWith('sip:');
  const state: LegState = { call_id: call.id, leg: 'far', ws: call.workspace_id, notice: record || greeting, test: call.kind === 'test' };
  try {
    const far = await telnyx<{ call_control_id: string }>('POST', '/calls', {
      connection_id: CC_APP_ID,
      to: call.to_e164,
      from: call.from_e164 ?? '+441000000000',
      timeout_secs: 30,
      time_limit_secs: 4 * 3600,
      link_to: ccid,
      client_state: encodeState(state),
      command_id: `dial:${call.id}`,
      sip_region: 'Europe',
      ...(record ? { record: 'record-from-answer', record_channels: 'dual', record_format: 'mp3', record_max_length: 0 } : {}),
    });
    await db.from('calls').update({ provider_child_call_id: far.call_control_id }).eq('id', call.id);
  } catch (err) {
    console.error('telnyx dial failed', call.id, (err as Error).message);
    await hangup(ccid, `dialfail:${ccid}`);
    await settle(db, call.id, { status: 'failed', hangup_cause: `dial_failed: ${(err as Error).message}`.slice(0, 200), ended_at: new Date().toISOString() });
  }
}

// ---- inbound: someone calls a workspace number ------------------------------------------------------
async function inboundStarted(db: Db, e: TelnyxEvent) {
  const p = e.payload;
  const ccid = p.call_control_id!;
  const to = normalizePhone(String(p.to ?? '')) ?? String(p.to ?? '');
  const from = normalizePhone(String(p.from ?? '')) ?? String(p.from ?? 'unknown');
  const { data: number } = await db
    .from('phone_numbers')
    .select('id,workspace_id,assigned_user_id')
    .eq('e164', to)
    .eq('provider', 'telnyx')
    .neq('status', 'released')
    .maybeSingle();
  if (!number) {
    await callAction(ccid, 'reject', { cause: 'NOT_FOUND' }, `reject:${ccid}`).catch(() => {});
    return;
  }
  const { data: ws } = await db.from('workspaces').select('created_by').eq('id', number.workspace_id).single();
  const target = number.assigned_user_id ?? ws?.created_by ?? null;
  const { data: person } = await db.from('people').select('id').eq('workspace_id', number.workspace_id).eq('mobile_e164', from).limit(1).maybeSingle();
  const callId = crypto.randomUUID();
  await db.from('calls').insert({
    id: callId,
    workspace_id: number.workspace_id,
    user_id: target,
    person_id: person?.id ?? null,
    phone_number_id: number.id,
    direction: 'inbound',
    kind: 'standard',
    from_e164: from,
    to_e164: to,
    status: 'ringing',
    provider_call_id: ccid,
    call_session_id: p.call_session_id ?? null,
    started_at: e.occurred_at,
  });
  const { data: cred } = target ? await db.from('telnyx_credentials').select('sip_username').eq('user_id', target).maybeSingle() : { data: null };
  if (!cred) return voicemail(db, ccid, callId, number.workspace_id, false);
  try {
    await callAction(
      ccid,
      'transfer',
      {
        to: sipUri(cred.sip_username),
        from: from.startsWith('+') ? from : undefined,
        timeout_secs: 25,
        client_state: encodeState({ call_id: callId, leg: 'inbound', ws: number.workspace_id }),
        target_leg_client_state: encodeState({ call_id: callId, leg: 'agent', ws: number.workspace_id }),
        custom_headers: [{ name: 'X-Decibel-Call', value: callId }],
      },
      `transfer:${callId}`,
    );
  } catch (err) {
    console.warn('telnyx inbound transfer failed', callId, (err as Error).message);
    await voicemail(db, ccid, callId, number.workspace_id, false);
  }
}

/** Nobody took an inbound call: prompt, beep, record up to 2 minutes. */
async function voicemail(db: Db, ccid: string, callId: string, ws: string, answered: boolean) {
  await db.from('calls').update({ kind: 'voicemail', status: 'no_answer' }).eq('id', callId);
  const state = encodeState({ call_id: callId, leg: 'voicemail', ws });
  if (!answered) {
    const ok = await callAction(ccid, 'answer', { client_state: state }, `vm-answer:${callId}`).then(() => true).catch(() => false);
    if (ok) return; // the prompt starts on call.answered
  }
  await callAction(ccid, 'client_state_update', { client_state: state }, `vm-state:${callId}`).catch(() => {});
  await callAction(ccid, 'speak', { payload: VOICEMAIL_PROMPT, voice: VOICE, client_state: state }, `vm-speak:${callId}`).catch(() => {});
}

// ---- events on legs we stamped -----------------------------------------------------------------------
async function stampedEvent(db: Db, e: TelnyxEvent, s: LegState) {
  const p = e.payload;
  const ccid = p.call_control_id!;
  const { data: call } = await db.from('calls').select(COLS).eq('id', s.call_id).maybeSingle<CallRow>();
  if (!call || call.workspace_id !== s.ws) return;

  switch (`${s.leg}:${e.event_type}`) {
    case 'far:call.initiated':
      await settle(db, call.id, { status: 'ringing', provider_child_call_id: ccid });
      return;
    case 'far:call.answered': {
      await settle(db, call.id, { status: 'in_progress', answered_at: e.occurred_at });
      if (s.notice) {
        const { data: ws } = await db.from('workspaces').select('recording_notice_text').eq('id', call.workspace_id).single();
        const text = s.test && !call.recording_consent_played ? SETUP_TEST : ws?.recording_notice_text || 'This call may be recorded for quality and training purposes.';
        // spoken to the callee only; the rep is still parked and hears ringing
        const spoke = await callAction(ccid, 'speak', { payload: text, voice: VOICE, target_legs: 'self' }, `notice:${call.id}`).then(() => true).catch(() => false);
        if (spoke) return;
      }
      await bridge(db, call, ccid);
      return;
    }
    case 'far:call.speak.ended':
      await bridge(db, call, ccid);
      return;
    case 'far:call.hangup': {
      const answered = call.answered_at ?? null;
      const ended = e.occurred_at;
      await settle(db, call.id, {
        status: answered ? 'completed' : unanswered(p.hangup_cause),
        hangup_cause: [p.hangup_cause, p.sip_hangup_cause].filter(Boolean).join(' / ') || null,
        ended_at: ended,
        duration_seconds: seconds(answered, ended),
      });
      await hangup(call.provider_call_id, `end-rep:${call.id}`);
      return;
    }
    case 'inbound:call.hangup':
      // the caller hung up (or the call ended after the rep answered)
      await settle(db, call.id, {
        status: call.answered_at ? 'completed' : 'no_answer',
        hangup_cause: p.hangup_cause ?? null,
        ended_at: e.occurred_at,
        duration_seconds: seconds(call.answered_at, e.occurred_at),
      });
      return;
    case 'agent:call.answered':
      await settle(db, call.id, { status: 'in_progress', answered_at: e.occurred_at, provider_child_call_id: ccid });
      return;
    case 'agent:call.hangup':
      if (call.status === 'in_progress' || call.answered_at) {
        await settle(db, call.id, { status: 'completed', ended_at: e.occurred_at, duration_seconds: seconds(call.answered_at, e.occurred_at) });
        await hangup(call.provider_call_id, `end-inbound:${call.id}`);
      } else if (call.provider_call_id && !FINAL.includes(call.status)) {
        // the rep didn't pick up: the caller's leg stays up, so offer voicemail
        await voicemail(db, call.provider_call_id, call.id, call.workspace_id, false);
      }
      return;
    case 'voicemail:call.answered':
      await callAction(ccid, 'speak', { payload: VOICEMAIL_PROMPT, voice: VOICE }, `vm-speak:${call.id}`).catch(() => {});
      return;
    case 'voicemail:call.speak.ended':
      await callAction(ccid, 'record_start', { format: 'mp3', channels: 'single', play_beep: true, max_length: 120, timeout_secs: 8 }, `vm-record:${call.id}`).catch(() => {});
      return;
    case 'voicemail:call.hangup':
      await db.from('calls').update({ ended_at: e.occurred_at }).eq('id', call.id);
      return;
  }
}

async function bridge(db: Db, call: CallRow, farCcid: string) {
  if (!call.provider_call_id) return;
  try {
    // the rep's leg is parked (unanswered, hearing ringback): answer it, then join the two legs
    await callAction(call.provider_call_id, 'answer', {}, `answer-rep:${call.id}`).catch((err) => {
      if (!/already|answered/i.test((err as Error).message)) throw err;
    });
    await callAction(call.provider_call_id, 'bridge', { call_control_id: farCcid }, `bridge:${call.id}`);
  } catch (err) {
    const why = (err as Error).message;
    console.error('telnyx bridge failed', call.id, why);
    await hangup(farCcid, `bridgefail:${call.id}`);
    await hangup(call.provider_call_id, `bridgefail-rep:${call.id}`);
    await settle(db, call.id, { status: 'failed', hangup_cause: `bridge_failed: ${why}`.slice(0, 200), ended_at: new Date().toISOString() });
  }
}

/** The rep's browser leg ended (they hung up, or it dropped). */
async function repLegEnded(db: Db, e: TelnyxEvent) {
  const { data: call } = await db.from('calls').select(COLS).eq('provider_call_id', e.payload.call_control_id!).maybeSingle<CallRow>();
  if (!call || call.direction !== 'outbound') return;
  if (!call.answered_at) await settle(db, call.id, { status: 'canceled', hangup_cause: 'caller_hung_up', ended_at: e.occurred_at });
  await hangup(call.provider_child_call_id, `end-far:${call.id}`);
}

// ---- recordings -------------------------------------------------------------------------------------------
async function recordingSaved(db: Db, e: TelnyxEvent, s: LegState, signed: boolean) {
  const p = e.payload as TelnyxEvent['payload'] & {
    recording_id?: string;
    recording_urls?: { mp3?: string };
    recording_started_at?: string;
    recording_ended_at?: string;
    channels?: string;
  };
  const { data: call } = await db.from('calls').select('id,workspace_id,answered_at,ended_at').eq('id', s.call_id).maybeSingle();
  if (!call || call.workspace_id !== s.ws || !p.recording_id) return;
  // the API is the source of truth for the download link (and confirms unsigned events)
  let url = signed ? p.recording_urls?.mp3 : undefined;
  if (!url) {
    const rec = await telnyx<{ download_urls?: { mp3?: string } }>('GET', `/recordings/${p.recording_id}`);
    url = rec.download_urls?.mp3;
  }
  if (!url) throw new Error('recording has no download url');
  const audio = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!audio.ok) throw new Error(`recording download ${audio.status}`);
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const path = `${call.workspace_id}/${call.id}.mp3`;
  const up = await db.storage.from('recordings').upload(path, bytes, { contentType: 'audio/mpeg', upsert: true });
  if (up.error) throw new Error(up.error.message);
  const duration = p.recording_started_at && p.recording_ended_at ? seconds(p.recording_started_at, p.recording_ended_at) : 0;
  let deletedAt: string | null = null;
  try {
    await telnyx('DELETE', `/recordings/${p.recording_id}`);
    deletedAt = new Date().toISOString();
  } catch (err) {
    console.warn('telnyx recording delete failed', p.recording_id, (err as Error).message);
  }
  await db.from('recordings').upsert(
    {
      workspace_id: call.workspace_id,
      call_id: call.id,
      storage_path: `recordings/${path}`,
      provider_recording_id: p.recording_id,
      duration_seconds: duration,
      channels: p.channels === 'single' ? 1 : 2,
      size_bytes: bytes.byteLength,
      provider_deleted_at: deletedAt,
    },
    { onConflict: 'call_id' },
  );
  if (s.leg === 'voicemail') {
    await db.from('calls').update({ kind: 'voicemail', status: 'completed', duration_seconds: duration, ended_at: call.ended_at ?? e.occurred_at }).eq('id', call.id);
  }
}

// ---- entry ----------------------------------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  const read = await readWebhook(req);
  if (read instanceof Response) return read;
  const { event: e, signed } = read;
  const db = admin();

  const { data: fresh } = await db.rpc('claim_telnyx_event', { p_id: e.id, p_type: e.event_type });
  if (fresh === false) return json({ ok: true, duplicate: true });

  try {
    const p = e.payload;
    const s = decodeState(p.client_state);
    if (e.event_type === 'call.recording.saved' && s) await recordingSaved(db, e, s, signed);
    else if (s) await stampedEvent(db, e, s);
    else if (e.event_type === 'call.initiated' && p.connection_id === CREDENTIAL_CONNECTION_ID) await repLegStarted(db, e, signed);
    else if (e.event_type === 'call.initiated' && p.connection_id === CC_APP_ID && p.direction === 'incoming') await inboundStarted(db, e);
    else if (e.event_type === 'call.hangup' && p.connection_id === CREDENTIAL_CONNECTION_ID) await repLegEnded(db, e);
    return json({ ok: true });
  } catch (err) {
    console.error('telnyx-webhook', e.event_type, (err as Error).message);
    // let Telnyx retry: forget the claim so the retry is processed
    await db.from('telnyx_events').delete().eq('id', e.id);
    return json({ ok: false }, 500);
  }
});

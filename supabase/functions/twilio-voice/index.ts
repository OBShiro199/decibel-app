// Twilio hits this when the browser calls device.connect(). Returns TwiML.
// Kept tiny on purpose: no SDK imports, one round of DB work, then XML.
import { admin, FUNCTIONS_URL, xml } from '../_shared/http.ts';
import { esc, fromIdentity, say, webhook } from '../_shared/twilio.ts';

const E164 = /^\+[1-9][0-9]{6,14}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function blockedTwiml(message: string) {
  return xml(`<Response>${say(message)}<Hangup/></Response>`);
}

Deno.serve(async (req) => {
  const ctx = await webhook(req, 'twilio-voice');
  if (ctx instanceof Response) return ctx;
  const { body, query, ws } = ctx;
  const db = admin();

  // Whisper leg: TwiML played to the callee when they answer, before bridging.
  const whisper = query.get('whisper');
  if (whisper === 'notice') return xml(`<Response>${say(ws.recording_notice_text)}</Response>`);
  if (whisper === 'test') return xml(`<Response>${say('This is Decibels. Your setup works.')}</Response>`);

  const userId = fromIdentity(body.From ?? '');
  if (!UUID.test(userId)) return blockedTwiml('This call could not be authorised.');
  const kind = body.Kind === 'test' ? 'test' : 'standard';
  const personId = UUID.test(body.PersonId ?? '') ? body.PersonId : null;
  const listId = UUID.test(body.ListId ?? '') ? body.ListId : null;
  // The browser picks the row id before dialling, so it can attach notes and the
  // outcome without waiting to discover the row.
  const callId = UUID.test(body.CallId ?? '') ? body.CallId : crypto.randomUUID();

  // independent lookups run together: this function sits between "connect" and the phone ringing
  const [numbersRes, checkRes, personRes, memberRes] = await Promise.all([
    db.from('phone_numbers').select('id,e164,is_default').eq('workspace_id', ws.id).eq('status', 'active').order('is_default', { ascending: false }).limit(1),
    kind === 'standard' && personId
      ? db.rpc('can_dial_for', { p_workspace_id: ws.id, p_person_id: personId, p_user_id: userId }).single()
      : Promise.resolve({ data: null }),
    kind === 'standard' && personId ? db.from('people').select('mobile_e164').eq('id', personId).eq('workspace_id', ws.id).maybeSingle() : Promise.resolve({ data: null }),
    kind === 'test' ? db.from('workspace_members').select('user_id').eq('workspace_id', ws.id).eq('user_id', userId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const caller = numbersRes.data?.[0] ?? null;

  let to = body.To ?? '';
  let blocked: string | null = null;
  if (kind === 'standard') {
    const c = checkRes.data as { allowed: boolean; reason: string | null } | null;
    if (!personId) blocked = 'person_not_found';
    else if (!c?.allowed) blocked = c?.reason ?? 'forbidden';
    // never trust the browser's To: dial the number stored on the person
    else to = (personRes.data as { mobile_e164: string | null } | null)?.mobile_e164 ?? '';
  } else if (!memberRes.data) blocked = 'forbidden';
  else if (ws.minute_balance_seconds <= 0 && !ws.stripe_customer_id) blocked = 'no_minutes';
  if (!blocked && !E164.test(to)) blocked = 'no_mobile';
  if (!blocked && !caller) blocked = 'no_caller_id';

  if (blocked) {
    await db.from('calls').insert({
      id: callId,
      workspace_id: ws.id,
      user_id: userId,
      person_id: personId,
      list_id: listId,
      kind,
      to_e164: E164.test(to) ? to : body.To || 'unknown',
      status: 'blocked',
      blocked_reason: blocked,
      twilio_call_sid: body.CallSid,
      ended_at: new Date().toISOString(),
    });
    return blockedTwiml('This number cannot be called.');
  }

  const record =
    kind === 'standard' &&
    (ws.recording_policy === 'always' || (ws.recording_policy === 'rep_choice' && body.Record === 'true'));

  const { data: call, error } = await db
    .from('calls')
    .insert({
      id: callId,
      workspace_id: ws.id,
      user_id: userId,
      person_id: personId,
      list_id: listId,
      phone_number_id: caller!.id,
      kind,
      to_e164: to,
      from_e164: caller!.e164,
      status: 'initiated',
      twilio_call_sid: body.CallSid,
      recording_consent_played: record,
    })
    .select('id')
    .single();
  if (error || !call) {
    console.error('calls insert failed', error?.message);
    return blockedTwiml('Sorry, something went wrong starting this call.');
  }

  const q = `ws=${ws.id}&call_id=${call.id}`;
  const dialAttrs = [
    `callerId="${esc(caller!.e164)}"`,
    'timeout="30"',
    'answerOnBridge="true"',
    `action="${esc(`${FUNCTIONS_URL}/twilio-status?${q}&leg=dial`)}"`,
    'method="POST"',
    record
      ? `record="record-from-answer-dual" recordingStatusCallback="${esc(`${FUNCTIONS_URL}/twilio-recording?${q}`)}" recordingStatusCallbackEvent="completed"`
      : 'record="do-not-record"',
  ].join(' ');

  // The notice is whispered to the callee on answer, so it is both heard by them
  // and captured at the start of the recording.
  const whisperUrl = record
    ? ` url="${esc(`${FUNCTIONS_URL}/twilio-voice?ws=${ws.id}&whisper=notice`)}"`
    : kind === 'test'
      ? ` url="${esc(`${FUNCTIONS_URL}/twilio-voice?ws=${ws.id}&whisper=test`)}"`
      : '';

  return xml(
    `<Response><Dial ${dialAttrs}>` +
      `<Number statusCallback="${esc(`${FUNCTIONS_URL}/twilio-status?${q}`)}" statusCallbackMethod="POST" ` +
      `statusCallbackEvent="initiated ringing answered completed"${whisperUrl}>${esc(to)}</Number>` +
      `</Dial></Response>`,
  );
});

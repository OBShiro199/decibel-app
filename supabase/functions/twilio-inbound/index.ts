// Voice URL on every purchased number. Rings the assigned member's browser for
// 20s, then falls through to voicemail (<Record>).
import { admin, FUNCTIONS_URL, xml } from '../_shared/http.ts';
import {
  esc,
  loadCreds,
  loadWorkspace,
  PARENT_SID,
  PARENT_TOKEN,
  publicUrl,
  say,
  toIdentity,
  validateSignature,
} from '../_shared/twilio.ts';

Deno.serve(async (req) => {
  const body = Object.fromEntries(new URLSearchParams(await req.text())) as Record<string, string>;
  const query = new URL(req.url).searchParams;
  const db = admin();

  // The first request carries no ws query: resolve the workspace from the dialled number.
  let wsId = query.get('ws');
  if (!wsId) {
    const { data: num } = await db
      .from('phone_numbers')
      .select('workspace_id')
      .eq('e164', body.To ?? '')
      .neq('status', 'released')
      .limit(1)
      .maybeSingle();
    wsId = num?.workspace_id ?? null;
  }
  const ws = wsId ? await loadWorkspace(wsId) : null;
  if (!ws) return new Response('unknown number', { status: 404 });

  const accountSid = body.AccountSid ?? '';
  let token = '';
  if (accountSid === PARENT_SID && ws.twilio_account_mode !== 'subaccount') token = PARENT_TOKEN;
  else if (accountSid && accountSid === ws.twilio_subaccount_sid) token = (await loadCreds(ws.id))?.auth_token ?? '';
  const ok = await validateSignature(
    token,
    req.headers.get('x-twilio-signature') ?? '',
    publicUrl(req, 'twilio-inbound'),
    body,
  );
  if (!ok) return new Response('invalid signature', { status: 403 });

  const callId = query.get('call_id');
  if (query.get('stage') === 'after' && callId) {
    const duration = parseInt(body.DialCallDuration ?? '0', 10) || 0;
    if (body.DialCallStatus === 'completed') {
      await db
        .from('calls')
        .update({ status: 'completed', ended_at: new Date().toISOString(), duration_seconds: duration })
        .eq('id', callId)
        .eq('workspace_id', ws.id);
      return xml('<Response><Hangup/></Response>');
    }
    await db.from('calls').update({ status: 'no_answer', kind: 'voicemail' }).eq('id', callId).eq('workspace_id', ws.id);
    const cb = `${FUNCTIONS_URL}/twilio-recording?ws=${ws.id}&call_id=${callId}&voicemail=1`;
    return xml(
      `<Response>${say('Sorry, nobody is available to take your call. Please leave a message after the tone.')}` +
        `<Record maxLength="120" playBeep="true" recordingStatusCallback="${esc(cb)}" recordingStatusCallbackEvent="completed"/>` +
        `<Hangup/></Response>`,
    );
  }

  const { data: number } = await db
    .from('phone_numbers')
    .select('id,assigned_user_id')
    .eq('workspace_id', ws.id)
    .eq('e164', body.To ?? '')
    .maybeSingle();
  const target: string = number?.assigned_user_id ?? ws.created_by;

  const { data: person } = await db
    .from('people')
    .select('id')
    .eq('workspace_id', ws.id)
    .eq('mobile_e164', body.From ?? '')
    .maybeSingle();

  const { data: call } = await db
    .from('calls')
    .insert({
      workspace_id: ws.id,
      user_id: target,
      person_id: person?.id ?? null,
      phone_number_id: number?.id ?? null,
      direction: 'inbound',
      from_e164: body.From ?? null,
      to_e164: body.To ?? 'unknown',
      status: 'ringing',
      twilio_call_sid: body.CallSid,
    })
    .select('id')
    .single();

  const q = `ws=${ws.id}&call_id=${call?.id ?? ''}`;
  return xml(
    `<Response><Dial timeout="20" answerOnBridge="true" action="${esc(`${FUNCTIONS_URL}/twilio-inbound?${q}&stage=after`)}" method="POST">` +
      `<Client statusCallback="${esc(`${FUNCTIONS_URL}/twilio-status?${q}`)}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed">` +
      `<Identity>${esc(toIdentity(target))}</Identity>` +
      `<Parameter name="CallId" value="${esc(call?.id ?? '')}"/>` +
      `<Parameter name="PersonId" value="${esc(person?.id ?? '')}"/>` +
      `</Client></Dial></Response>`,
  );
});

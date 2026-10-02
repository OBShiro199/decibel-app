// Twilio status callbacks -> calls row. Handles three shapes:
//  - <Number statusCallback>: child (PSTN) leg events, CallStatus
//  - <Dial action> (leg=dial): final DialCallStatus, must answer with TwiML
//  - TwiML App status callback (leg=client): parent leg finished
import { admin, xml } from '../_shared/http.ts';
import { webhook } from '../_shared/twilio.ts';

const FINAL = ['completed', 'busy', 'no_answer', 'failed', 'canceled', 'blocked'];
const MAP: Record<string, string> = {
  queued: 'queued',
  initiated: 'initiated',
  ringing: 'ringing',
  'in-progress': 'in_progress',
  answered: 'in_progress',
  completed: 'completed',
  busy: 'busy',
  'no-answer': 'no_answer',
  failed: 'failed',
  canceled: 'canceled',
};

Deno.serve(async (req) => {
  const ctx = await webhook(req, 'twilio-status');
  if (ctx instanceof Response) return ctx;
  const { body, query, ws } = ctx;
  const db = admin();
  const leg = query.get('leg');
  const callId = query.get('call_id');
  const now = new Date().toISOString();

  if (leg === 'client') {
    // Parent leg ended (rep hung up, tab closed, network drop). Close any call still open.
    if (body.CallSid) {
      await db
        .from('calls')
        .update({ status: body.CallStatus === 'completed' ? 'completed' : 'canceled', ended_at: now })
        .eq('workspace_id', ws.id)
        .eq('twilio_call_sid', body.CallSid)
        .not('status', 'in', `(${FINAL.join(',')})`);
    }
    return new Response('ok');
  }

  if (!callId) return leg === 'dial' ? xml('<Response/>') : new Response('ok');

  if (leg === 'dial' || leg === 'inbound') {
    const status = MAP[body.DialCallStatus ?? ''] ?? 'failed';
    const duration = parseInt(body.DialCallDuration ?? '0', 10) || 0;
    const patch: Record<string, unknown> = { status, ended_at: now, hangup_cause: body.DialCallStatus ?? null };
    if (duration > 0) patch.duration_seconds = duration;
    if (body.DialCallSid) patch.twilio_child_call_sid = body.DialCallSid;
    await db.from('calls').update(patch).eq('id', callId).eq('workspace_id', ws.id);
    return xml('<Response/>');
  }

  // child leg progress events
  const status = MAP[body.CallStatus ?? ''];
  if (!status) return new Response('ok');
  const patch: Record<string, unknown> = { status };
  if (body.CallSid) patch.twilio_child_call_sid = body.CallSid;
  if (status === 'in_progress') patch.answered_at = now;
  if (FINAL.includes(status)) {
    patch.ended_at = now;
    patch.hangup_cause = body.CallStatus;
    const duration = parseInt(body.CallDuration ?? '0', 10) || 0;
    if (duration > 0) patch.duration_seconds = duration;
    await db.from('calls').update(patch).eq('id', callId).eq('workspace_id', ws.id);
  } else {
    // callbacks can arrive out of order: never move a finished call backwards
    await db
      .from('calls')
      .update(patch)
      .eq('id', callId)
      .eq('workspace_id', ws.id)
      .not('status', 'in', `(${FINAL.join(',')})`);
  }
  return new Response('ok');
});

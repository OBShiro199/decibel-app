// Recording status callback (completed): copy the MP3 from Twilio into Supabase
// Storage, write the recordings row, then delete the Twilio copy to limit
// third-party retention.
import { admin } from '../_shared/http.ts';
import { loadCreds, PARENT_SID, PARENT_TOKEN, twilio, webhook } from '../_shared/twilio.ts';

Deno.serve(async (req) => {
  const ctx = await webhook(req, 'twilio-recording');
  if (ctx instanceof Response) return ctx;
  const { body, query, ws } = ctx;
  const db = admin();
  const callId = query.get('call_id');
  if (!callId || body.RecordingStatus !== 'completed' || !body.RecordingUrl) return new Response('ok');

  const { data: call } = await db.from('calls').select('id').eq('id', callId).eq('workspace_id', ws.id).maybeSingle();
  if (!call) return new Response('unknown call', { status: 404 });

  const creds =
    ws.twilio_account_mode === 'parent'
      ? { account_sid: PARENT_SID, auth_token: PARENT_TOKEN }
      : await loadCreds(ws.id);
  if (!creds) return new Response('no credentials', { status: 500 });

  const audio = await fetch(`${body.RecordingUrl}.mp3`, {
    headers: { authorization: 'Basic ' + btoa(`${creds.account_sid}:${creds.auth_token}`) },
  });
  if (!audio.ok) {
    console.error('recording download failed', audio.status);
    return new Response('download failed', { status: 502 }); // Twilio retries
  }
  const bytes = new Uint8Array(await audio.arrayBuffer());
  const path = `${ws.id}/${callId}.mp3`;

  const { error: upErr } = await db.storage
    .from('recordings')
    .upload(path, bytes, { contentType: 'audio/mpeg', upsert: true });
  if (upErr) {
    console.error('recording upload failed', upErr.message);
    return new Response('upload failed', { status: 500 });
  }

  const duration = parseInt(body.RecordingDuration ?? '0', 10) || 0;
  const isVoicemail = query.get('voicemail') === '1';
  let deletedAt: string | null = null;
  try {
    await twilio(creds, 'DELETE', `/Recordings/${body.RecordingSid}.json`);
    deletedAt = new Date().toISOString();
  } catch (e) {
    console.warn('twilio recording delete failed', (e as Error).message);
  }

  await db.from('recordings').upsert(
    {
      workspace_id: ws.id,
      call_id: callId,
      storage_path: path,
      twilio_recording_sid: body.RecordingSid,
      duration_seconds: duration,
      channels: parseInt(body.RecordingChannels ?? '2', 10) || 2,
      size_bytes: bytes.byteLength,
      twilio_deleted_at: deletedAt,
    },
    { onConflict: 'call_id' },
  );
  if (isVoicemail) {
    await db
      .from('calls')
      .update({ kind: 'voicemail', status: 'completed', duration_seconds: duration, ended_at: new Date().toISOString() })
      .eq('id', callId);
  }
  return new Response('ok');
});

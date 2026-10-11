#!/usr/bin/env node
// End-to-end calling test on Telnyx, with no phone numbers and no PSTN: two throwaway reps in one
// workspace, each in headless Chrome with a fake microphone. Rep A calls rep B's browser through
// the real path: telnyx-call authorises → the SDK places a parked leg → telnyx-webhook dials B
// (sip:<B's credential>) → B answers → the recording notice is spoken to B only → bridge →
// recording → hang-up → the recording lands in Storage and is deleted from Telnyx.
// Also checks blocked calls, single-use call ids and a forged (unsigned) webhook.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/telnyx-calls.mjs
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
for (const file of [join(here, '..', '.env.local'), join(here, '..', '..', '..', 'supabase', 'functions', '.env')]) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const TELNYX = process.env.TELNYX_API_KEY;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!URL_ || !ANON || !SERVICE || !TELNYX) {
  console.error('Needs .env.local, SUPABASE_SERVICE_ROLE_KEY and TELNYX_API_KEY (supabase/functions/.env).');
  process.exit(2);
}
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const sleep = (n) => new Promise((r) => setTimeout(r, n));
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const cleanup = [];

async function user(label) {
  const email = `telnyx-${label}-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url') + '1';
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  const db = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await db.auth.signInWithPassword({ email, password });
  const id = created.user.id;
  cleanup.push(async () => {
    const { data: cred } = await admin.from('telnyx_credentials').select('credential_id').eq('user_id', id).maybeSingle();
    if (cred) await fetch(`https://api.telnyx.com/v2/telephony_credentials/${cred.credential_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TELNYX}` } });
    await admin.auth.admin.deleteUser(id);
  });
  const fn = async (name, body) => {
    const token = (await db.auth.getSession()).data.session.access_token;
    const res = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { id, db, fn };
}

// ---- a tiny page that runs the Telnyx SDK ------------------------------------------------------
const SDK = readFileSync(join(here, '..', 'node_modules', '@telnyx', 'webrtc', 'lib', 'bundle.js'));
// Headless Chrome on macOS can hang on getUserMedia, so the test page answers it with a generated
// tone (a stand-in microphone). The app itself uses the real getUserMedia.
const PAGE = `<!doctype html><meta charset="utf-8"><audio id="remote" autoplay></audio><script>
navigator.mediaDevices.getUserMedia = async () => {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  osc.frequency.value = 440;
  const dest = ctx.createMediaStreamDestination();
  osc.connect(dest);
  osc.start();
  return dest.stream;
};
</script><script src="/sdk.js"></script><script>
let client, current; const log = [];
window.state = () => ({ ready: !!window.ready, call: current ? current.state : null, cause: current ? current.cause : null, log: log.slice(-30) });
window.start = (token, auto) => new Promise((res, rej) => {
  window.auto = !!auto;
  client = new TelnyxWebRTC.TelnyxRTC({ login_token: token });
  client.remoteElement = document.getElementById('remote');
  client.on('telnyx.ready', () => { window.ready = true; res(true); });
  client.on('telnyx.error', (e) => { log.push('error ' + JSON.stringify(e && (e.error || e)).slice(0, 200)); rej(String((e && e.error && e.error.message) || e)); });
  client.on('telnyx.notification', (n) => {
    if (n.type !== 'callUpdate') return;
    const c = n.call; log.push(c.direction + ':' + c.state); current = c;
    if (window.auto && c.direction === 'inbound' && c.state === 'ringing') setTimeout(() => c.answer(), 800);
  });
  client.connect();
});
window.call = (dest, id) => { current = client.newCall({ destinationNumber: dest, audio: true, video: false, customHeaders: [{ name: 'X-Decibel-Call', value: id }] }); return true; };
window.hangup = () => { if (current) current.hangup(); return true; };
</script>`;

async function chrome(port, url) {
  const profile = mkdtempSync(join(tmpdir(), 'telnyx-'));
  const proc = spawn(
    CHROME,
    ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', url],
    { stdio: 'ignore' },
  );
  cleanup.unshift(() => {
    proc.kill();
    setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
  });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const i = ++id;
      pending.set(i, resolve);
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return {
    eval: async (expression) => {
      const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description ?? 'evaluate failed');
      return r.result?.result?.value;
    },
  };
}

async function until(fn, ms, every = 500) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await fn();
    if (last) return last;
    await sleep(every);
  }
  return last;
}
const callRow = async (id) => (await admin.from('calls').select('*').eq('id', id).maybeSingle()).data;

async function main() {
  const server = createServer((req, res) => {
    if (req.url === '/sdk.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(SDK);
    res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanup.push(() => server.close());
  const page = `http://localhost:${server.address().port}/`;

  const A = await user('a');
  const B = await user('b');
  const { data: ws, error: wsErr } = await A.db.rpc('create_workspace', { p_name: 'Telnyx probe', p_slug: `tx-${randomBytes(3).toString('hex')}` });
  if (wsErr) throw new Error(wsErr.message);
  cleanup.unshift(() => admin.from('workspaces').delete().eq('id', ws.id));
  await admin.from('workspace_members').insert({ workspace_id: ws.id, user_id: B.id, role: 'member' });

  // tokens
  const tA = await A.fn('telnyx-token', { workspace_id: ws.id });
  const tB = await B.fn('telnyx-token', { workspace_id: ws.id });
  check('Each rep gets a browser calling token from their own credential', tA.status === 200 && tA.body.token?.length > 100 && tB.body.sip_username && tA.body.sip_username !== tB.body.sip_username, `${tA.status} ${tA.body.sip_username ?? tA.body.error}`);
  const outsider = await user('c');
  const tC = await outsider.fn('telnyx-token', { workspace_id: ws.id });
  check("A non-member can't get a token for the workspace", tC.status === 403);

  // browsers
  await sleep(5000); // Telnyx: wait ~5s after creating a credential before the first login
  const pa = await chrome(9411, page);
  const pb = await chrome(9412, page);
  await sleep(1500);
  const readyA = await pa.eval(`start(${JSON.stringify(tA.body.token)}, false).then(() => true, (e) => 'error: ' + e)`);
  const readyB = await pb.eval(`start(${JSON.stringify(tB.body.token)}, true).then(() => true, (e) => 'error: ' + e)`);
  check('Both browsers log in to Telnyx', readyA === true && readyB === true, `${readyA} / ${readyB}`);

  // blocked before anything rings
  const blocked = await A.fn('telnyx-call', { workspace_id: ws.id, call_id: randomUUID(), kind: 'test', to: '+447700900123' });
  check('A test call to a number that is not yours is blocked before dialling', blocked.body.blocked === 'test_number_not_yours', JSON.stringify(blocked.body));
  const stranger = await A.fn('telnyx-call', { workspace_id: ws.id, call_id: randomUUID(), kind: 'test', to_user_id: outsider.id });
  check("Calling someone outside the workspace's browser is blocked", stranger.body.blocked === 'forbidden', JSON.stringify(stranger.body));

  // the real call, with the recording notice and recording switched on
  const callId = randomUUID();
  const auth = await A.fn('telnyx-call', { workspace_id: ws.id, call_id: callId, kind: 'test', to_user_id: B.id });
  check('The call is authorised and its row written with the server-chosen destination', auth.status === 200 && auth.body.destination?.startsWith('sip:') && (await callRow(callId))?.to_e164 === `sip:${tB.body.sip_username}@sip.telnyx.com`, JSON.stringify(auth.body));
  await admin.from('calls').update({ recording_consent_played: true }).eq('id', callId); // exercise the notice + recording path
  const t0 = Date.now();
  await pa.eval(`call(${JSON.stringify(auth.body.destination)}, ${JSON.stringify(callId)})`);
  const rang = await until(async () => (await pb.eval('state()')).log.some((l) => l.startsWith('inbound:')), 30_000);
  check("The server dials the teammate and their browser rings", rang, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const live = await until(async () => (await pa.eval('state()')).call === 'active', 40_000);
  const rowLive = await callRow(callId);
  check('After the notice the two browsers are bridged', live && rowLive?.status === 'in_progress' && rowLive?.provider_call_id && rowLive?.provider_child_call_id, `${rowLive?.status}; A log ${(await pa.eval('state()')).log.join(',')}`);
  await sleep(6000);
  await pa.eval('hangup()');
  const done = await until(async () => {
    const r = await callRow(callId);
    return r && ['completed', 'canceled', 'failed', 'no_answer', 'busy'].includes(r.status) ? r : null;
  }, 20_000);
  check('Hanging up ends both legs and settles the call with a duration', done?.status === 'completed' && done.duration_seconds >= 4, `${done?.status}, ${done?.duration_seconds}s, cause ${done?.hangup_cause}`);
  const bEnded = await until(async () => ['hangup', 'destroy', 'purge', null].includes((await pb.eval('state()')).call), 10_000);
  check("The teammate's leg ends too", bEnded);

  const rec = await until(async () => (await admin.from('recordings').select('*').eq('call_id', callId).maybeSingle()).data, 90_000, 2000);
  check('The recording is copied to Storage', !!rec && rec.size_bytes > 1000 && rec.storage_path === `recordings/${ws.id}/${callId}.mp3`, rec ? `${rec.size_bytes} bytes, ${rec.duration_seconds}s` : 'none');
  check('…and deleted from Telnyx', !!rec?.provider_deleted_at);
  const { data: file } = rec ? await admin.storage.from('recordings').download(`${ws.id}/${callId}.mp3`) : { data: null };
  check('The stored file is real audio', !!file && file.size === rec.size_bytes);

  // a call id starts one call only
  await pa.eval(`call(${JSON.stringify(auth.body.destination)}, ${JSON.stringify(callId)})`);
  const refused = await until(async () => ['hangup', 'destroy', 'purge'].includes((await pa.eval('state()')).call), 20_000);
  const after = await callRow(callId);
  check('Replaying a used call id is refused and changes nothing', refused && after.status === 'completed' && after.provider_call_id === done.provider_call_id);

  // a forged, unsigned webhook can't start a dial
  const forgedId = randomUUID();
  await A.fn('telnyx-call', { workspace_id: ws.id, call_id: forgedId, kind: 'test', to_user_id: B.id });
  const forged = await fetch(`${URL_}/functions/v1/telnyx-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      data: {
        id: randomUUID(),
        event_type: 'call.initiated',
        occurred_at: new Date().toISOString(),
        record_type: 'event',
        payload: { call_control_id: 'v3:forged-leg', connection_id: process.env.TELNYX_CREDENTIAL_CONNECTION_ID, direction: 'incoming', state: 'parked', from: 'x', to: 'y', custom_headers: [{ name: 'X-Decibel-Call', value: forgedId }] },
      },
    }),
  });
  await sleep(1500);
  const forgedRow = await callRow(forgedId);
  check('A forged webhook is not acted on (no dial, call refused)', [200, 401].includes(forged.status) && forgedRow?.status !== 'initiated' && !forgedRow?.provider_child_call_id, `${forged.status}, row ${forgedRow?.status} ${forgedRow?.hangup_cause ?? ''}`);
}

try {
  await main();
} catch (e) {
  check('Run completed', false, e.message);
} finally {
  for (const fn of cleanup) {
    try {
      await fn();
    } catch {}
  }
}
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

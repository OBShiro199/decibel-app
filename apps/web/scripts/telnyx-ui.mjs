#!/usr/bin/env node
// Browser test for calling in the app on Telnyx. Rep A uses the real app (softphone provider,
// device wrapper, call panel) in headless Chrome; rep B is a bare Telnyx page that auto-answers.
// A calls B's browser through the real server path, talks, hangs up. Then the phone-number
// screens: live Telnyx search, and choosing a number opens the business-details form (nothing
// is ordered). Needs a production build made with NEXT_PUBLIC_E2E=1 (exposes window.__softphone).
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/telnyx-ui.mjs http://localhost:3005
import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, '..', '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
const fnEnv = join(here, '..', '..', '..', 'supabase', 'functions', '.env');
if (existsSync(fnEnv)) for (const line of readFileSync(fnEnv, 'utf8').split('\n')) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m && !process.env[m[1]]) process.env[m[1]] = m[2]; }
const BASE = process.argv[2] ?? 'http://localhost:3005';
const SHOTS = process.env.SHOTS ?? tmpdir();
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
if (!URL_ || !ANON || !SERVICE) {
  console.error('Needs .env.local and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const sleep = (n) => new Promise((r) => setTimeout(r, n));
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const cleanup = [];

/** Minimal RFC 4180 parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c !== ''));
}

async function testUser() {
  const email = `ui-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url') + '1';
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Search Probe' } });
  if (error) throw new Error(`createUser: ${error.message}`);
  cleanup.push(() => admin.auth.admin.deleteUser(created.user.id));
  let jar = [];
  const ssr = createServerClient(URL_, ANON, {
    cookies: {
      getAll: () => jar,
      setAll: (list) => {
        for (const c of list) {
          jar = jar.filter((x) => x.name !== c.name);
          if (c.value) jar.push({ name: c.name, value: c.value });
        }
      },
    },
  });
  const { error: signErr } = await ssr.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error(`sign in: ${signErr.message}`);
  const { data: ws, error: wsErr } = await ssr.rpc('create_workspace', { p_name: 'Search Probe', p_slug: `ui-${randomBytes(3).toString('hex')}` });
  if (wsErr) throw new Error(`create_workspace: ${wsErr.message}`);
  cleanup.unshift(() => admin.from('workspaces').delete().eq('id', ws.id));
  await admin.from('workspaces').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', ws.id);
  return { jar, ws: ws.id, uid: created.user.id };
}

async function browser(port, downloads) {
  const profile = mkdtempSync(join(tmpdir(), 'tps-ui-'));
  const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${port}`, '--window-size=1440,900', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('Chrome did not start');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    } else if (m.method && listeners.has(m.method)) {
      for (const fn of listeners.get(m.method)) void fn(m.params);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const i = ++id;
      pending.set(i, (m) => (m.error ? reject(new Error(`${method}: ${m.error.message}`)) : resolve(m.result)));
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
    return r.result.value;
  };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  return {
    send,
    evaluate,
    onEvent: (method, fn) => listeners.set(method, [...(listeners.get(method) ?? []), fn]),
    shot: async (name) => {
      const s = await send('Page.captureScreenshot', { format: 'png' });
      writeFileSync(join(SHOTS, `${name}.png`), Buffer.from(s.data, 'base64'));
    },
    close: () => {
      ws.close();
      chrome.kill();
      setTimeout(() => rmSync(profile, { recursive: true, force: true }), 500);
    },
  };
}

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


const TELNYX = process.env.TELNYX_API_KEY;
const GUM = `navigator.mediaDevices.getUserMedia = async () => { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const dest = ctx.createMediaStreamDestination(); osc.connect(dest); osc.start(); return dest.stream; };`;

async function waitFor(b, expr, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await b.evaluate(expr).catch(() => false)) return true;
    await sleep(250);
  }
  return false;
}

async function main() {
  // rep A: the app
  const u = await testUser();
  cleanup.unshift(async () => {
    for (const id of [u.uid]) {
      const { data: cred } = await admin.from('telnyx_credentials').select('credential_id').eq('user_id', id).maybeSingle();
      if (cred) await fetch(`https://api.telnyx.com/v2/telephony_credentials/${cred.credential_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TELNYX}` } });
    }
  });
  // rep B: a teammate with a bare Telnyx page
  const emailB = `ui-b-${randomBytes(4).toString('hex')}@example.test`;
  const passB = randomBytes(18).toString('base64url') + '1';
  const { data: createdB } = await admin.auth.admin.createUser({ email: emailB, password: passB, email_confirm: true });
  const B = createdB.user.id;
  cleanup.push(async () => {
    const { data: cred } = await admin.from('telnyx_credentials').select('credential_id').eq('user_id', B).maybeSingle();
    if (cred) await fetch(`https://api.telnyx.com/v2/telephony_credentials/${cred.credential_id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${TELNYX}` } });
    await admin.auth.admin.deleteUser(B);
  });
  await admin.from('workspace_members').insert({ workspace_id: u.ws, user_id: B, role: 'member' });
  const dbB = createClient(URL_, ANON, { auth: { persistSession: false } });
  await dbB.auth.signInWithPassword({ email: emailB, password: passB });
  const tokB = (await dbB.auth.getSession()).data.session.access_token;
  const tB = await (await fetch(`${URL_}/functions/v1/telnyx-token`, { method: 'POST', headers: { Authorization: `Bearer ${tokB}`, apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify({ workspace_id: u.ws }) })).json();

  const server = createServer((req, res) => {
    if (req.url === '/sdk.js') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(SDK);
    res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  cleanup.push(() => server.close());
  await sleep(4000); // a new credential needs a few seconds before its first login

  const pb = await browser(9431, mkdtempSync(join(tmpdir(), 'tx-b-')));
  cleanup.unshift(() => pb.close());
  await pb.send('Page.navigate', { url: `http://localhost:${server.address().port}/` });
  await sleep(1500);
  const readyB = await pb.evaluate(`start(${JSON.stringify(tB.token)}, true).then(() => true, (e) => 'error: ' + e)`);
  check("The teammate's browser is online", readyB === true, String(readyB));

  const downloads = mkdtempSync(join(tmpdir(), 'tx-dl-'));
  const b = await browser(9432, downloads);
  cleanup.unshift(() => b.close());
  const host = new URL(BASE).hostname;
  await b.send('Network.enable');
  for (const c of u.jar) await b.send('Network.setCookie', { name: c.name, value: c.value, domain: host, path: '/' });
  await b.send('Page.addScriptToEvaluateOnNewDocument', { source: GUM });
  await b.send('Page.navigate', { url: `${BASE}/app/leads` });
  await waitFor(b, `!!window.__softphone`, 30000);
  check('The app loads with the Telnyx softphone', await b.evaluate(`!!window.__softphone`));
  const online = await waitFor(b, `!!document.querySelector('[aria-label*="Softphone"], [title*="onnected"]') || true`, 2000);
  void online;

  // a real call from the app to the teammate
  await b.evaluate(`window.__answered = null; window.__softphone.actions.testCall('', { toUserId: ${JSON.stringify(B)}, name: 'Teammate', company: 'Decibel' }).then((a) => (window.__answered = a)); true`);
  const ringing = await waitFor(b, `['connecting','ringing','in_call'].includes(window.__softphone.state().phase)`, 15000);
  check('The call panel opens and connects', ringing, await b.evaluate(`window.__softphone.state().phase`));
  const inCall = await waitFor(b, `window.__softphone.state().phase === 'in_call'`, 40000);
  check('The teammate answers and the app shows the call as live', inCall, await b.evaluate(`window.__softphone.state().phase`));
  await b.shot('telnyx-1-in-call');
  const callId = await b.evaluate(`window.__softphone.state().callId`);
  await sleep(5000);
  await b.evaluate(`window.__softphone.actions.hangUp(); true`);
  const ended = await waitFor(b, `window.__softphone.state().phase === 'ended' || window.__softphone.state().phase === 'idle'`, 15000);
  check('Hanging up from the app ends the call', ended, await b.evaluate(`window.__softphone.state().phase`));
  const row = await (async () => {
    for (let i = 0; i < 30; i++) {
      const { data } = await admin.from('calls').select('status,duration_seconds,provider_call_id,provider_child_call_id,user_id').eq('id', callId).maybeSingle();
      if (data && ['completed', 'canceled', 'failed'].includes(data.status)) return data;
      await sleep(500);
    }
    return null;
  })();
  check('The call is logged as completed with its duration', row?.status === 'completed' && row.duration_seconds >= 3 && row.user_id === u.uid, `${row?.status} ${row?.duration_seconds}s`);
  check('The test call resolves as answered', (await b.evaluate(`window.__answered`)) === true);
  await b.shot('telnyx-2-ended');

  // phone numbers: live search, choose → business details form (nothing is ordered)
  await b.evaluate(`window.__softphone.actions.dismiss(); true`);
  await b.send('Page.navigate', { url: `${BASE}/app/settings/phone-numbers` });
  await waitFor(b, `[...document.querySelectorAll('button')].some((x) => x.innerText.trim() === 'Get a number')`, 20000);
  await b.evaluate(`[...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Get a number').click(); true`);
  await waitFor(b, `[...document.querySelectorAll('button')].some((x) => x.innerText.includes('Search available numbers'))`, 10000);
  await b.evaluate(`[...document.querySelectorAll('button')].find((x) => x.innerText.includes('Search available numbers')).click(); true`);
  const found = await waitFor(b, `[...document.querySelectorAll('button')].filter((x) => x.innerText.trim() === 'Choose').length > 0`, 20000);
  const first = await b.evaluate(`document.querySelector('li .t-mono')?.innerText ?? ''`);
  check('Searching London numbers lists live Telnyx numbers with their monthly price', found && /^020/.test(first.replace(/\s/g, '').replace(/^\+44/, '0')) && (await b.evaluate(`document.body.innerText.includes('/month')`)), first);
  await b.shot('telnyx-3-search');
  await b.evaluate(`[...document.querySelectorAll('button')].find((x) => x.innerText.trim() === 'Choose').click(); true`);
  const form = await waitFor(b, `document.body.innerText.includes('Business details for') && !!document.querySelector('#b-identity') && !!document.querySelector('#b-proof')`, 15000);
  check('Choosing a number asks for business details and both documents (nothing ordered)', form);
  const { count: orders } = await admin.from('phone_numbers').select('id', { count: 'exact', head: true }).eq('workspace_id', u.ws);
  check('No number was ordered', (orders ?? 0) === 0);
  await b.shot('telnyx-4-details');
}

try {
  await main();
} catch (e) {
  check('UI run completed', false, e.message);
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

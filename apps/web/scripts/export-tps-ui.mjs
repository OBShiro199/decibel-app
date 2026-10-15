#!/usr/bin/env node
// Browser test for the TPS/CTPS check before a Leads export. Signs a throwaway user in, selects three
// leads with mobiles on /app/leads, exports them, and checks that the TPS/CTPS dialog runs a real check
// (Provero, a few check credits from the throwaway workspace), shows the result, and only then offers
// Export all / Passed only / Failed only, with a tps_ctps column in the file.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/export-tps-ui.mjs http://localhost:3005
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
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Export Probe' } });
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
  const { data: ws, error: wsErr } = await ssr.rpc('create_workspace', { p_name: 'Export Probe', p_slug: `ui-${randomBytes(3).toString('hex')}` });
  if (wsErr) throw new Error(`create_workspace: ${wsErr.message}`);
  cleanup.unshift(() => admin.from('workspaces').delete().eq('id', ws.id));
  await admin.from('workspaces').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', ws.id);
  return { jar, ws: ws.id, uid: created.user.id, db: ssr };
}

async function browser(port, downloads) {
  const profile = mkdtempSync(join(tmpdir(), 'export-ui-'));
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

async function waitFor(b, expr, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await b.evaluate(expr).catch(() => false)) return true;
    await sleep(200);
  }
  return false;
}

async function upload(b, path) {
  const { root } = await b.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await b.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  await b.send('DOM.setFileInputFiles', { nodeId, files: [path] });
}

async function newDownload(dir, before, ext, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    const f = readdirSync(dir).find((x) => !before.includes(x) && x.endsWith(ext));
    if (f) {
      await sleep(300);
      return join(dir, f);
    }
    await sleep(200);
  }
  return null;
}

const HELPERS = `
window.__t = {
  text: () => document.querySelector('main')?.innerText ?? document.body.innerText,
  click: (text, root = document) => { const el = [...root.querySelectorAll('button, [role=menuitem], [role=radio], a')].find((b) => !b.disabled && (b.innerText.trim() === text || b.innerText.trim().startsWith(text))); if (!el) return false; el.click(); return true; },
  rows: () => [...document.querySelectorAll('[data-testid=dnc-table] tbody tr')].map((tr) => [...tr.children].map((td) => td.innerText.trim())),
  card: () => document.querySelector('[aria-label="Add numbers"]')?.innerText.replace(/\\s+/g, ' ') ?? '',
  total: () => document.querySelector('[data-testid=dnc-total]')?.innerText.replace(/\\s+/g, ' ').trim() ?? '',
  type: (el, value) => { const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value); el.dispatchEvent(new Event('input', { bubbles: true })); },
};
`;

async function goto(b, path, ready) {
  await b.send('Page.navigate', { url: `${BASE}${path}` });
  await waitFor(b, `document.readyState === 'complete'`);
  await b.evaluate(HELPERS);
  if (ready) await waitFor(b, ready, 30000);
}


async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'export-tps-'));
  const u = await testUser();
  const b = await browser(9371, dir);
  cleanup.unshift(() => b.close());
  const host = new URL(BASE).hostname;
  await b.send('Network.enable');
  await b.send('Network.setBlockedURLs', { urls: ['*functions/v1/twilio-token*'] });
  for (const c of u.jar) await b.send('Network.setCookie', { name: c.name, value: c.value, domain: host, path: '/' });

  await goto(b, '/app/leads', `document.querySelectorAll('tbody tr').length >= 10`);
  // three leads (the default view shows leads with a mobile); UK companies first, so the check reaches the registers
  const picked = await b.evaluate(`(() => {
    const rows = [...document.querySelectorAll('tbody tr')];
    const uk = rows.filter((tr) => /\\.co\\.uk|\\.uk\\b/.test(tr.innerText));
    const pick = [...uk, ...rows.filter((tr) => !uk.includes(tr))].slice(0, 3);
    pick.forEach((tr) => tr.querySelector('button[role=checkbox]')?.click());
    return pick.length;
  })()`);
  check('three leads selected', picked === 3, `${picked}`);
  await sleep(400);
  const clicked = await b.evaluate(`window.__t.click('Export CSV')`);
  check('Export CSV clicked in the selection bar', clicked);
  await waitFor(b, `window.__t.click('Reveal and export')`, 8000);
  const opened = await waitFor(b, `document.body.innerText.includes('Checking TPS/CTPS')`, 20000);
  check('TPS/CTPS check dialog opens before any download', opened);
  await b.shot('export-tps-checking');
  check('no file downloaded while checking', readdirSync(dir).length === 0);
  const done = await waitFor(b, `document.body.innerText.includes('TPS/CTPS check done')`, 120000);
  check('check finishes', done);
  await b.shot('export-tps-done');
  const summary = await b.evaluate(`document.querySelector('[role=dialog]')?.innerText ?? ''`);
  console.log(summary.replace(/\n+/g, ' | '));
  const before = readdirSync(dir);
  await b.evaluate(`window.__t.click('Export all')`);
  const f = await newDownload(dir, before, '.csv');
  const csv = f ? parseCsv(readFileSync(f, 'utf8')) : [];
  check('Export all downloads a file with a tps_ctps column', !!f && csv[0]?.includes('tps_ctps'), f ? `${csv.length - 1} rows` : 'no file');
  if (f) console.log('tps_ctps values:', csv.slice(1).map((r) => r[csv[0].indexOf('tps_ctps')]).join(', '));
}

main()
  .catch((e) => check('run', false, e.message))
  .finally(async () => {
    for (const fn of cleanup) await Promise.resolve(fn()).catch(() => {});
    const failed = results.filter((r) => !r.pass).length;
    console.log(`\n${results.length - failed}/${results.length} passed`);
    process.exit(failed ? 1 : 0);
  });

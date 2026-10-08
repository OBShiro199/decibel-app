#!/usr/bin/env node
// Browser test for Search with AI. Signs a throwaway user in (cookie set directly), then drives
// /app/ai in headless Chrome: mode pills, examples, the real function (expects "not switched on"
// until ANTHROPIC_API_KEY is set, unless LIVE=1), and, with the AI answer intercepted, the
// loading view, the mode-mismatch prompt, results with editable chips, and Edit prompt.
// With LIVE=1 it uses the real AI end to end instead of intercepting.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/ai-ui.mjs http://localhost:3005
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
  const profile = mkdtempSync(join(tmpdir(), 'search-ui-'));
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

// page helpers (run in the browser)
const HELPERS = `
window.__t = {
  rows: () => [...document.querySelectorAll('main tbody tr')],
  cells: (col) => [...document.querySelectorAll('main tbody tr')].map((tr) => tr.children[col]?.innerText.trim() ?? ''),
  click: (text, root = document) => { const el = [...root.querySelectorAll('button, [role=menuitem], a')].find((b) => b.innerText.trim() === text || b.innerText.trim().startsWith(text)); if (!el) return false; el.click(); return true; },
  clickIn: (sel, text) => { const el = [...document.querySelectorAll(sel)].find((b) => b.innerText.trim().startsWith(text)); if (!el) return false; el.click(); return true; },
  type: (sel, value) => { const i = document.querySelector(sel); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, value); i.dispatchEvent(new Event('input', { bubbles: true })); return true; },
  enter: (sel) => { const i = document.querySelector(sel); i?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return !!i; },
  chips: () => [...document.querySelectorAll('[aria-label=Filters] .tag')].map((t) => t.innerText.trim()),
  count: () => document.querySelector('main h1')?.innerText ?? '',
  settled: () => !document.querySelector('main .skeleton') && !document.querySelector('main .opacity-60'),
};
`;

async function waitFor(b, expr, ms = 20000) {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await b.evaluate(expr).catch(() => false)) return true;
    await sleep(250);
  }
  return false;
}
const settle = (b) => waitFor(b, 'window.__t && __t.settled() && __t.rows().length > 0', 25000).then(() => sleep(400));

async function pickFilter(b, label, option) {
  await b.evaluate(`__t.click('Add filter')`);
  await sleep(300);
  await b.evaluate(`__t.type('input[aria-label="Find a filter"]', ${JSON.stringify(label)})`);
  await sleep(200);
  const ok = await b.evaluate(`__t.click(${JSON.stringify(label)})`);
  await sleep(500);
  if (option) {
    await b.evaluate(`(() => { const s = document.querySelector('input[aria-label="Search ${label}"]'); if (s) __t.type('input[aria-label="Search ${label}"]', ${JSON.stringify(option)}); return true; })()`);
    await sleep(300);
    await b.evaluate(`(() => { const row = [...document.querySelectorAll('div')].find((d) => d.children.length >= 1 && d.innerText.trim().split('\\n')[0] === ${JSON.stringify(option)} && d.querySelector('button[role=checkbox], button')); row?.querySelector('button')?.click(); return !!row; })()`);
  }
  await b.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);
  return ok;
}


async function main() {
  const LIVE = process.env.LIVE === '1';
  const u = await testUser();
  const downloads = mkdtempSync(join(tmpdir(), 'ai-dl-'));
  const b = await browser(9343, downloads);
  cleanup.unshift(() => b.close());
  const host = new URL(BASE).hostname;
  await b.send('Network.enable');
  for (const c of u.jar) await b.send('Network.setCookie', { name: c.name, value: c.value, domain: host, path: '/' });

  // intercept the AI call with a queued answer (unless LIVE)
  const answers = [];
  if (!LIVE) {
    await b.send('Fetch.enable', { patterns: [{ urlPattern: '*functions/v1/ai-search*', requestStage: 'Request' }] });
    b.onEvent('Fetch.requestPaused', async (p) => {
      if (p.request.method === 'OPTIONS') {
        return b.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 204, responseHeaders: [{ name: 'access-control-allow-origin', value: '*' }, { name: 'access-control-allow-headers', value: 'authorization, x-client-info, apikey, content-type' }, { name: 'access-control-allow-methods', value: 'POST, OPTIONS' }] });
      }
      const next = answers.shift();
      if (!next) return b.send('Fetch.continueRequest', { requestId: p.requestId });
      await sleep(next.delay ?? 1500);
      await b.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: next.status ?? 200, responseHeaders: [{ name: 'content-type', value: 'application/json' }, { name: 'access-control-allow-origin', value: '*' }], body: Buffer.from(JSON.stringify(next.body)).toString('base64') });
    });
  }

  await b.send('Page.navigate', { url: `${BASE}/app/ai` });
  await waitFor(b, `document.readyState === 'complete'`);
  await b.evaluate(HELPERS);
  await waitFor(b, `!!document.querySelector('textarea[aria-label="Describe who you want to find"]')`, 20000);
  await sleep(800);
  const disabled = await b.evaluate(`document.querySelector('textarea[aria-label="Describe who you want to find"]').disabled`);
  check('Prompt box waits until a search type is chosen', disabled === true);
  await b.shot('ai-1-start');

  await b.evaluate(`[...document.querySelectorAll('[role=radio]')].find((x) => x.innerText.includes('B2B decision-makers')).click()`);
  await sleep(400);
  const examples = await b.evaluate(`[...document.querySelectorAll('button')].filter((x) => x.innerText.startsWith('CEOs of software')).length`);
  check('Choosing B2B shows its example prompts', examples === 1);
  await b.evaluate(`[...document.querySelectorAll('button')].find((x) => x.innerText.startsWith('CEOs of software')).click()`);
  await sleep(300);
  const filled = await b.evaluate(`document.querySelector('textarea[aria-label="Describe who you want to find"]').value`);
  check('An example card fills the prompt', filled.startsWith('CEOs of software'));
  await b.shot('ai-2-leads-mode');

  // real call: without a key the function answers "not switched on"
  if (!LIVE) {
    await b.send('Fetch.disable');
    await b.evaluate(`document.querySelector('button[aria-label="Build the list"]').click()`);
    await waitFor(b, `document.body.innerText.includes('not switched on') || document.body.innerText.includes('not set up')`, 30000);
    check('Without an API key the page explains that AI search is not switched on', await b.evaluate(`document.body.innerText.includes('not switched on')`));
    await b.send('Fetch.enable', { patterns: [{ urlPattern: '*functions/v1/ai-search*', requestStage: 'Request' }] });
  }

  // 1) a matching answer: loading view, then results with the AI's filters as chips
  answers.push({
    delay: 2500,
    body: {
      id: null, mode: 'leads', suggested_mode: 'leads', mode_reason: '', title: 'Software CEOs, 50–100 staff, with mobiles',
      summary: 'Chief executives at software companies with 50 to 100 employees who have a mobile.', notes: [],
      leads_filters: { titles: ['CEO', 'Chief Executive'], industries: ['Software Development'], employeesMin: 50, employeesMax: 100, hasMobile: true },
      local_filters: {},
    },
  });
  await b.evaluate(`document.querySelector('button[aria-label="Build the list"]').click()`);
  await sleep(1200);
  const modal = await b.evaluate(`document.querySelector('[role=dialog][aria-label="Building your search"]')?.innerText ?? ''`);
  check('A loading view shows the steps while the list is built', modal.includes('Reading your request') && modal.includes('Searching 690,000 decision-makers'), modal.split('\n').slice(0, 3).join(' / '));
  await b.shot('ai-3-loading');
  await waitFor(b, `!!document.querySelector('[aria-label=Filters]') && document.querySelectorAll('main tbody tr').length > 0`, 40000);
  await settle(b);
  const chips = await b.evaluate('__t.chips()');
  const titles = await b.evaluate('__t.cells(2)');
  const sizes = await b.evaluate('__t.cells(6)');
  check('Results open with the AI filters as editable chips', ['Job title', 'Industry', 'Exact employee count', 'Has mobile'].every((c) => chips.some((x) => x.startsWith(c))), chips.join(' | '));
  check('Every result matches the prompt (CEO title)', titles.length > 0 && titles.every((t) => /ceo|chief executive/i.test(t)), `${titles.length} rows`);
  check('The banner shows the list name and prompt', await b.evaluate(`document.body.innerText.includes('Software CEOs, 50–100 staff')`));
  check('The usual selection actions are there (dialler, lists, export)', await b.evaluate(`(() => { const box = document.querySelector('main tbody tr td:first-child button'); box?.click(); return true; })()`) && (await sleep(400), await b.evaluate(`[...document.querySelectorAll('button')].some((x) => x.innerText.includes('Start dialler with')) && [...document.querySelectorAll('button')].some((x) => x.innerText.includes('Export CSV'))`)));
  await b.shot('ai-4-results');

  // edit prompt returns to the composer with the text kept
  await b.evaluate(`__t.click('Edit prompt')`);
  await sleep(600);
  check('Edit prompt goes back with the prompt kept', (await b.evaluate(`document.querySelector('textarea[aria-label="Describe who you want to find"]')?.value ?? ''`)).startsWith('CEOs of software'));

  // 2) a mismatch: B2B chosen, but the prompt is about local trades
  await b.evaluate(`(() => { const i = document.querySelector('textarea[aria-label="Describe who you want to find"]'); i.focus(); i.select(); return true; })()`);
  await b.send('Input.insertText', { text: 'local companies doing plumbing in London' });
  answers.push({
    delay: 1200,
    body: {
      id: null, mode: 'leads', suggested_mode: 'local', mode_reason: 'Plumbing firms are local trades, so the local businesses database fits better.',
      title: 'Plumbers in London', summary: 'Plumbing businesses in London with a phone number.', notes: [],
      leads_filters: { industries: ['Construction'], cities: ['London'] },
      local_filters: { categories: ['plumber'], cities: ['London'], hasPhone: true },
    },
  });
  await b.evaluate(`document.querySelector('button[aria-label="Build the list"]').click()`);
  await waitFor(b, `document.body.innerText.includes('This sounds like a local businesses search')`, 20000);
  check('A mismatched prompt suggests the better search type', await b.evaluate(`document.body.innerText.includes('Plumbing firms are local trades')`));
  await b.shot('ai-5-mismatch');
  await b.evaluate(`[...document.querySelectorAll('[role=dialog] button')].find((x) => x.innerText.includes('Search local businesses')).click()`);
  await waitFor(b, `!!document.querySelector('[aria-label=Filters]') && document.querySelectorAll('main tbody tr').length > 0`, 40000);
  await settle(b);
  const lchips = await b.evaluate('__t.chips()');
  const cats = await b.evaluate(`[...document.querySelectorAll('main tbody tr')].map((tr) => tr.children[1]?.innerText ?? '')`);
  check('Switching runs the local search with the local filters', lchips.some((c) => c.startsWith('Category')) && lchips.some((c) => c.startsWith('Town')), lchips.join(' | '));
  check('Every local result is a plumbing business in London', cats.length > 0, `${cats.length} rows`);
  await b.shot('ai-6-local-results');
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

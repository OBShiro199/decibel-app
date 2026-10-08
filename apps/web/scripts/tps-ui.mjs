#!/usr/bin/env node
// Browser test for TPS/CTPS checks. Signs a throwaway user in (cookie set directly) and drives
// /app/tps in headless Chrome with real checks in batches of 5 numbers from the sample leads CSV:
// upload, column detection, the exact quote, the live check, results and filters, CSV and Excel
// downloads, free re-checks within 28 days, history, delete, running out of credits, and Top up
// opening the founder chat with the message sent (the support call is intercepted so no email).
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/tps-ui.mjs http://localhost:3005 [leads.csv]
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

const CSV = process.argv[3] ?? join(process.env.HOME, 'Downloads', 'decibel-leads-2026-10-08.csv');

const HELPERS = `
window.__t = {
  text: () => document.querySelector('main')?.innerText ?? '',
  click: (text, root = document) => { const el = [...root.querySelectorAll('button, [role=menuitem], [role=radio], a')].find((b) => b.innerText.trim() === text || b.innerText.trim().startsWith(text)); if (!el) return false; el.click(); return true; },
  results: () => [...document.querySelectorAll('[data-testid=tps-results] tbody tr')].map((tr) => [...tr.children].map((td) => td.innerText.trim())),
  history: () => [...document.querySelectorAll('[data-testid=tps-history] tbody tr')].map((tr) => tr.innerText.replace(/\\s+/g, ' ').trim()),
  credits: () => document.querySelector('[data-testid=tps-credits]')?.innerText ?? '',
};
`;

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

async function main() {
  const lines = readFileSync(CSV, 'utf8').trim().split('\n');
  const header = lines[0];
  const dir = mkdtempSync(join(tmpdir(), 'tps-files-'));
  const batch1 = join(dir, 'batch-1.csv');
  const batch2 = join(dir, 'batch-2.csv');
  const full = join(dir, 'all-leads.csv');
  writeFileSync(batch1, [header, ...lines.slice(1, 6)].join('\n'));
  writeFileSync(batch2, [header, ...lines.slice(6, 11)].join('\n'));
  writeFileSync(full, lines.join('\n'));
  writeFileSync(join(dir, 'old.xls'), 'not really excel');
  const mobiles = parseCsv(lines.slice(1, 6).join('\n')).map((r) => r[13]);
  const uk1 = mobiles.filter((m) => m.startsWith('+44')).length;

  const u = await testUser();
  const downloads = mkdtempSync(join(tmpdir(), 'tps-dl-'));
  const b = await browser(9353, downloads);
  cleanup.unshift(() => b.close());
  const host = new URL(BASE).hostname;
  await b.send('Network.enable');
  await b.send('DOM.enable');
  for (const c of u.jar) await b.send('Network.setCookie', { name: c.name, value: c.value, domain: host, path: '/' });

  // the founder chat: intercept sends so the test never emails anyone
  const sent = [];
  await b.send('Fetch.enable', { patterns: [{ urlPattern: '*functions/v1/support*', requestStage: 'Request' }] });
  b.onEvent('Fetch.requestPaused', async (p) => {
    const cors = [{ name: 'access-control-allow-origin', value: '*' }, { name: 'access-control-allow-headers', value: 'authorization, x-client-info, apikey, content-type' }, { name: 'access-control-allow-methods', value: 'POST, OPTIONS' }];
    if (p.request.method === 'OPTIONS') return b.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 204, responseHeaders: cors });
    const body = JSON.parse(p.request.postData ?? '{}');
    sent.push(body);
    const reply = { message: { id: `m-${sent.length}`, sender: 'user', body: body.body ?? '', created_at: new Date().toISOString() } };
    await b.send('Fetch.fulfillRequest', { requestId: p.requestId, responseCode: 200, responseHeaders: [...cors, { name: 'content-type', value: 'application/json' }], body: Buffer.from(JSON.stringify(reply)).toString('base64') });
  });

  await b.send('Page.navigate', { url: `${BASE}/app/tps` });
  await waitFor(b, `document.readyState === 'complete'`);
  await b.evaluate(HELPERS);
  await waitFor(b, `!!document.querySelector('input[type=file]')`, 25000);
  await waitFor(b, `__t.credits().includes('2,500')`, 10000);
  check('The page opens with 2,500 check credits', (await b.evaluate('__t.credits()')).includes('2,500 of 2,500'), await b.evaluate('__t.credits()'));
  check('TPS/CTPS checks is in the sidebar', await b.evaluate(`[...document.querySelectorAll('nav a, aside a')].some((a) => a.getAttribute('href') === '/app/tps' && a.innerText.includes('TPS/CTPS checks'))`));
  await b.shot('tps-1-empty');

  // a file type we can't read
  await upload(b, join(dir, 'old.xls'));
  await waitFor(b, `__t.text().includes('Save the file as .xlsx or .csv')`, 5000);
  check('An old .xls file gets a clear message', await b.evaluate(`__t.text().includes('Save the file as .xlsx or .csv')`));

  // ---- batch 1: 5 numbers -----------------------------------------------------
  await upload(b, batch1);
  await waitFor(b, `!!document.querySelector('button[aria-label="Phone number column"]')`, 10000);
  const picked = await b.evaluate(`document.querySelector('button[aria-label="Phone number column"]').innerText.trim()`);
  check('The phone column is found automatically', picked === 'mobile', picked);
  await waitFor(b, `__t.text().includes('UK numbers to check')`, 10000);
  const quoteText = await b.evaluate('__t.text()');
  check('The exact cost shows before anything is charged', quoteText.includes(`Check ${uk1} numbers`) && quoteText.includes('Not UK (skipped, free)'), `UK ${uk1}`);
  await b.shot('tps-2-prepare');

  const t0 = Date.now();
  await b.evaluate(`__t.click('Check ${uk1} numbers')`);
  await waitFor(b, `!!document.querySelector('[data-testid=tps-job]')`, 10000);
  check('Starting a check opens the live view', await b.evaluate(`!!document.querySelector('[data-testid=tps-job]')`));
  check('The URL keeps the check, so a refresh comes back to it', await b.evaluate(`location.search.startsWith('?job=')`));
  await waitFor(b, `document.querySelectorAll('[data-testid=tps-results] tbody tr').length === 5 || !!document.querySelector('[role=radiogroup][aria-label="Show rows"]')`, 10000);
  await b.shot('tps-3-live');
  const liveView = await b.evaluate(`({ bars: document.querySelectorAll('[data-testid=tps-job] [role=progressbar]').length, rows: document.querySelectorAll('[data-testid=tps-results] tbody tr').length, tiles: __t.text().includes('Invalid or blank') })`);
  check('While checking, the uploaded rows show in the table under a single progress bar', liveView.bars === 1 && liveView.rows === 5 && !liveView.tiles, JSON.stringify(liveView));
  await waitFor(b, `document.querySelectorAll('[data-testid=tps-results] tbody tr').length === 5 && !!document.querySelector('[role=radiogroup][aria-label="Show rows"]')`, 60000);
  check('The check finishes on its own and switches to the results', (await b.evaluate(`__t.results().length`)) === 5, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  check('Confetti when it finishes', (await b.evaluate(`window.__tpsConfetti ?? 0`)) >= 1);
  const res1 = await b.evaluate('__t.results()');
  check('Each row shows its status: UK numbers valid or DNC, others not UK', res1.every((r, i) => (mobiles[i].startsWith('+44') ? /^(Valid|DNC)/.test(r[2]) : r[2] === 'Not UK')), res1.map((r) => r[2]).join(', '));
  check('Row numbers match the spreadsheet', res1[0][0] === '2' && res1[4][0] === '6');
  await waitFor(b, `__t.credits().includes('${(2500 - uk1).toLocaleString('en-GB')} of')`, 8000);
  check('Credits drop by exactly the numbers checked', (await b.evaluate('__t.credits()')).includes(`${(2500 - uk1).toLocaleString('en-GB')} of 2,500`), await b.evaluate('__t.credits()'));
  await b.shot('tps-4-done');

  // filters
  await b.evaluate(`__t.click('Valid')`);
  await sleep(300);
  check('The Valid filter shows only callable rows', (await b.evaluate('__t.results()')).every((r) => r[2] === 'Valid'));
  await b.evaluate(`__t.click('All rows')`);
  await sleep(300);

  // exports: one menu, four formats
  const exportAs = async (label, ext) => {
    const before = readdirSync(downloads);
    await b.evaluate(`[...document.querySelectorAll('[data-testid=tps-job] button')].find((x) => x.innerText.trim().startsWith('Export')).click()`);
    await sleep(250);
    await b.evaluate(`__t.click(${JSON.stringify(label)})`);
    return newDownload(downloads, before, ext);
  };
  const csvPath = await exportAs('Export as CSV', '.csv');
  const csv = csvPath ? parseCsv(readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '')) : [];
  check('CSV export is the original file plus TPS columns', csv[0]?.slice(-4).join('|') === 'TPS status|TPS registered|CTPS registered|Checked on' && csv[0]?.[0] === 'first_name' && csv.length === 6, csvPath ?? 'no file');
  check('…with VALID / DNC / NOT UK values in the status column', csv.slice(1).every((r, i) => (mobiles[i].startsWith('+44') ? /^(VALID|DNC)/.test(r.at(-4)) : r.at(-4) === 'NOT UK (NOT CHECKED)')), csv.slice(1).map((r) => r.at(-4)).join(', '));
  const xlsxPath = await exportAs('Export as XLSX', '.xlsx');
  let sheet = [];
  if (xlsxPath) {
    const { readSheet } = await import('read-excel-file/node');
    sheet = await readSheet(xlsxPath);
  }
  check('XLSX export opens with the same rows and status column', sheet.length === 6 && sheet[0].includes('TPS status') && sheet[1][sheet[0].indexOf('TPS status')] === csv[1].at(-4), xlsxPath ?? 'no file');
  const mdPath = await exportAs('Export as Markdown', '.md');
  const md = mdPath ? readFileSync(mdPath, 'utf8').trim().split('\n') : [];
  check('Markdown export is a table with a header, divider and 5 rows', md.length === 7 && md[0].includes('| TPS status |') && md[1].startsWith('| --- |'), mdPath ?? 'no file');
  const jsonPath = await exportAs('Export as JSON', '.json');
  const json = jsonPath ? JSON.parse(readFileSync(jsonPath, 'utf8')) : [];
  check('JSON export has one object per row with the TPS status', json.length === 5 && json[0].first_name === csv[1][0] && json[0]['TPS status'] === csv[1].at(-4), jsonPath ?? 'no file');

  // ---- batch 2: 5 UK mobiles ----------------------------------------------------
  await b.evaluate(`__t.click('Check another file')`);
  await waitFor(b, `!!document.querySelector('input[type=file]')`, 5000);
  await upload(b, batch2);
  await waitFor(b, `__t.text().includes('Check 5 numbers')`, 10000);
  check('Batch 2 quotes 5 numbers', await b.evaluate(`__t.text().includes('Check 5 numbers')`));
  await b.evaluate(`__t.click('Check 5 numbers')`);
  await waitFor(b, `document.querySelectorAll('[data-testid=tps-results] tbody tr').length === 5 && !!document.querySelector('[role=radiogroup][aria-label="Show rows"]')`, 60000);
  check('Batch 2 checks all 5 mobiles', (await b.evaluate('__t.results()')).every((r) => /^(Valid|DNC)/.test(r[2])));
  check('History lists both checks, newest first', (await b.evaluate('__t.history()')).length === 2 && (await b.evaluate('__t.history()'))[0].startsWith('batch-2.csv'));

  // ---- the whole list again: everything was checked minutes ago, so it's free -----------
  await b.evaluate(`__t.click('Check another file')`);
  await waitFor(b, `!!document.querySelector('input[type=file]')`, 5000);
  await upload(b, full);
  await waitFor(b, `__t.text().includes('Get results (free)')`, 10000);
  check('Re-checking numbers from the last 28 days is free', await b.evaluate(`__t.text().includes('Checked in the last 28 days (free)') && __t.text().includes('Get results (free)')`));
  const creditsBefore = await b.evaluate('__t.credits()');
  await b.evaluate(`__t.click('Get results (free)')`);
  await waitFor(b, `document.querySelectorAll('[data-testid=tps-results] tbody tr').length === 10 && !!document.querySelector('[role=radiogroup][aria-label="Show rows"]')`, 20000);
  check('…and finishes instantly without using credits', (await b.evaluate('__t.results()')).length === 10 && (await b.evaluate('__t.credits()')) === creditsBefore);
  await b.shot('tps-5-history');

  // ---- top up opens the chat and sends the message -------------------------------------
  await b.evaluate(`__t.click('Top up')`);
  await waitFor(b, `!!document.querySelector('[aria-label="Support chat"]')`, 5000);
  await waitFor(b, `true`, 100);
  await sleep(1200);
  check('Top up opens the founder chat', await b.evaluate(`!!document.querySelector('[aria-label="Support chat"]')`));
  check('…and sends the top-up message automatically', sent.some((s) => s.action === 'send' && s.body === "Hi, I'd like to top-up my TPS/CTPS number check credits."), JSON.stringify(sent.map((s) => s.body)));
  await b.shot('tps-6-topup');
  await b.evaluate(`document.querySelector('[aria-label="Close chat"]')?.click()`);

  // ---- delete from history ------------------------------------------------------------------
  const histBefore = (await b.evaluate('__t.history()')).length;
  await b.evaluate(`document.querySelector('[data-testid=tps-history] tbody tr:last-child button[aria-label^="Actions"]').click()`);
  await sleep(300);
  await b.evaluate(`__t.click('Delete check and rows')`);
  await waitFor(b, `__t.history().length === ${histBefore - 1}`, 8000);
  check('A check can be deleted from history', (await b.evaluate('__t.history()')).length === histBefore - 1);

  // ---- running out ----------------------------------------------------------------------------
  const { data: ws } = await admin.from('workspaces').select('tps_credit_balance').eq('id', u.ws).single();
  await admin.rpc('tps_grant_credits', { p_workspace_id: u.ws, p_amount: -(ws.tps_credit_balance - 1), p_reference: `ui-drain-${randomBytes(4).toString('hex')}`, p_note: 'test' });
  const drama = join(dir, 'new-numbers.csv');
  writeFileSync(drama, ['name,phone', 'A,07700 900111', 'B,07700 900222', 'C,07700 900333'].join('\n'));
  await b.evaluate(`__t.click('Check another file')`);
  await waitFor(b, `!!document.querySelector('input[type=file]')`, 5000);
  await upload(b, drama);
  await waitFor(b, `__t.text().includes('Top up check credits')`, 10000);
  check('Without enough credits the check is blocked and Top up is offered', await b.evaluate(`__t.text().includes('You need 2 more credits') && !__t.text().includes('Check 3 numbers')`));
  await b.shot('tps-7-short');
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

#!/usr/bin/env node
// Browser test for the DNC list. Signs a throwaway user in (cookie set directly) and drives /app/dnc
// in headless Chrome: a 12,000-row CSV upload with column detection and a chunked progress bar, the
// result summary, recent uploads, search, paging, paste and single-number adds, removing one and a
// whole page, the settings link, and the warnings elsewhere: the DNC tag on Leads, Quick call and
// Add person refusing a listed number, and the softphone refusing to dial someone on the list.
// Needs a dev server or build with NEXT_PUBLIC_E2E=1 (exposes window.__softphone).
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/dnc-ui.mjs http://localhost:3005
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
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'DNC Probe' } });
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
  const { data: ws, error: wsErr } = await ssr.rpc('create_workspace', { p_name: 'DNC Probe', p_slug: `ui-${randomBytes(3).toString('hex')}` });
  if (wsErr) throw new Error(`create_workspace: ${wsErr.message}`);
  cleanup.unshift(() => admin.from('workspaces').delete().eq('id', ws.id));
  await admin.from('workspaces').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', ws.id);
  return { jar, ws: ws.id, uid: created.user.id, db: ssr };
}

async function browser(port, downloads) {
  const profile = mkdtempSync(join(tmpdir(), 'dnc-ui-'));
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
  const dir = mkdtempSync(join(tmpdir(), 'dnc-files-'));
  const big = join(dir, 'opt-outs.csv');
  const lines = ['Full name,Company,Phone number,Notes'];
  for (let i = 0; i < 12000; i++) lines.push(`Person ${i},Company ${i % 97},07400 ${String(i).padStart(6, '0')},opted out`);
  lines.push('Repeat One,Co,+44 7400 000001,dup', 'Repeat Two,Co,0044 7400 000002,dup');
  lines.push('Junk A,Co,n/a,', 'Junk B,Co,call me,', 'Junk C,Co,12,');
  lines.push('Blank A,Co,,', 'Blank B,Co,,');
  writeFileSync(big, lines.join('\n'));

  const u = await testUser();
  const b = await browser(9363, mkdtempSync(join(tmpdir(), 'dnc-dl-')));
  cleanup.unshift(() => b.close());
  const host = new URL(BASE).hostname;
  await b.send('Network.enable');
  // no Twilio sub-account for throwaway workspaces: the softphone's token request is blocked
  await b.send('Network.setBlockedURLs', { urls: ['*functions/v1/twilio-token*'] });
  await b.send('DOM.enable');
  for (const c of u.jar) await b.send('Network.setCookie', { name: c.name, value: c.value, domain: host, path: '/' });

  // someone already in People whose number gets listed later
  const { data: listedPerson } = await admin.from('people').insert({ workspace_id: u.ws, first_name: 'Already', last_name: 'Here', mobile_e164: '+447700900777', source: 'manual', created_by: u.uid, owner_id: u.uid }).select('id,full_name,mobile_e164').single();

  // ---- empty page ------------------------------------------------------------------------------------
  await goto(b, '/app/dnc', `!!document.querySelector('input[type=file]') && __t.total().startsWith('0')`);
  check('DNC list is in the sidebar', await b.evaluate(`[...document.querySelectorAll('nav a, aside a')].some((a) => a.getAttribute('href') === '/app/dnc' && a.innerText.includes('DNC list'))`));
  check('The page opens empty with a count of 0', (await b.evaluate('__t.total()')) === '0 numbers' && (await b.evaluate(`__t.text().includes('No numbers yet')`)), await b.evaluate('__t.total()'));
  await b.shot('dnc-1-empty');

  // ---- a 12,000-row upload -----------------------------------------------------------------------------
  await upload(b, big);
  await waitFor(b, `!!document.querySelector('button[aria-label="Phone number column"]')`, 15000);
  const cols = await b.evaluate(`({ phone: document.querySelector('button[aria-label="Phone number column"]').innerText.trim(), name: document.querySelector('button[aria-label="Name column"]').innerText.trim() })`);
  check('The phone and name columns are found automatically', cols.phone === 'Phone number' && cols.name === 'Full name', JSON.stringify(cols));
  check('The add button counts every non-blank row', await b.evaluate(`__t.text().includes('Add 12,005 numbers')`));
  await b.evaluate(`__t.type(document.querySelector('input[placeholder="Customer opt-out list"]'), 'Customer opt-outs')`);
  await b.shot('dnc-2-prepare');
  await b.evaluate(`__t.click('Add 12,005 numbers')`);
  const sawProgress = await waitFor(b, `!!document.querySelector('[role=progressbar][aria-label="Upload progress"]')`, 5000);
  if (sawProgress) await b.shot('dnc-3-progress');
  check('A progress bar shows while the upload is added in chunks', sawProgress);
  await waitFor(b, `__t.card().includes('numbers added')`, 90000);
  const summary = await b.evaluate(`__t.card()`);
  check('The summary counts added, already listed and invalid rows', summary.includes('12,000 numbers added') && summary.includes('2 already on the list') && summary.includes('3 not phone numbers'), summary.match(/[\d,]+ numbers? added[^\n]*/)?.[0]);
  await waitFor(b, `__t.total() === '12,000 numbers'`, 10000);
  check('The total updates to 12,000', (await b.evaluate('__t.total()')) === '12,000 numbers', await b.evaluate('__t.total()'));
  await waitFor(b, `__t.rows().length === 50`, 10000);
  const first = await b.evaluate('__t.rows()[0]');
  check('The list shows the number, name, source and reason', first.some((c) => c.startsWith('+44 7400') || c.startsWith('07400')) && first.some((c) => c.startsWith('Person')) && first.includes('Upload'), JSON.stringify(first));
  check('Pages of 50 with a count', await b.evaluate(`__t.text().includes('1–50 of 12,000')`));
  await b.shot('dnc-4-list');

  const { count } = await admin.from('dnc_entries').select('id', { count: 'exact', head: true }).eq('workspace_id', u.ws).eq('source', 'import').not('label', 'is', null);
  check('Every number is stored with its name and the upload source', count === 12000, `${count}`);

  // recent uploads
  await b.evaluate(`document.querySelector('[aria-label="Recent uploads"] > button').click()`);
  await waitFor(b, `!!document.querySelector('[data-testid=dnc-uploads] tbody tr')`, 5000);
  const up = await b.evaluate(`document.querySelector('[data-testid=dnc-uploads] tbody tr').innerText.replace(/\\s+/g, ' ')`);
  check('Recent uploads shows the file, its reason and the result', up.includes('opt-outs.csv') && up.includes('Customer opt-outs') && up.includes('12,000 added') && up.includes('2 already listed') && up.includes('3 invalid'), up);

  // search by national number and by name
  await b.evaluate(`__t.type(document.querySelector('input[aria-label="Search the DNC list"]'), '07400 000123')`);
  await waitFor(b, `__t.rows().length === 1`, 8000);
  check('Searching 07… finds the +44 number', (await b.evaluate('__t.rows().length')) === 1 && (await b.evaluate(`__t.rows()[0].join(' ').includes('Person 123')`)));
  await b.evaluate(`__t.type(document.querySelector('input[aria-label="Search the DNC list"]'), 'Person 11999')`);
  await waitFor(b, `__t.rows().length === 1 && __t.rows()[0].join(' ').includes('Person 11999')`, 8000);
  check('Searching a name finds it', await b.evaluate(`__t.rows().length === 1 && __t.rows()[0].join(' ').includes('Person 11999')`));
  await b.evaluate(`__t.type(document.querySelector('input[aria-label="Search the DNC list"]'), '')`);
  await waitFor(b, `__t.rows().length === 50`, 8000);

  // ---- paste --------------------------------------------------------------------------------------------
  await b.evaluate(`__t.click('Add more')`);
  await b.evaluate(`__t.click('Paste numbers')`);
  await waitFor(b, `!!document.querySelector('textarea[aria-label="Numbers to add"]')`, 5000);
  await b.evaluate(`__t.type(document.querySelector('textarea[aria-label="Numbers to add"]'), '07700 900777\\n07400 000005, hello; +44 20 7946 0555')`);
  check('Pasted text is split into numbers, ignoring words', await b.evaluate(`__t.text().includes('Add 3 numbers')`));
  await b.evaluate(`__t.click('Add 3 numbers')`);
  await waitFor(b, `/number(s)? added/.test(__t.card())`, 15000);
  const pasteText = await b.evaluate(`__t.card()`);
  check('Pasting counts what was already listed', pasteText.includes('2 numbers added') && pasteText.includes('1 already on the list'), pasteText.slice(0, 200));
  const { data: flagged } = await admin.from('people').select('do_not_call').eq('id', listedPerson.id).single();
  check('Someone already in People is marked do not call when their number is listed', flagged?.do_not_call === true);

  // ---- one number ---------------------------------------------------------------------------------------
  await b.evaluate(`__t.click('Add more')`);
  await b.evaluate(`__t.click('Add one number')`);
  await waitFor(b, `!!document.querySelector('#dnc-one')`, 5000);
  await b.evaluate(`__t.type(document.querySelector('#dnc-one'), '07700 900888')`);
  await b.evaluate(`__t.type(document.querySelector('input[placeholder="Asked not to be called"]'), 'Asked on the phone')`);
  await waitFor(b, `[...document.querySelectorAll('button')].some((x) => x.innerText.includes('Add to DNC list') && !x.disabled)`, 3000);
  await b.evaluate(`__t.click('Add to DNC list')`);
  await waitFor(b, `__t.card().includes('1 number added')`, 10000);
  await waitFor(b, `__t.total() === '12,003 numbers'`, 10000);
  check('Adding one number works and the total follows', (await b.evaluate('__t.total()')) === '12,003 numbers', await b.evaluate('__t.total()'));
  await waitFor(b, `(__t.rows()[0] ?? []).includes('Added')`, 8000);
  check('The newest number is at the top marked Added, with its reason', await b.evaluate(`__t.rows()[0].includes('Added') && __t.rows()[0].includes('Asked on the phone')`), JSON.stringify(await b.evaluate('__t.rows()[0]')));
  await b.shot('dnc-5-added');

  // ---- remove one, then a whole page ----------------------------------------------------------------------
  await b.evaluate(`document.querySelector('[data-testid=dnc-table] tbody tr button[aria-label^="Remove"]').click()`);
  await waitFor(b, `__t.total() === '12,002 numbers'`, 10000);
  check('Removing a number takes it off the list', (await b.evaluate('__t.total()')) === '12,002 numbers', await b.evaluate('__t.total()'));
  await b.evaluate(`document.querySelector('[data-testid=dnc-table] thead input[type=checkbox], [data-testid=dnc-table] thead [role=checkbox]').click()`);
  await waitFor(b, `__t.text().includes('Remove 50')`, 5000);
  await b.shot('dnc-6-selected');
  await b.evaluate(`__t.click('Remove 50')`);
  await waitFor(b, `__t.total() === '11,952 numbers'`, 15000);
  check('Selecting a page and removing takes off all 50', (await b.evaluate('__t.total()')) === '11,952 numbers', await b.evaluate('__t.total()'));

  // ---- settings links here ----------------------------------------------------------------------------------
  await goto(b, '/app/settings/compliance', `document.body.innerText.includes('Open DNC list')`);
  check('Compliance settings shows the count and links to the DNC list', await b.evaluate(`document.body.innerText.includes('11,952 numbers on the list') && [...document.querySelectorAll('a')].some((a) => a.getAttribute('href') === '/app/dnc')`));

  // ---- warnings elsewhere ---------------------------------------------------------------------------------------
  // Leads: list the first lead's mobile, its row gets a DNC tag
  const { data: leadPage } = await u.db.rpc('search_leads', { p_workspace_id: u.ws, p_filters: { hasMobile: true }, p_limit: 20, p_offset: 0 });
  const lead = leadPage?.[0];
  const { data: raw } = await admin.from('data_list').select('mobile_phone').eq('contact_id', lead?.lead_id).limit(1).single();
  await u.db.rpc('dnc_add', { p_workspace_id: u.ws, p_numbers: [raw.mobile_phone] });
  await goto(b, '/app/leads', `document.querySelectorAll('table tbody tr').length > 3`);
  await waitFor(b, `[...document.querySelectorAll('table tbody .tag')].some((t) => t.innerText.trim() === 'DNC')`, 15000);
  check('Leads shows a DNC tag on a lead whose mobile is listed', await b.evaluate(`[...document.querySelectorAll('table tbody .tag')].filter((t) => t.innerText.trim() === 'DNC').length === 1`));
  await b.shot('dnc-7-leads');

  // Quick call: a listed number can't become a person, so it can't be called
  await waitFor(b, `!!window.__softphone`, 20000);
  await b.evaluate(`document.querySelector('button[aria-label="Toggle softphone"]').click()`);
  await waitFor(b, `!!document.querySelector('input[aria-label="Name or number"]')`, 5000);
  await b.evaluate(`__t.type(document.querySelector('input[aria-label="Name or number"]'), '07400 000010')`);
  await waitFor(b, `[...document.querySelectorAll('button[type=submit]')].some((x) => x.innerText.includes('Call') && !x.disabled)`, 3000);
  await b.evaluate(`[...document.querySelectorAll('button[type=submit]')].find((x) => x.innerText.includes('Call')).click()`);
  await waitFor(b, `[...document.querySelectorAll('[role=alert]')].some((x) => x.innerText.includes('DNC list'))`, 10000);
  const qd = await b.evaluate(`[...document.querySelectorAll('[role=alert]')].map((x) => x.innerText).join(' | ')`);
  check('Quick call warns that the number is on the DNC list', qd.includes('+447400000010 is on your DNC list'), qd);
  await b.shot('dnc-8-quick-call');
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });

  // the softphone refuses to dial someone already in People whose number is listed (removing the page
  // above took them off and un-flagged them, so list them again)
  const { data: unflagged } = await admin.from('people').select('do_not_call').eq('id', listedPerson.id).single();
  check('Removing a number un-flags the person again', unflagged?.do_not_call === false);
  await u.db.rpc('dnc_add', { p_workspace_id: u.ws, p_numbers: [listedPerson.mobile_e164] });
  await b.evaluate(`window.__softphone.actions.callPerson(${JSON.stringify(listedPerson)}).then((r) => (window.__dialled = r)); true`);
  await waitFor(b, `window.__softphone.state().phase === 'blocked'`, 15000);
  const sp = await b.evaluate(`({ phase: window.__softphone.state().phase, message: window.__softphone.state().message })`);
  check('Calling someone on the DNC list is blocked with a clear reason', sp.phase === 'blocked' && /On your DNC list/.test(sp.message ?? ''), JSON.stringify(sp));
  await sleep(400);
  await b.shot('dnc-9-blocked-call');
  const { count: callRows } = await admin.from('calls').select('id', { count: 'exact', head: true }).eq('workspace_id', u.ws).eq('status', 'in_progress');
  check('No call is started', !callRows, `${callRows}`);
  await b.evaluate(`window.__softphone.actions.finish?.(); window.__softphone.actions.close?.(); true`).catch(() => {});

  // Add person on a list refuses a listed number
  const { data: list } = await admin.from('lists').insert({ workspace_id: u.ws, name: 'DNC probe', owner_id: u.uid }).select('id').single();
  await goto(b, `/app/lists/${list.id}`, `[...document.querySelectorAll('button')].some((x) => x.innerText.trim() === 'Add person')`);
  await b.evaluate(`__t.click('Add person')`);
  await waitFor(b, `!!document.querySelector('#ap-mobile')`, 5000);
  await b.evaluate(`__t.type(document.querySelector('#ap-first'), 'Blocked'); __t.type(document.querySelector('#ap-mobile'), '07400 000020')`);
  await b.evaluate(`[...document.querySelectorAll('[role=dialog] button[type=submit]')].find((x) => x.innerText.includes('Add person')).click()`);
  await waitFor(b, `[...document.querySelectorAll('[role=alert]')].some((x) => x.innerText.includes('DNC list'))`, 10000);
  const ap = await b.evaluate(`[...document.querySelectorAll('[role=alert]')].map((x) => x.innerText).join(' | ')`);
  check('Add person warns that the number is on the DNC list', ap.includes('+447400000020 is on your DNC list'), ap);
  await b.shot('dnc-10-add-person');
  const { count: blockedPeople } = await admin.from('people').select('id', { count: 'exact', head: true }).eq('workspace_id', u.ws).in('mobile_e164', ['+447400000010', '+447400000020']);
  check('Nobody with a listed number was added', blockedPeople === 0, `${blockedPeople}`);
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

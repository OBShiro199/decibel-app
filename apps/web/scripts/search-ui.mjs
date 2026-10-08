#!/usr/bin/env node
// Browser test for Leads and Local businesses against the real tables. Signs a throwaway user in
// (session cookie set directly, nothing typed), then drives the real UI in headless Chrome:
// filters through the menus, checks every visible row honours them, reveals, exports (reading the
// downloaded CSV), saves and reloads a search. Screenshots go to SHOTS (default /tmp).
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/search-ui.mjs http://localhost:3005
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
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
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
  const u = await testUser();
  const downloads = mkdtempSync(join(tmpdir(), 'search-dl-'));
  const b = await browser(9341, downloads);
  cleanup.unshift(() => b.close());
  const host = new URL(BASE).hostname;
  await b.send('Network.enable');
  for (const c of u.jar) await b.send('Network.setCookie', { name: c.name, value: c.value, domain: host, path: '/' });

  // ---- Leads ---------------------------------------------------------------------
  await b.send('Page.navigate', { url: `${BASE}/app/leads` });
  await waitFor(b, `document.readyState === 'complete'`);
  await b.evaluate(HELPERS);
  const loaded = await settle(b).then(() => b.evaluate('__t.rows().length'));
  check('Leads loads the first 100 real leads', loaded === 100, `${loaded} rows`);
  check('Has mobile is on by default', (await b.evaluate('__t.chips()')).some((c) => c.startsWith('Has mobile')));
  check('every default row has a mobile', (await b.evaluate('__t.cells(9)')).every((t) => t.includes('Reveal') || t.includes('Revealed')));
  check('mobiles are masked', (await b.evaluate('__t.cells(9)')).every((t) => t.includes('•') || t.includes('Revealed')));
  await b.shot('ui-leads-default');

  await pickFilter(b, 'Seniority', 'Director');
  await settle(b);
  const sen = await b.evaluate('__t.cells(3)');
  check('Seniority filter: every row is Director', sen.length > 0 && sen.every((t) => t === 'Director'), `${sen.length} rows`);

  await pickFilter(b, 'Company size', '11–50 employees');
  await settle(b);
  const sizes = await b.evaluate('__t.cells(6)');
  const sen2 = await b.evaluate('__t.cells(3)');
  check('Size stacks with seniority', sizes.length > 0 && sizes.every((t) => t === '11–50') && sen2.every((t) => t === 'Director'), `${sizes.length} rows`);

  await b.evaluate(`__t.click('Add filter')`);
  await sleep(300);
  await b.evaluate(`__t.type('input[aria-label="Find a filter"]', 'Job title')`);
  await sleep(200);
  await b.evaluate(`__t.click('Job title')`);
  await sleep(400);
  await b.evaluate(`(() => { const i = [...document.querySelectorAll('input')].find((x) => (x.placeholder || '').startsWith('CEO')); if (!i) return false; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'director'); i.dispatchEvent(new Event('input', { bubbles: true })); i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); return true; })()`);
  await b.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await sleep(300);
  await settle(b);
  const titles = await b.evaluate('__t.cells(2)');
  check('Job title pill stacks too', titles.length > 0 && titles.every((t) => t.toLowerCase().includes('director')), `${titles.length} rows, chips: ${(await b.evaluate('__t.chips()')).join(' | ')}`);
  await b.shot('ui-leads-stacked');

  // clear and try the 7–15 headcount preset with Has mobile
  await b.evaluate(`__t.click('Clear all')`);
  await sleep(300);
  await b.evaluate(`__t.click('Add filter')`);
  await sleep(300);
  await b.evaluate(`__t.click('Has mobile')`);
  await sleep(300);
  await b.evaluate(`__t.click('Add filter')`);
  await sleep(300);
  await b.evaluate(`__t.type('input[aria-label="Find a filter"]', 'Exact employee')`);
  await sleep(200);
  await b.evaluate(`__t.click('Exact employee count')`);
  await sleep(300);
  await b.evaluate(`__t.click('7 to 15')`);
  await sleep(300);
  await b.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await settle(b);
  const chips = await b.evaluate('__t.chips()');
  const shownIds = await b.evaluate(`__t.rows().length`);
  check('Has mobile + 7–15 employees applies through the UI', chips.some((c) => c.includes('7–15')) && chips.some((c) => c.startsWith('Has mobile')) && shownIds > 0, chips.join(' | '));

  // reveal one
  const before = (await admin.from('workspaces').select('credit_balance').eq('id', u.ws).single()).data.credit_balance;
  await b.evaluate(`(() => { const btn = [...document.querySelectorAll('main tbody button')].find((x) => x.innerText.includes('Reveal · 1')); btn?.click(); return !!btn; })()`);
  await waitFor(b, `[...document.querySelectorAll('main tbody tr')].some((tr) => tr.innerText.includes('Revealed'))`, 15000);
  const after = (await admin.from('workspaces').select('credit_balance').eq('id', u.ws).single()).data.credit_balance;
  const revealedRow = await b.evaluate(`[...document.querySelectorAll('main tbody tr')].find((tr) => tr.innerText.includes('Revealed'))?.children[9].innerText ?? ''`);
  check('Reveal shows the real number and costs 1 credit', before - after === 1 && /\d{3}/.test(revealedRow) && !revealedRow.includes('•'), `${before} -> ${after}`);

  // export two selected (one already revealed): confirmation, then a CSV with real values
  await b.evaluate(`(() => { const boxes = [...document.querySelectorAll('main tbody tr td:first-child button')]; boxes[0]?.click(); boxes[1]?.click(); return boxes.length; })()`);
  await sleep(300);
  await b.evaluate(`__t.clickIn('button', 'Export CSV')`);
  await sleep(500);
  const dialog = await b.evaluate(`document.querySelector('[role=dialog]')?.innerText ?? ''`);
  check('Export asks before spending credits', /credit/.test(dialog), dialog.split('\n').slice(0, 2).join(' / '));
  await b.evaluate(`__t.clickIn('[role=dialog] button', 'Reveal and export')`);
  await waitFor(b, `true`, 100);
  let csv = '';
  for (let i = 0; i < 40 && !csv; i++) {
    await sleep(500);
    const f = readdirSync(downloads).find((x) => x.endsWith('.csv'));
    if (f) csv = readFileSync(join(downloads, f), 'utf8');
  }
  const lines = parseCsv(csv.replace(/^\uFEFF/, ''));
  const header = (lines[0] ?? []).join(',');
  check('CSV downloads with the selected leads, unmasked', lines.length === 3 && header.includes('mobile') && !csv.includes('•'), `${lines.length - 1} rows; columns: ${header.slice(0, 120)}`);

  // save the search: it becomes a list in Lists, and opening it restores the filters
  await b.evaluate(`__t.click('Save as list')`);
  await sleep(300);
  await b.evaluate(`__t.type('input[aria-label="List name"]', 'UI probe search')`);
  await b.evaluate(`__t.clickIn('[role=dialog] button', 'Save list')`);
  await sleep(900);
  await b.send('Page.navigate', { url: `${BASE}/app/lists` });
  await waitFor(b, `document.readyState === 'complete'`);
  await b.evaluate(HELPERS);
  const cardExpr = `[...document.querySelectorAll('article')].find((a) => a.innerText.includes('UI probe search'))`;
  await waitFor(b, `!!${cardExpr}`, 15000);
  const card = await b.evaluate(`${cardExpr}?.innerText ?? ''`);
  check('A saved search appears in Lists with its filters', card.includes('Leads search') && card.includes('7–15'), card.replace(/\n/g, ' | '));
  await b.evaluate(`[...${cardExpr}.querySelectorAll('button')].find((x) => x.innerText.includes('Open search')).click()`);
  await waitFor(b, `location.pathname === '/app/leads' && location.search.startsWith('?search=')`, 10000);
  await settle(b);
  const reloaded = await b.evaluate('__t.chips()');
  check('Opening it from Lists restores its filters on Leads', reloaded.some((c) => c.includes('7–15')) && reloaded.some((c) => c.startsWith('Has mobile')), reloaded.join(' | '));

  // start the dialler from two selected leads
  await b.evaluate(`__t.click('Clear all')`);
  await sleep(300);
  await b.evaluate(`__t.click('Add filter')`);
  await sleep(300);
  await b.evaluate(`__t.click('Has mobile')`);
  await settle(b);
  await b.evaluate(`(() => { const boxes = [...document.querySelectorAll('main tbody tr td:first-child button')]; boxes[2]?.click(); boxes[3]?.click(); return boxes.length; })()`);
  await sleep(300);
  const barLabel = await b.evaluate(`[...document.querySelectorAll('button')].find((x) => x.innerText.includes('Start dialler with'))?.innerText ?? ''`);
  check('Selection bar offers Start dialler with the count', barLabel.includes('Start dialler with 2 leads'), barLabel);
  await b.evaluate(`__t.clickIn('button', 'Start dialler with')`);
  await sleep(600);
  await b.evaluate(`__t.clickIn('[role=dialog] button', 'Reveal and open dialler')`);
  const onDialler = await waitFor(b, `location.pathname === '/app/dialler' && location.search.includes('new=1')`, 20000);
  await b.evaluate(HELPERS);
  await waitFor(b, `!!document.querySelector('#dialler-list-name') && document.querySelector('#dialler-list-name').value.startsWith('Dialler list (')`, 20000);
  await sleep(1500);
  const listName = await b.evaluate(`document.querySelector('#dialler-list-name')?.value ?? ''`);
  const leadCount = await b.evaluate(`document.querySelector('aside p')?.innerText ?? ''`);
  const ready = await b.evaluate(`[...document.querySelectorAll('button')].some((x) => x.innerText.includes('Start dialling'))`);
  check('Dialler opens on the new list, ready to start (not auto-started)', onDialler && listName.startsWith('Dialler list (') && leadCount.startsWith('2 leads') && ready, `${listName} · ${leadCount}`);
  await b.shot('ui-dialler-new-list');
  // type it like a person: focus, select all, real key input, Enter
  await b.evaluate(`(() => { const i = document.querySelector('#dialler-list-name'); i.focus(); i.select(); return true; })()`);
  await b.send('Input.insertText', { text: 'UI probe call list' });
  await sleep(200);
  await b.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await b.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await sleep(1500);
  const listId = new URL(await b.evaluate('location.href')).searchParams.get('list');
  const { data: renamed } = await admin.from('lists').select('name').eq('id', listId).single();
  const { count: listCount } = await admin.from('list_members').select('person_id', { count: 'exact', head: true }).eq('list_id', listId);
  check('The list can be renamed from the dialler and holds the leads', renamed?.name === 'UI probe call list' && listCount === 2, `${renamed?.name} · ${listCount} members`);

  // ---- Local businesses ------------------------------------------------------------
  await b.send('Page.navigate', { url: `${BASE}/app/local` });
  await waitFor(b, `document.readyState === 'complete'`);
  await b.evaluate(HELPERS);
  const lrows = await settle(b).then(() => b.evaluate('__t.rows().length'));
  check('Local businesses loads the first 100 real listings', lrows === 100, `${lrows} rows`);
  await b.shot('ui-local-default');
  await b.evaluate(`__t.click('Add filter')`);
  await sleep(300);
  await b.evaluate(`__t.click('Mobile number')`);
  await sleep(300);
  await settle(b);
  const phones = await b.evaluate('__t.cells(3)');
  check('Mobile number filter: every phone is a UK mobile', phones.length > 0 && phones.every((t) => t.startsWith('+44 7') && t.includes('Mobile')), `${phones.length} rows`);
  await b.evaluate(`__t.click('Add filter')`);
  await sleep(300);
  await b.evaluate(`__t.type('input[aria-label="Find a filter"]', 'Rating')`);
  await sleep(200);
  await b.evaluate(`__t.click('Rating')`);
  await sleep(400);
  await b.evaluate(`__t.click('4.5 and above')`);
  await sleep(300);
  await b.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await settle(b);
  const ratings = await b.evaluate('__t.cells(2)');
  check('Rating stacks with mobile', ratings.length > 0 && ratings.every((t) => Number.parseFloat(t) >= 4.5), `${ratings.length} rows`);
  await b.shot('ui-local-filtered');

  // start the dialler from two selected businesses
  await b.evaluate(`(() => { const boxes = [...document.querySelectorAll('main tbody tr td:first-child button')]; boxes[0]?.click(); boxes[1]?.click(); return boxes.length; })()`);
  await sleep(300);
  await b.evaluate(`(() => { window.__msgs = []; new MutationObserver(() => { document.body.innerText.split('\\n').filter((l) => /could not|none of/i.test(l)).forEach((l) => !window.__msgs.includes(l) && window.__msgs.push(l)); }).observe(document.body, { childList: true, subtree: true, characterData: true }); return true; })()`);
  await b.evaluate(`__t.clickIn('button', 'Start dialler with')`);
  const onDialler2 = await waitFor(b, `location.pathname === '/app/dialler' && location.search.includes('new=1')`, 20000);
  if (!onDialler2) console.log('  page said:', (await b.evaluate(`(window.__msgs ?? []).join(' | ')`)) || '(nothing)', '| bar:', await b.evaluate(`JSON.stringify([...document.querySelectorAll('button')].filter((x) => x.innerText.includes('Start dialler')).map((x) => ({ t: x.innerText, d: x.disabled })))`), '| selected rows:', await b.evaluate(`document.querySelectorAll('main tbody tr[data-selected=true]').length`));
  await waitFor(b, `(document.querySelector('aside p')?.innerText ?? '').startsWith('2 ')`, 20000);
  const lc2 = await b.evaluate(`document.querySelector('aside p')?.innerText ?? ''`);
  check('Local businesses can start the dialler too', onDialler2 && lc2.startsWith('2 leads'), lc2);
  await b.send('Page.navigate', { url: `${BASE}/app/local` });
  await waitFor(b, `document.readyState === 'complete'`);
  await b.evaluate(HELPERS);
  await settle(b);
  await b.evaluate(`__t.click('Add filter')`);
  await sleep(300);
  await b.evaluate(`__t.click('Mobile number')`);
  await sleep(300);
  await b.evaluate(`__t.click('Add filter')`);
  await sleep(300);
  await b.evaluate(`__t.type('input[aria-label="Find a filter"]', 'Rating')`);
  await sleep(200);
  await b.evaluate(`__t.click('Rating')`);
  await sleep(400);
  await b.evaluate(`__t.click('4.5 and above')`);
  await sleep(300);
  await b.evaluate(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await settle(b);

  // export the filtered list
  for (const f of readdirSync(downloads)) rmSync(join(downloads, f));
  await b.evaluate(`__t.clickIn('button', 'Export')`);
  await sleep(300);
  await b.evaluate(`__t.click('Export matching businesses')`);
  let lcsv = '';
  for (let i = 0; i < 40 && !lcsv; i++) {
    await sleep(500);
    const f = readdirSync(downloads).find((x) => x.endsWith('.csv'));
    if (f) lcsv = readFileSync(join(downloads, f), 'utf8');
  }
  const llines = parseCsv(lcsv.replace(/^\uFEFF/, ''));
  const lhead = llines[0] ?? [];
  const phoneCol = lhead.indexOf('phone');
  const ratingCol = lhead.indexOf('rating');
  const okRows = llines.slice(1).every((cols) => (cols[phoneCol] ?? '').includes('+44 7') && Number.parseFloat(cols[ratingCol] ?? '0') >= 4.5);
  check('Local CSV export contains only the filtered businesses', llines.length > 1 && okRows, `${llines.length - 1} rows`);
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

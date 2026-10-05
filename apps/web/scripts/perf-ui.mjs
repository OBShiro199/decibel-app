#!/usr/bin/env node
// Browser speed probe: signs a throwaway user in (cookie set directly, nothing typed),
// opens the app in headless Chrome and times what a person feels:
//   - first load: navigation start until the page shows real content
//   - each sidebar tab: click until real content, first visit and repeat visit
// "Real content" = the URL changed, <main> has text and no loading skeletons are left.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/perf-ui.mjs http://localhost:3001 [http://localhost:3000]
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error('Needs .env.local and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}
const targets = process.argv.slice(2).filter((a) => a.startsWith('http'));
if (!targets.length) targets.push('http://localhost:3001');
for (const t of targets) if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(t)) throw new Error('perf-ui only runs against a local server');
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const TABS = ['/app/leads', '/app/companies', '/app/lists', '/app/calls', '/app/dialler', '/app'];

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const cleanup = [];
const sleep = (n) => new Promise((r) => setTimeout(r, n));
const ms = (n) => (n == null ? '     –' : `${Math.round(n)}ms`.padStart(6));

async function testUser() {
  const email = `perf-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url') + '1';
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Perf Probe' } });
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
  const { data: session, error: signErr } = await ssr.auth.signInWithPassword({ email, password });
  if (signErr) throw new Error(`sign in: ${signErr.message}`);
  const { data: ws, error: wsErr } = await ssr.rpc('create_workspace', { p_name: 'Perf Probe', p_slug: `perf-${randomBytes(3).toString('hex')}` });
  if (wsErr) throw new Error(`create_workspace: ${wsErr.message}`);
  cleanup.unshift(() => admin.from('workspaces').delete().eq('id', ws.id));
  await admin.from('workspaces').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', ws.id);
  const uid = session.user.id;
  const companies = Array.from({ length: 40 }, (_, i) => ({ workspace_id: ws.id, name: `Probe Company ${i}`, created_by: uid }));
  await admin.from('tenant_companies').insert(companies);
  const people = Array.from({ length: 200 }, (_, i) => ({ workspace_id: ws.id, first_name: 'Probe', last_name: `Person ${i}`, job_title: 'Director', mobile_e164: `+4477009${String(10000 + i)}`, source: 'manual', created_by: uid, owner_id: uid, next_call_at: new Date().toISOString() }));
  const { data: inserted, error: pErr } = await admin.from('people').insert(people).select('id');
  if (pErr) throw new Error(`seed people: ${pErr.message}`);
  const { data: list } = await admin.from('lists').insert({ workspace_id: ws.id, name: 'Probe list', owner_id: uid, is_shared: true }).select('id').single();
  if (list) await admin.from('list_members').insert(inserted.slice(0, 100).map((p, i) => ({ workspace_id: ws.id, list_id: list.id, person_id: p.id, position: i, added_by: uid })));
  const calls = inserted.slice(0, 120).map((p, i) => ({ workspace_id: ws.id, user_id: uid, person_id: p.id, to_e164: '+447700900999', status: 'completed', outcome: i % 3 ? 'no_answer' : 'connected', started_at: new Date(Date.now() - i * 1800e3).toISOString() }));
  await admin.from('calls').insert(calls);
  return jar;
}

async function browser(port) {
  const profile = mkdtempSync(join(tmpdir(), 'perf-ui-'));
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
  return {
    send,
    evaluate,
    close: () => {
      ws.close();
      chrome.kill();
      // Chrome may still be writing as it exits; a leftover temp profile is harmless
      setTimeout(() => {
        try {
          rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
        } catch {}
      }, 500);
    },
  };
}

// Runs in the page: resolves when `path` shows settled content, with how long it took and
// how long a loading skeleton was on screen.
const SETTLE = `window.__settle = (path, t0) => new Promise((resolve) => {
  let skeletonMs = 0, last = performance.now(), urlAt = null;
  const tick = () => {
    const now = performance.now();
    const main = document.querySelector('main');
    const onPath = location.pathname === path;
    if (onPath && urlAt == null) urlAt = now - t0;
    const skeleton = !!main && !!main.querySelector('.skeleton');
    if (skeleton) skeletonMs += now - last;
    last = now;
    const ready = onPath && main && !skeleton && main.innerText.trim().length > 20;
    if (ready) return requestAnimationFrame(() => resolve({ total: performance.now() - t0, urlAt, skeletonMs }));
    if (now - t0 > 15000) return resolve({ total: null, urlAt, skeletonMs });
    requestAnimationFrame(tick);
  };
  tick();
});`;

async function run(base, jar, port) {
  const b = await browser(port);
  try {
    await b.send('Page.enable');
    await b.send('Network.enable');
    await b.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    for (const c of jar) await b.send('Network.setCookie', { name: c.name, value: c.value, url: base, path: '/' });
    await b.send('Page.addScriptToEvaluateOnNewDocument', { source: SETTLE });

    console.log(`\n${base}`);
    // first load, twice: cold (nothing cached) and warm (browser cache primed)
    for (const label of ['First load (cold cache)', 'First load (warm cache)']) {
      await b.send('Page.navigate', { url: base + '/app' });
      const r = await b.evaluate(`window.__settle('/app', 0)`);
      console.log(`  ${label.padEnd(34)} content after ${ms(r.total)}   skeleton shown for ${ms(r.skeletonMs)}`);
      await sleep(300);
    }
    for (const lap of ['first visit, straight after load', 'first visit, after 4s idle', 'repeat visit']) {
      if (lap === 'first visit, after 4s idle') {
        await b.send('Page.navigate', { url: base + '/app' });
        await b.evaluate(`window.__settle('/app', 0)`);
        await sleep(4000);
      }
      console.log(`  Tab clicks: ${lap}`);
      for (const path of TABS) {
        const r = await b.evaluate(`(() => { const a = document.querySelector('nav a[href="${path}"]'); if (!a) return { total: null }; const t0 = performance.now(); a.click(); return window.__settle('${path}', t0); })()`);
        console.log(`    ${path.padEnd(18)} content after ${ms(r.total)}   url changed at ${ms(r.urlAt)}   skeleton shown for ${ms(r.skeletonMs)}`);
        await sleep(250);
      }
    }
  } finally {
    b.close();
  }
}

let code = 0;
try {
  const jar = await testUser();
  let port = 9340;
  for (const base of targets) await run(base, jar, port++);
} catch (e) {
  console.error(`\nProbe failed: ${e.message}`);
  code = 1;
} finally {
  for (const fn of cleanup) {
    try {
      const r = await fn();
      if (r?.error) console.error(`cleanup: ${r.error.message}`);
    } catch (e) {
      console.error(`cleanup: ${e.message}`);
    }
  }
}
process.exit(code);

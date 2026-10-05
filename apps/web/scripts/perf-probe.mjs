#!/usr/bin/env node
// Speed probe. Creates a throwaway user and workspace (like the isolation suite), signs in
// programmatically, then times what a real signed-in visit does:
//   - the first document load of /app (middleware + layout + HTML)
//   - a client-side tab change (the RSC request the router makes)
//   - the Supabase queries each tab runs in the browser
// Everything it creates is deleted at the end.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/perf-probe.mjs http://localhost:3000 https://www.usedecibel.com
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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
  console.error('Needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (from .env.local) and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}
const targets = process.argv.slice(2);
if (!targets.length) targets.push('http://localhost:3000');

const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const cleanup = [];
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const ms = (n) => `${Math.round(n)}ms`.padStart(7);

async function timed(fn, runs = 3) {
  const out = [];
  let last;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    last = await fn();
    out.push(performance.now() - t);
  }
  return { first: out[0], median: median(out), last };
}

async function main() {
  const email = `perf-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url') + '1';
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: 'Perf Probe' } });
  if (error) throw new Error(`createUser: ${error.message}`);
  cleanup.push(() => admin.auth.admin.deleteUser(created.user.id));

  // sign in through @supabase/ssr so we end up with the exact cookies the app uses
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
  const cookie = jar.map((c) => `${c.name}=${c.value}`).join('; ');
  const userId = session.user.id;

  const { data: ws, error: wsErr } = await ssr.rpc('create_workspace', { p_name: 'Perf Probe', p_slug: `perf-${randomBytes(3).toString('hex')}` });
  if (wsErr) throw new Error(`create_workspace: ${wsErr.message}`);
  cleanup.unshift(() => admin.from('workspaces').delete().eq('id', ws.id));
  await admin.from('workspaces').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', ws.id);

  // a little data so the queries do real work
  const people = Array.from({ length: 120 }, (_, i) => ({ workspace_id: ws.id, first_name: 'Probe', last_name: `Person ${i}`, mobile_e164: `+4477009${String(10000 + i)}`, source: 'manual', created_by: userId, owner_id: userId }));
  const { data: inserted, error: pErr } = await admin.from('people').insert(people).select('id');
  if (pErr) throw new Error(`seed people: ${pErr.message}`);
  const calls = inserted.slice(0, 80).map((p, i) => ({ workspace_id: ws.id, user_id: userId, person_id: p.id, to_e164: '+447700900999', status: 'completed', outcome: i % 3 ? 'no_answer' : 'connected', started_at: new Date(Date.now() - i * 3600e3).toISOString() }));
  const { error: cErr } = await admin.from('calls').insert(calls);
  if (cErr) throw new Error(`seed calls: ${cErr.message}`);

  // ---- browser-side queries (same for every target: they go straight to Supabase) ----
  const today = new Date().toISOString().slice(0, 10);
  const weekAgo = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
  const queries = {
    'Today: queue (today_queue)': () => ssr.rpc('today_queue', { p_workspace_id: ws.id, p_limit: 50 }).select('*, company:tenant_companies(id,name,domain)'),
    'Today: stats (call_stats_daily)': () => ssr.from('call_stats_daily').select('user_id,day,dials,connects,meetings,talk_seconds').eq('workspace_id', ws.id).eq('day', today),
    'Leads: search page (contacts_public)': () => ssr.from('contacts_public').select('*', { count: 'estimated' }).eq('has_mobile', true).range(0, 24),
    'Companies': () => ssr.from('tenant_companies').select('*').eq('workspace_id', ws.id).limit(500),
    'Lists': () => ssr.from('lists').select('*, list_members(count)').eq('workspace_id', ws.id),
    'Calls: page of 50': () => ssr.from('calls').select('*, person:people(id,full_name,job_title,company:tenant_companies(id,name)), recording:recordings(id,call_id,storage_path,duration_seconds)', { count: 'estimated' }).eq('workspace_id', ws.id).order('started_at', { ascending: false }).range(0, 49),
    'Dashboard: week (call_stats_daily)': () => ssr.from('call_stats_daily').select('user_id,day,dials,connects,meetings,talk_seconds').eq('workspace_id', ws.id).gte('day', weekAgo).lte('day', today),
    'People: all (limit 1000)': () => ssr.from('people').select('*, company:tenant_companies(id,name,domain)').eq('workspace_id', ws.id).order('created_at', { ascending: false }).limit(1000),
    'Sidebar: phone numbers': () => ssr.from('phone_numbers').select('*').eq('workspace_id', ws.id),
  };
  console.log('\nSupabase queries the browser runs (direct to the database API)');
  for (const [name, fn] of Object.entries(queries)) {
    const r = await timed(async () => {
      const res = await fn();
      if (res.error) throw new Error(`${name}: ${res.error.message}`);
      return res;
    });
    console.log(`  ${name.padEnd(40)} first ${ms(r.first)}   typical ${ms(r.median)}   rows ${Array.isArray(r.last.data) ? r.last.data.length : 1}`);
  }

  // ---- per target: document load, tab change, middleware ----
  for (const base of targets) {
    console.log(`\n${base}`);
    const get = (path, headers = {}) => fetch(base + path, { headers: { cookie, ...headers }, redirect: 'manual' });
    const full = async (path, headers) => {
      const t = performance.now();
      const res = await get(path, headers);
      const ttfb = performance.now() - t;
      const body = await res.text();
      return { status: res.status, ttfb, total: performance.now() - t, bytes: body.length, location: res.headers.get('location') };
    };
    const show = async (label, path, headers) => {
      const runs = [];
      for (let i = 0; i < 4; i++) runs.push(await full(path, headers));
      const r0 = runs[0];
      console.log(`  ${label.padEnd(44)} ${r0.status}${r0.location ? ' -> ' + r0.location.replace(base, '') : ''}  first ${ms(r0.total)}   typical ${ms(median(runs.slice(1).map((r) => r.total)))}   wait for first byte ${ms(median(runs.slice(1).map((r) => r.ttfb)))}   ${(r0.bytes / 1024).toFixed(0)} kB`);
    };
    await show('First load: /app (full page)', '/app');
    await show('First load: /app/leads (full page)', '/app/leads');
    await show('Tab change: /app/leads (router request)', '/app/leads', { RSC: '1' });
    await show('Tab change: /app/calls (router request)', '/app/calls', { RSC: '1' });
    await show('Tab change: /app/dashboard (router request)', '/app/dashboard', { RSC: '1' });
    await show('Tab prefetch: /app/lists', '/app/lists', { RSC: '1', 'Next-Router-Prefetch': '1' });
    await show('Middleware only: /login while signed in', '/login');
    await show('Public page: /', '/');
  }
}

let code = 0;
try {
  await main();
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

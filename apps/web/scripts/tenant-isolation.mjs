#!/usr/bin/env node
// Tenant isolation test (PRD launch gate).
//
// Signs in as two users in two different workspaces and proves neither can read,
// change or act on the other's data: people, calls, recordings (rows and files),
// notes, tasks, lists, credits, audit log, and the RPCs that take a workspace id.
// Exits 1 if any check fails.
//
// Two modes:
//   1. Self-contained (recommended, CI-friendly). Set SUPABASE_SERVICE_ROLE_KEY.
//      The script creates two confirmed throwaway users, a workspace each, seed
//      data and a recording file, runs the checks, then deletes everything.
//   2. Existing users. Set TEST_A_EMAIL, TEST_A_PASSWORD, TEST_B_EMAIL,
//      TEST_B_PASSWORD. Each user needs their own workspace. Nothing is created
//      or deleted beyond one temporary person and call in user A's workspace.
//
// SUPABASE_URL and SUPABASE_ANON_KEY default to apps/web/.env.local.
// Run:  pnpm --filter @decibels/web test:isolation
import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
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
const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !ANON) {
  console.error('Set SUPABASE_URL and SUPABASE_ANON_KEY (or run from apps/web with .env.local).');
  process.exit(2);
}
const auto = !!SERVICE;
if (!auto && !(process.env.TEST_A_EMAIL && process.env.TEST_A_PASSWORD && process.env.TEST_B_EMAIL && process.env.TEST_B_PASSWORD)) {
  console.error('Set SUPABASE_SERVICE_ROLE_KEY (self-contained mode) or TEST_A_EMAIL/TEST_A_PASSWORD/TEST_B_EMAIL/TEST_B_PASSWORD.');
  process.exit(2);
}

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = auto ? createClient(URL, SERVICE, opts) : null;
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });

async function signIn(email, password) {
  const c = createClient(URL, ANON, opts);
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return { client: c, user: data.user };
}

async function workspaceOf(c, userId) {
  const { data, error } = await c.from('workspace_members').select('workspace_id').eq('user_id', userId).limit(1).maybeSingle();
  if (error || !data) throw new Error(`no workspace for ${userId}: ${error?.message ?? 'none'}`);
  return data.workspace_id;
}

const cleanup = [];

async function setupUser(tag) {
  const email = `isolation-${tag}-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url') + '1';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Isolation ${tag}` } });
  if (error) throw new Error(`createUser ${tag}: ${error.message}`);
  cleanup.push(async () => admin.auth.admin.deleteUser(data.user.id));
  const s = await signIn(email, password);
  const slug = `iso-${tag}-${randomBytes(3).toString('hex')}`;
  const { data: ws, error: wsErr } = await s.client.rpc('create_workspace', { p_name: `Isolation ${tag}`, p_slug: slug });
  if (wsErr) throw new Error(`create_workspace ${tag}: ${wsErr.message}`);
  cleanup.unshift(async () => admin.from('workspaces').delete().eq('id', ws.id));
  return { ...s, workspaceId: ws.id };
}

async function seed(a) {
  const { data: person, error: pErr } = await a.client
    .from('people')
    .insert({ workspace_id: a.workspaceId, first_name: 'Isolation', last_name: 'Probe', source: 'manual', created_by: a.user.id })
    .select('id')
    .single();
  if (pErr) throw new Error(`seed person: ${pErr.message}`);
  const callId = randomUUID();
  const { error: cErr } = await a.client.from('calls').insert({ id: callId, workspace_id: a.workspaceId, user_id: a.user.id, person_id: person.id, to_e164: '+447700900999', status: 'completed' });
  if (cErr) throw new Error(`seed call: ${cErr.message}`);
  await a.client.from('notes').insert({ workspace_id: a.workspaceId, person_id: person.id, author_id: a.user.id, body: 'isolation probe' });
  await a.client.from('lists').insert({ workspace_id: a.workspaceId, name: `Isolation ${randomBytes(2).toString('hex')}`, owner_id: a.user.id });
  let path = null;
  if (admin) {
    path = `${a.workspaceId}/${callId}.mp3`;
    await admin.storage.from('recordings').upload(path, new Blob([randomBytes(64)]), { contentType: 'audio/mpeg', upsert: true });
    await admin.from('recordings').insert({ workspace_id: a.workspaceId, call_id: callId, storage_path: path, duration_seconds: 1 });
  }
  if (!auto) {
    cleanup.push(async () => {
      await a.client.from('people').delete().eq('id', person.id);
      await a.client.from('calls').delete().eq('id', callId);
    });
  }
  return { personId: person.id, callId, path };
}

async function crossChecks(label, attacker, victim, seeded) {
  const c = attacker.client;
  const ws = victim.workspaceId;
  const empty = async (table, column = 'workspace_id', value = ws) => {
    const { data, error } = await c.from(table).select('*').eq(column, value);
    check(`${label}: cannot read ${table}${column === 'workspace_id' ? '' : ` by ${column}`}`, !error ? data.length === 0 : true, error ? `error: ${error.message}` : `${data.length} rows`);
  };
  await empty('workspaces', 'id');
  for (const t of ['people', 'calls', 'recordings', 'notes', 'tasks', 'lists', 'list_members', 'activities', 'credit_transactions', 'phone_numbers', 'dnc_entries', 'audit_log', 'invitations', 'pipeline_stages', 'tenant_companies']) await empty(t);
  if (seeded) {
    await empty('people', 'id', seeded.personId);
    await empty('calls', 'id', seeded.callId);

    const upd = await c.from('people').update({ first_name: 'Hacked' }).eq('id', seeded.personId).select('id');
    check(`${label}: cannot update the other workspace's person`, upd.error || (upd.data ?? []).length === 0, upd.error?.message ?? `${upd.data?.length} rows changed`);
    const del = await c.from('calls').delete().eq('id', seeded.callId).select('id');
    check(`${label}: cannot delete the other workspace's call`, del.error || (del.data ?? []).length === 0, del.error?.message ?? `${del.data?.length} rows deleted`);
    const outcome = await c.rpc('log_call_outcome', { p_call_id: seeded.callId, p_outcome: 'connected' });
    check(`${label}: cannot log an outcome on the other workspace's call`, !!outcome.error, outcome.error?.message ?? 'succeeded');
    const dial = await c.rpc('can_dial', { p_workspace_id: ws, p_person_id: seeded.personId }).single();
    check(`${label}: can_dial refuses the other workspace`, dial.data?.allowed === false && dial.data?.reason === 'forbidden', JSON.stringify(dial.data ?? dial.error?.message));
    if (seeded.path) {
      const dl = await c.storage.from('recordings').download(seeded.path);
      check(`${label}: cannot download the other workspace's recording`, !!dl.error, dl.error?.message ?? 'downloaded');
      const signed = await c.storage.from('recordings').createSignedUrl(seeded.path, 60);
      check(`${label}: cannot sign a URL for the other workspace's recording`, !!signed.error, signed.error?.message ?? 'signed');
      const listed = await c.storage.from('recordings').list(ws);
      check(`${label}: cannot list the other workspace's recordings folder`, !!listed.error || (listed.data ?? []).length === 0, listed.error?.message ?? `${listed.data?.length} objects`);
    }
  }
  const ins = await c.from('people').insert({ workspace_id: ws, first_name: 'Intruder', source: 'manual' }).select('id');
  check(`${label}: cannot insert a person into the other workspace`, !!ins.error, ins.error?.message ?? 'inserted');
  const reveal = await c.rpc('reveal_contact', { p_workspace_id: ws, p_contact_id: '22222222-0000-4000-8000-000000000001' });
  check(`${label}: cannot spend the other workspace's credits`, !!reveal.error, reveal.error?.message ?? 'revealed');
  const queue = await c.rpc('today_queue', { p_workspace_id: ws });
  check(`${label}: today_queue returns nothing for the other workspace`, !queue.error && (queue.data ?? []).length === 0, queue.error?.message ?? `${queue.data?.length} rows`);
  const wsUpd = await c.from('workspaces').update({ name: 'Hacked' }).eq('id', ws).select('id');
  check(`${label}: cannot rename the other workspace`, wsUpd.error || (wsUpd.data ?? []).length === 0, wsUpd.error?.message ?? `${wsUpd.data?.length} rows changed`);
  const audit = await c.rpc('log_audit', { p_workspace_id: ws, p_action: 'export.people' });
  check(`${label}: cannot write to the other workspace's audit log`, !!audit.error, audit.error?.message ?? 'written');
}

async function controls(label, s, seeded) {
  const { data } = await s.client.from('people').select('id').eq('id', seeded.personId);
  check(`${label}: positive control, owner can read their own person`, (data ?? []).length === 1);
  const { data: calls } = await s.client.from('calls').select('id').eq('id', seeded.callId);
  check(`${label}: positive control, owner can read their own call`, (calls ?? []).length === 1);
  if (seeded.path) {
    const signed = await s.client.storage.from('recordings').createSignedUrl(seeded.path, 60);
    check(`${label}: positive control, owner can sign their own recording`, !signed.error, signed.error?.message ?? '');
  }
}

async function globalChecks(s) {
  const raw = await s.client.from('contacts').select('mobile_e164').limit(1);
  check('signed-in user cannot read raw contacts (unmasked mobiles)', !!raw.error, raw.error?.message ?? `${raw.data?.length} rows`);
  const anon = createClient(URL, ANON, opts);
  for (const t of ['contacts_public', 'people', 'calls', 'workspaces']) {
    const r = await anon.from(t).select('*').limit(1);
    check(`anonymous visitor cannot read ${t}`, !!r.error || (r.data ?? []).length === 0, r.error?.message ?? `${r.data?.length} rows`);
  }
}

async function main() {
  console.log(`Tenant isolation test · ${auto ? 'self-contained' : 'existing users'} · ${URL}\n`);
  let a, b;
  if (auto) {
    a = await setupUser('a');
    b = await setupUser('b');
  } else {
    a = await signIn(process.env.TEST_A_EMAIL, process.env.TEST_A_PASSWORD);
    b = await signIn(process.env.TEST_B_EMAIL, process.env.TEST_B_PASSWORD);
    a.workspaceId = await workspaceOf(a.client, a.user.id);
    b.workspaceId = await workspaceOf(b.client, b.user.id);
    if (a.workspaceId === b.workspaceId) throw new Error('Both users are in the same workspace. Use users from different workspaces.');
  }
  const seededA = await seed(a);
  const seededB = auto ? await seed(b) : null;
  await controls('A', a, seededA);
  if (seededB) await controls('B', b, seededB);
  await crossChecks('B → A', b, a, seededA);
  await crossChecks('A → B', a, b, seededB);
  await globalChecks(a);
}

let code = 0;
try {
  await main();
} catch (e) {
  console.error(`Setup failed: ${e.message}`);
  code = 2;
} finally {
  for (const fn of cleanup) {
    try {
      await fn();
    } catch {
      /* best effort */
    }
  }
}
const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `  (${r.detail})`}`);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
if (code === 0 && failed.length) code = 1;
process.exit(code);

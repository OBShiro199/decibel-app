#!/usr/bin/env node
// Credit integrity test. Signs in as real (throwaway) users and tries to get credits or data
// without paying, then checks the books balance. Exits 1 if anything fails.
//
//   SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @decibels/web test:credits
//
// Needs at least 12 contacts in the database. Everything it creates is deleted at the end.
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
  console.error('Needs .env.local and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const results = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
const cleanup = [];

async function user(tag) {
  const email = `credits-${tag}-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url') + '1';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Credits ${tag}` } });
  if (error) throw new Error(`createUser: ${error.message}`);
  cleanup.push(() => admin.auth.admin.deleteUser(data.user.id));
  const client = createClient(URL_, ANON, opts);
  const { error: se } = await client.auth.signInWithPassword({ email, password });
  if (se) throw new Error(`sign in: ${se.message}`);
  return { client, id: data.user.id };
}
async function workspace(u, name) {
  const { data, error } = await u.client.rpc('create_workspace', { p_name: name, p_slug: `cr-${randomBytes(4).toString('hex')}` });
  if (error) throw new Error(`create_workspace: ${error.message}`);
  cleanup.unshift(() => admin.from('workspaces').delete().eq('id', data.id));
  return data.id;
}
const balance = async (ws) => (await admin.from('workspaces').select('credit_balance').eq('id', ws).single()).data.credit_balance;
const ledger = async (ws, reason) => {
  let q = admin.from('credit_transactions').select('delta,reason,reference_id').eq('workspace_id', ws);
  if (reason) q = q.eq('reason', reason);
  return (await q).data ?? [];
};
const peopleCount = async (ws) => (await admin.from('people').select('id', { count: 'exact', head: true }).eq('workspace_id', ws).not('source_contact_id', 'is', null)).count ?? 0;
const sum = (rows) => rows.reduce((s, r) => s + r.delta, 0);
const spend = async (ws, to) => {
  // leave exactly `to` credits by recording a negative adjustment (the ledger only ever appends)
  const have = await balance(ws);
  if (have > to) await admin.from('credit_transactions').insert({ workspace_id: ws, delta: to - have, reason: 'admin_adjustment', note: 'test setup' });
};

async function main() {
  const a = await user('a');
  const b = await user('b');
  const wsA = await workspace(a, 'Credits A');
  const wsB = await workspace(b, 'Credits B');

  const { data: contacts } = await a.client.from('contacts_public').select('id').limit(20);
  if (!contacts || contacts.length < 12) throw new Error(`need 12+ contacts in the database, found ${contacts?.length ?? 0}`);
  const ids = contacts.map((c) => c.id);

  // ---- welcome credits: 5,000, once per account ---------------------------------------
  check('new account gets 5,000 welcome credits', (await balance(wsA)) === 5000, `${await balance(wsA)}`);
  const grants = await ledger(wsA, 'trial_grant');
  check('the grant is one ledger row of 5,000', grants.length === 1 && grants[0].delta === 5000, JSON.stringify(grants));
  const wsA2 = await workspace(a, 'Credits A second');
  check('a second workspace on the same account gets no credits', (await balance(wsA2)) === 0, `${await balance(wsA2)}`);
  await a.client.from('workspaces').delete().eq('id', wsA2);
  const wsA3 = await workspace(a, 'Credits A third');
  check('delete and recreate does not mint credits', (await balance(wsA3)) === 0, `${await balance(wsA3)}`);
  const reset = await a.client.from('profiles').update({ trial_credits_granted_at: null }).eq('id', a.id);
  check('cannot clear the welcome-grant flag', !!reset.error, reset.error?.message ?? 'updated');
  const wsA4 = await workspace(a, 'Credits A fourth');
  check('still no credits after trying to reset the flag', (await balance(wsA4)) === 0, `${await balance(wsA4)}`);

  // ---- tampering from the browser ------------------------------------------------------
  const ins = await a.client.from('credit_transactions').insert({ workspace_id: wsA, delta: 100000, reason: 'purchase' });
  check('cannot insert credits into the ledger', !!ins.error, ins.error?.message ?? 'inserted');
  const upd = await a.client.from('credit_transactions').update({ delta: 1 }).eq('workspace_id', wsA);
  check('cannot edit the ledger', !!upd.error, upd.error?.message ?? 'updated');
  const del = await a.client.from('credit_transactions').delete().eq('workspace_id', wsA);
  check('cannot delete from the ledger', !!del.error, del.error?.message ?? 'deleted');
  const bal = await a.client.from('workspaces').update({ credit_balance: 999999 }).eq('id', wsA);
  check('cannot set the balance', !!bal.error, bal.error?.message ?? 'updated');
  check('balance unchanged after tampering', (await balance(wsA)) === 5000, `${await balance(wsA)}`);
  const fake = await a.client.from('people').insert({ workspace_id: wsA, first_name: 'Free', source_contact_id: ids[0], mobile_e164: '+447700900123' });
  check('cannot create a database contact without revealing it', !!fake.error, fake.error?.message ?? 'inserted');
  const own = await a.client.from('people').insert({ workspace_id: wsA, first_name: 'Own', last_name: 'Entry', mobile_e164: '+447700900124', source: 'manual' }).select('id').single();
  check('own entries still work', !own.error && own.data?.id, own.error?.message ?? '');
  const relink = await a.client.from('people').update({ source_contact_id: ids[1] }).eq('id', own.data?.id ?? '00000000-0000-0000-0000-000000000000');
  check('cannot link an own entry to a database contact', !!relink.error, relink.error?.message ?? 'updated');
  const other = await a.client.rpc('reveal_contact', { p_workspace_id: wsB, p_contact_id: ids[0] });
  check("cannot reveal into someone else's workspace", !!other.error, other.error?.message ?? 'revealed');
  const anon = await createClient(URL_, ANON, opts).rpc('reveal_contact', { p_workspace_id: wsA, p_contact_id: ids[0] });
  check('signed-out visitors cannot reveal', !!anon.error, anon.error?.message ?? 'revealed');
  const { data: listB } = await b.client.from('lists').insert({ workspace_id: wsB, name: 'B list', owner_id: b.id }).select('id').single();
  const foreign = await a.client.rpc('reveal_contact', { p_workspace_id: wsA, p_contact_id: ids[0], p_list_id: listB.id });
  check("cannot file a reveal into another workspace's list", !!foreign.error && (await balance(wsA)) === 5000, foreign.error?.message ?? 'revealed');

  // ---- even the service role cannot rewrite history ------------------------------------
  const row = (await admin.from('credit_transactions').select('id').eq('workspace_id', wsA).limit(1).single()).data;
  const s1 = await admin.from('credit_transactions').update({ delta: 1 }).eq('id', row.id);
  check('service role cannot edit a ledger row', !!s1.error, s1.error?.message ?? 'updated');
  const s2 = await admin.from('credit_transactions').delete().eq('id', row.id);
  check('service role cannot delete a ledger row', !!s2.error, s2.error?.message ?? 'deleted');
  const s3 = await admin.from('workspaces').update({ credit_balance: 123456 }).eq('id', wsA);
  check('service role cannot change a balance without a ledger entry', !!s3.error, s3.error?.message ?? 'updated');
  const s4 = await admin.from('workspaces').insert({ name: 'Rich', slug: `rich-${randomBytes(3).toString('hex')}`, created_by: a.id, credit_balance: 500 });
  check('a workspace cannot be created with credits', !!s4.error, s4.error?.message ?? 'inserted');

  // ---- revealing: 1 credit each, free when already revealed -----------------------------
  const r1 = await a.client.rpc('reveal_contact', { p_workspace_id: wsA, p_contact_id: ids[0] });
  check('reveal returns the unmasked mobile', !r1.error && /^\+\d{8,}/.test(r1.data?.mobile_e164 ?? ''), r1.error?.message ?? r1.data?.mobile_e164);
  check('one reveal costs exactly 1 credit', (await balance(wsA)) === 4999, `${await balance(wsA)}`);
  const again = await a.client.rpc('reveal_contact', { p_workspace_id: wsA, p_contact_id: ids[0] });
  check('revealing the same contact again is free', !again.error && again.data?.id === r1.data?.id && (await balance(wsA)) === 4999, again.error?.message ?? `${await balance(wsA)}`);
  const { data: listA } = await a.client.from('lists').insert({ workspace_id: wsA, name: 'A list', owner_id: a.id }).select('id').single();
  const bulk = await a.client.rpc('reveal_contacts', { p_workspace_id: wsA, p_contact_ids: ids.slice(0, 6), p_list_id: listA.id });
  check('adding 6 leads (1 already revealed) to a list costs exactly 5', !bulk.error && bulk.data?.length === 6 && (await balance(wsA)) === 4994, bulk.error?.message ?? `${await balance(wsA)}`);
  const { count: inList } = await admin.from('list_members').select('person_id', { count: 'exact', head: true }).eq('list_id', listA.id);
  check('all 6 are in the list, with numbers revealed', inList === 6 && bulk.data?.every((p) => p.mobile_e164), `${inList} in list`);
  const dup = await a.client.rpc('reveal_contacts', { p_workspace_id: wsA, p_contact_ids: [ids[6], ids[6], ids[6]], p_list_id: listA.id });
  check('the same contact listed three times is charged once', !dup.error && (await balance(wsA)) === 4993, dup.error?.message ?? `${await balance(wsA)}`);
  const rows = await ledger(wsA, 'reveal');
  const refs = rows.map((r) => r.reference_id);
  check('every reveal is one ledger row of -1 with the contact id', rows.length === 7 && rows.every((r) => r.delta === -1) && new Set(refs).size === 7, `${rows.length} rows`);

  // ---- concurrency: nothing can be double-spent ----------------------------------------
  const same = await Promise.all(Array.from({ length: 12 }, () => b.client.rpc('reveal_contact', { p_workspace_id: wsB, p_contact_id: ids[7] })));
  const sameIds = new Set(same.map((r) => r.data?.id));
  check('12 simultaneous reveals of one contact all succeed with one person', same.every((r) => !r.error) && sameIds.size === 1, same.find((r) => r.error)?.error?.message ?? '');
  check('and charge exactly 1 credit', (await ledger(wsB, 'reveal')).length === 1 && (await balance(wsB)) === 4999, `${await balance(wsB)}`);

  await spend(wsB, 3);
  const racers = await Promise.all(ids.slice(8, 20).map((id) => b.client.rpc('reveal_contact', { p_workspace_id: wsB, p_contact_id: id })));
  const ok = racers.filter((r) => !r.error).length;
  const failed = racers.filter((r) => r.error);
  check('12 simultaneous reveals with 3 credits: exactly 3 succeed', ok === 3, `${ok} succeeded`);
  check('the rest are refused for credits', failed.length === 9 && failed.every((r) => r.error.message.includes('insufficient_credits')), failed[0]?.error?.message ?? '');
  check('balance is exactly 0, never negative', (await balance(wsB)) === 0, `${await balance(wsB)}`);

  // ---- bulk is all or nothing -----------------------------------------------------------
  const c = await user('c');
  const wsC = await workspace(c, 'Credits C');
  await spend(wsC, 2);
  const before = await peopleCount(wsC);
  const short = await c.client.rpc('reveal_contacts', { p_workspace_id: wsC, p_contact_ids: ids.slice(0, 5) });
  check('adding 5 new leads with only 2 credits is refused whole', !!short.error && short.error.message.includes('insufficient_credits'), short.error?.message ?? 'revealed');
  check('and nothing was revealed or charged', (await peopleCount(wsC)) === before && (await balance(wsC)) === 2, `${await peopleCount(wsC)} people, ${await balance(wsC)} credits`);
  await admin.from('workspaces').update({ daily_reveal_limit: 1 }).eq('id', wsC);
  const capped = await c.client.rpc('reveal_contacts', { p_workspace_id: wsC, p_contact_ids: ids.slice(0, 2) });
  check('a bulk reveal over the daily limit is refused whole', !!capped.error && capped.error.message.includes('daily_reveal_limit'), capped.error?.message ?? 'revealed');
  check('and charges nothing', (await peopleCount(wsC)) === before && (await balance(wsC)) === 2, `${await balance(wsC)} credits`);
  const tooBig = await c.client.rpc('reveal_contacts', { p_workspace_id: wsC, p_contact_ids: Array.from({ length: 501 }, () => ids[0]) });
  check('more than 500 at once is refused', !!tooBig.error && tooBig.error.message.includes('too_many'), tooBig.error?.message ?? 'revealed');
  const ghost = await c.client.rpc('reveal_contacts', { p_workspace_id: wsC, p_contact_ids: ['00000000-0000-4000-8000-00000000dead'] });
  check('an unknown contact is refused', !!ghost.error && ghost.error.message.includes('contact not found'), ghost.error?.message ?? 'revealed');

  // ---- reconciliation -------------------------------------------------------------------
  const bad = await admin.rpc('credit_ledger_check');
  const mine = (bad.data ?? []).filter((r) => [wsA, wsB, wsC, wsA3, wsA4].includes(r.workspace_id));
  check('every test workspace balance equals the sum of its ledger', !bad.error && mine.length === 0, JSON.stringify(mine));
  check('no workspace anywhere has a balance that differs from its ledger', !bad.error && (bad.data ?? []).length === 0, JSON.stringify(bad.data));
  check('A ledger sum equals the balance', sum(await ledger(wsA)) === (await balance(wsA)), '');
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
      const r = await fn();
      if (r?.error) console.error(`cleanup: ${r.error.message}`);
    } catch (e) {
      console.error(`cleanup: ${e.message}`);
    }
  }
}
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.pass ? '' : `  [${r.detail}]`}`);
const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
process.exit(code || (failed.length ? 1 : 0));

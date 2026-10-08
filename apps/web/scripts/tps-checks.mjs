#!/usr/bin/env node
// TPS/CTPS checks: credits, security and real checks end to end (migration 0023 + tps-check).
// Creates throwaway users, runs real checks in batches of 5 numbers (from the sample leads CSV,
// so each run costs a few pence of Provero balance), then deletes everything it made.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/tps-checks.mjs [path/to/leads.csv]
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Papa from 'papaparse';

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
const CSV = process.argv[2] ?? join(process.env.HOME, 'Downloads', 'decibel-leads-2026-10-08.csv');
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const sleep = (n) => new Promise((r) => setTimeout(r, n));
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const cleanup = [];

async function user(label) {
  const email = `tps-${label}-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url') + '1';
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`createUser: ${error.message}`);
  cleanup.push(() => admin.auth.admin.deleteUser(created.user.id));
  const db = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: e2 } = await db.auth.signInWithPassword({ email, password });
  if (e2) throw new Error(`sign in: ${e2.message}`);
  const workspace = async (name) => {
    const { data: ws, error: e3 } = await db.rpc('create_workspace', { p_name: name, p_slug: `tps-${randomBytes(4).toString('hex')}` });
    if (e3) throw new Error(`create_workspace: ${e3.message}`);
    cleanup.unshift(() => admin.from('workspaces').delete().eq('id', ws.id));
    return ws.id;
  };
  return { db, id: created.user.id, workspace };
}

const balance = async (db, ws) => (await db.from('workspaces').select('tps_credit_balance').eq('id', ws).single()).data?.tps_credit_balance;

async function waitDone(db, jobId, ms = 90_000) {
  const until = Date.now() + ms;
  let job;
  while (Date.now() < until) {
    job = (await db.from('tps_jobs').select('*').eq('id', jobId).single()).data;
    if (job?.finished_at) return job;
    await sleep(700);
  }
  return job;
}

const HEADERS = ['first_name', 'company', 'mobile'];
const rowsFor = (people) => people.map((p) => [p.first_name, p.company, p.mobile]);

async function main() {
  const leads = Papa.parse(readFileSync(CSV, 'utf8'), { header: true, skipEmptyLines: true }).data;
  check('Sample leads CSV loaded', leads.length >= 10, `${leads.length} rows from ${CSV}`);
  const batch1 = leads.slice(0, 5);
  const batch2 = leads.slice(5, 10);
  const uk1 = batch1.filter((p) => p.mobile.startsWith('+44')).length;

  // ---- welcome credits ------------------------------------------------------
  const a = await user('a');
  const ws = await a.workspace('TPS probe');
  check('A new account gets 2,500 check credits', (await balance(a.db, ws)) === 2500);
  const { data: welcome } = await a.db.from('tps_credit_transactions').select('delta,reason').eq('workspace_id', ws);
  check('…recorded once on the ledger as a welcome grant', welcome?.length === 1 && welcome[0].reason === 'welcome' && welcome[0].delta === 2500);
  const { data: dataCredits } = await a.db.from('workspaces').select('credit_balance').eq('id', ws).single();
  check('…separate from the 5,000 data credits', dataCredits?.credit_balance === 5000, `data credits ${dataCredits?.credit_balance}`);
  const ws2 = await a.workspace('TPS probe 2');
  check('A second workspace on the same account gets no extra check credits', (await balance(a.db, ws2)) === 0);

  // ---- the browser can't mint, move or fake anything ------------------------
  const ins = await a.db.from('tps_credit_transactions').insert({ workspace_id: ws, delta: 100000, reason: 'topup', reference: 'x' });
  check('Browser cannot insert into the check-credit ledger', !!ins.error);
  await a.db.from('workspaces').update({ tps_credit_balance: 999999 }).eq('id', ws);
  check('Browser cannot edit the check-credit balance', (await balance(a.db, ws)) === 2500);
  for (const [fn, args] of [
    ['tps_grant_credits', { p_workspace_id: ws, p_amount: 5000, p_reference: 'free' }],
    ['tps_finish_job', { p_job_id: '00000000-0000-0000-0000-000000000000' }],
    ['tps_claim', { p_job_id: '00000000-0000-0000-0000-000000000000' }],
    ['tps_save', { p_job_id: '00000000-0000-0000-0000-000000000000', p_results: [] }],
    ['tps_sweep', {}],
    ['tps_ledger_check', {}],
  ]) {
    const { error } = await a.db.rpc(fn, args);
    check(`Browser cannot call ${fn}`, !!error, error?.code ?? 'allowed!');
  }
  const prof = await a.db.from('profiles').update({ tps_credits_granted_at: null }).eq('id', a.id);
  const { data: flag } = await admin.from('profiles').select('tps_credits_granted_at').eq('id', a.id).single();
  check('Browser cannot reset the welcome-grant flag', !!prof.error || flag?.tps_credits_granted_at !== null);
  const jobIns = await a.db.from('tps_jobs').insert({ workspace_id: ws, file_name: 'x', headers: ['a'], phone_column: 0 });
  check('Browser cannot write check jobs directly', !!jobIns.error);

  // ---- quote and batch 1 (5 numbers, some outside the UK) ---------------------
  const { data: q1 } = await a.db.rpc('tps_quote', { p_workspace_id: ws, p_values: batch1.map((p) => p.mobile) });
  const quote = q1?.[0];
  check('Quote counts the UK numbers and prices them at 1 credit each', quote?.numbers_total === uk1 && quote?.cost === uk1 && quote?.rows_not_uk === 5 - uk1, JSON.stringify(quote));

  const t0 = Date.now();
  const { data: job1Id, error: e1 } = await a.db.rpc('tps_create_job', { p_workspace_id: ws, p_file_name: 'batch-1.csv', p_headers: HEADERS, p_phone_column: 2, p_rows: rowsFor(batch1) });
  check('Batch 1 (5 numbers) starts', !e1 && !!job1Id, e1?.message);
  check('Credits are reserved the moment the check starts', (await balance(a.db, ws)) === 2500 - uk1);
  const job1 = await waitDone(a.db, job1Id);
  check('Batch 1 finishes by itself (worker started from the database)', job1?.status === 'done', `${job1?.status} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const { data: res1 } = await a.db.rpc('tps_job_results', { p_job_id: job1Id });
  const out1 = (res1 ?? []).map((r) => r.outcome);
  check('Every UK number got a TPS/CTPS answer, others marked not UK', (res1 ?? []).every((r) => (r.e164?.startsWith('+44') ? ['valid', 'tps', 'ctps', 'both'].includes(r.outcome) : r.outcome === 'not_uk')), out1.join(', '));
  check('Results keep the original rows in file order', res1?.length === 5 && res1.every((r, i) => r.row_no === i && r.cells[0] === batch1[i].first_name));
  check('Checked numbers carry a check date', (res1 ?? []).filter((r) => r.e164?.startsWith('+44')).every((r) => !!r.checked_at));
  check('You pay only for numbers checked (not-UK rows are free)', (await balance(a.db, ws)) === 2500 - uk1 && job1.credits_refunded === 0);
  check('Row tallies add up', job1.rows_valid + job1.rows_tps + job1.rows_ctps + job1.rows_both + job1.rows_not_uk === 5, `valid ${job1.rows_valid}, tps ${job1.rows_tps}, ctps ${job1.rows_ctps}, both ${job1.rows_both}, not UK ${job1.rows_not_uk}`);

  // ---- batch 2: 5 UK mobiles plus a duplicate, a blank and junk --------------
  const extra = [
    [batch2[0].first_name + ' (again)', batch2[0].company, batch2[0].mobile.replace('+44', '0')],
    ['Blank', 'No number Ltd', ''],
    ['Junk', 'Bad data Ltd', 'n/a'],
  ];
  const { data: job2Id, error: e2 } = await a.db.rpc('tps_create_job', { p_workspace_id: ws, p_file_name: 'batch-2.csv', p_headers: HEADERS, p_phone_column: 2, p_rows: [...rowsFor(batch2), ...extra] });
  check('Batch 2 (5 numbers + duplicate + blank + junk) starts', !e2 && !!job2Id, e2?.message);
  const job2 = await waitDone(a.db, job2Id);
  const { data: res2 } = await a.db.rpc('tps_job_results', { p_job_id: job2Id });
  check('A duplicate number (written differently) is checked once and charged once', job2?.numbers_total === 5 && job2?.credits_reserved === 5, `numbers ${job2?.numbers_total}`);
  check('…and both rows get the same answer', res2?.[5]?.outcome === res2?.[0]?.outcome && res2?.[5]?.e164 === res2?.[0]?.e164);
  check('Blank and junk cells are marked, not charged', res2?.[6]?.outcome === 'missing' && res2?.[7]?.outcome === 'invalid');
  check('Balance after two batches is exact', (await balance(a.db, ws)) === 2500 - uk1 - 5, `${await balance(a.db, ws)}`);

  // ---- re-checking within 28 days is free --------------------------------------
  const { data: q3 } = await a.db.rpc('tps_quote', { p_workspace_id: ws, p_values: batch1.map((p) => p.mobile) });
  check('Quote for a list checked in the last 28 days costs nothing', q3?.[0]?.cost === 0 && q3?.[0]?.numbers_reused === uk1);
  const before = await balance(a.db, ws);
  const { data: job3Id } = await a.db.rpc('tps_create_job', { p_workspace_id: ws, p_file_name: 'batch-1-again.csv', p_headers: HEADERS, p_phone_column: 2, p_rows: rowsFor(batch1) });
  const job3 = (await a.db.from('tps_jobs').select('*').eq('id', job3Id).single()).data;
  const { data: res3 } = await a.db.rpc('tps_job_results', { p_job_id: job3Id });
  check('…finishes instantly, free, with the same answers and original check dates', job3?.status === 'done' && (await balance(a.db, ws)) === before && res3?.every((r, i) => r.outcome === res1[i].outcome && r.checked_at === res1[i].checked_at));

  // ---- running out ---------------------------------------------------------------
  const left = await balance(a.db, ws);
  await admin.rpc('tps_grant_credits', { p_workspace_id: ws, p_amount: -(left - 2), p_reference: `test-drain-${randomBytes(4).toString('hex')}`, p_note: 'test' });
  const drama = (n) => Array.from({ length: n }, (_, i) => ['Test', 'Ofcom drama range', `07700 900${String(100 + i + Math.floor(Math.random() * 800)).padStart(3, '0')}`]);
  const jobsBefore = (await a.db.from('tps_jobs').select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count;
  const { error: e4 } = await a.db.rpc('tps_create_job', { p_workspace_id: ws, p_file_name: 'too-big.csv', p_headers: HEADERS, p_phone_column: 2, p_rows: drama(3) });
  const jobsAfter = (await a.db.from('tps_jobs').select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count;
  check('A file that needs more credits than you have is refused, nothing charged or saved', /insufficient_tps_credits/.test(e4?.message ?? '') && (await balance(a.db, ws)) === 2 && jobsAfter === jobsBefore, e4?.message);

  // ---- two uploads at once can't overspend ----------------------------------------
  await admin.rpc('tps_grant_credits', { p_workspace_id: ws, p_amount: 1, p_reference: `test-top-${randomBytes(4).toString('hex')}`, p_note: 'test' });
  const [r1, r2] = await Promise.all([
    a.db.rpc('tps_create_job', { p_workspace_id: ws, p_file_name: 'race-1.csv', p_headers: HEADERS, p_phone_column: 2, p_rows: drama(3) }),
    a.db.rpc('tps_create_job', { p_workspace_id: ws, p_file_name: 'race-2.csv', p_headers: HEADERS, p_phone_column: 2, p_rows: drama(3) }),
  ]);
  const won = [r1, r2].filter((r) => !r.error);
  check('Two uploads at once with credit for one: exactly one starts', won.length === 1, [r1, r2].map((r) => r.error?.message ?? 'ok').join(' | '));
  const raceId = won[0]?.data;

  // ---- cancelling refunds what wasn't checked ---------------------------------------
  if (raceId) {
    await a.db.rpc('tps_cancel_job', { p_job_id: raceId });
    const raced = await waitDone(a.db, raceId, 60_000);
    const { count: charged } = await admin.from('tps_job_numbers').select('e164', { count: 'exact', head: true }).eq('job_id', raceId).eq('status', 'done').eq('reused', false);
    check('A cancelled check settles and refunds every number it did not check', !!raced?.finished_at && raced.credits_refunded === 3 - charged && (await balance(a.db, ws)) === 3 - charged, `${raced?.status}, charged ${charged}, refunded ${raced?.credits_refunded}`);
  }

  // ---- limits and other people ---------------------------------------------------------
  const big = Array.from({ length: 1001 }, () => ['x', 'y', '']);
  const { error: e5 } = await a.db.rpc('tps_create_job', { p_workspace_id: ws, p_file_name: 'huge.csv', p_headers: HEADERS, p_phone_column: 2, p_rows: big });
  check('Files over 1,000 rows are refused', /too_many_rows/.test(e5?.message ?? ''), e5?.message);
  const { error: e6 } = await a.db.rpc('tps_create_job', { p_workspace_id: ws, p_file_name: 'bad.csv', p_headers: HEADERS, p_phone_column: 2, p_rows: [[{ evil: true }, 'b', 'c']] });
  check('Rows must be plain text cells', /invalid_file/.test(e6?.message ?? ''), e6?.message);
  const { error: e7 } = await a.db.rpc('tps_create_job', { p_workspace_id: ws, p_file_name: 'col.csv', p_headers: HEADERS, p_phone_column: 9, p_rows: [['a', 'b', 'c']] });
  check('The phone column must exist', /invalid_file/.test(e7?.message ?? ''));

  const b = await user('b');
  const wsB = await b.workspace('Other company');
  const seen = await b.db.from('tps_jobs').select('id').eq('id', job1Id);
  const rowsSeen = await b.db.from('tps_job_rows').select('row_no').eq('job_id', job1Id);
  const { data: resB } = await b.db.rpc('tps_job_results', { p_job_id: job1Id });
  check("Another company can't see your checks, rows or results", (seen.data ?? []).length === 0 && (rowsSeen.data ?? []).length === 0 && (resB ?? []).length === 0);
  const { error: e8 } = await b.db.rpc('tps_create_job', { p_workspace_id: ws, p_file_name: 'x.csv', p_headers: HEADERS, p_phone_column: 2, p_rows: rowsFor(batch1) });
  check("…or start checks on your credits", !!e8, e8?.message);
  const { error: e9 } = await b.db.rpc('tps_delete_job', { p_job_id: job1Id });
  const { error: e10 } = await b.db.rpc('tps_quote', { p_workspace_id: ws, p_values: ['07700900123'] });
  check("…or delete your checks or read your quote", !!e9 && !!e10);
  check('Their own account got its own 2,500', (await balance(b.db, wsB)) === 2500);

  // ---- deleting a check removes the rows, keeps the credit history -----------------------
  const ledgerBefore = (await a.db.from('tps_credit_transactions').select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count;
  const { error: e11 } = await a.db.rpc('tps_delete_job', { p_job_id: job2Id });
  const rowsLeft = (await admin.from('tps_job_rows').select('row_no', { count: 'exact', head: true }).eq('job_id', job2Id)).count;
  const ledgerAfter = (await a.db.from('tps_credit_transactions').select('id', { count: 'exact', head: true }).eq('workspace_id', ws)).count;
  check('Deleting a finished check removes its uploaded rows but keeps the ledger', !e11 && rowsLeft === 0 && ledgerAfter === ledgerBefore, e11?.message);

  // ---- the books balance -------------------------------------------------------------------
  const { data: off } = await admin.rpc('tps_ledger_check');
  check('Every balance equals its ledger', (off ?? []).length === 0, `${(off ?? []).length} mismatched`);
  const upd = await admin.from('tps_credit_transactions').update({ delta: 99999 }).eq('workspace_id', ws);
  check('Even the service role cannot edit ledger rows', !!upd.error);
}

try {
  await main();
} catch (e) {
  check('Run completed', false, e.message);
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

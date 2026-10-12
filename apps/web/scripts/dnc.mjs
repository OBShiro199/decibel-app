#!/usr/bin/env node
// DNC list: bulk uploads, every way a person can be added, dialling, reveals, search flags,
// permissions and tenant isolation (migration 0026, import-csv, telnyx-call). Creates throwaway
// users and workspaces and deletes them afterwards. Spends at most 1 reveal credit (a throwaway
// workspace's own welcome credits).
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/dnc.mjs
import { createClient } from '@supabase/supabase-js';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
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
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const cleanup = [];
const sleep = (n) => new Promise((r) => setTimeout(r, n));

async function user(label) {
  const email = `dnc-${label}-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url') + '1';
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  cleanup.push(() => admin.auth.admin.deleteUser(created.user.id));
  const db = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  await db.auth.signInWithPassword({ email, password });
  const fn = async (name, body) => {
    const token = (await db.auth.getSession()).data.session.access_token;
    const res = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { id: created.user.id, db, fn };
}
const workspaceFor = async (u, name) => {
  const { data, error } = await u.db.rpc('create_workspace', { p_name: name, p_slug: `dnc-${randomBytes(4).toString('hex')}` });
  if (error) throw new Error(error.message);
  cleanup.unshift(() => admin.from('workspaces').delete().eq('id', data.id));
  return data.id;
};

// 12,000 UK mobiles written every way people write them, plus duplicates and junk
const mobile = (i) => `+4477009${String(10000 + i).slice(-5)}`.slice(0, 13);
function bigList() {
  const out = [];
  for (let i = 0; i < 11700; i++) {
    const e = `+447${String(700000000 + i).padStart(9, '0')}`;
    const national = '0' + e.slice(3);
    const fmt = i % 4 === 0 ? e : i % 4 === 1 ? national : i % 4 === 2 ? `${national.slice(0, 5)} ${national.slice(5)}` : `0044 ${e.slice(3)}`;
    out.push([fmt, `Lead ${i}`]);
  }
  for (let i = 0; i < 200; i++) out.push([`+447${String(700000000 + i).padStart(9, '0')}`, 'dupe']); // already in the file
  for (let i = 0; i < 100; i++) out.push([i % 2 ? 'n/a' : '12345', 'junk']);
  return out;
}

async function main() {
  void mobile;
  const owner = await user('owner');
  const member = await user('member');
  const outsider = await user('outsider');
  const ws = await workspaceFor(owner, 'DNC probe');
  const otherWs = await workspaceFor(outsider, 'Other company');
  await admin.from('workspace_members').insert({ workspace_id: ws, user_id: member.id, role: 'member' });

  // ---- a big upload in chunks --------------------------------------------------------------
  const rows = bigList();
  const t0 = Date.now();
  const { data: importId, error: beginErr } = await member.db.rpc('dnc_import_begin', { p_workspace_id: ws, p_file_name: 'opt-outs.csv', p_kind: 'file', p_total: rows.length, p_reason: 'Customer opt-out list' });
  check('A member can start a DNC upload', !beginErr && !!importId, beginErr?.message);
  let added = 0, duplicates = 0, invalid = 0;
  for (let i = 0; i < rows.length; i += 5000) {
    const chunk = rows.slice(i, i + 5000);
    const { data, error } = await member.db.rpc('dnc_add', { p_workspace_id: ws, p_numbers: chunk.map((r) => r[0]), p_labels: chunk.map((r) => r[1]), p_source: 'import', p_import_id: importId });
    if (error) throw new Error(`dnc_add: ${error.message}`);
    added += data.added;
    duplicates += data.duplicates;
    invalid += data.invalid;
  }
  const { data: imp } = await member.db.rpc('dnc_import_finish', { p_import_id: importId });
  check('12,000 rows upload in chunks: every distinct number added once', added === 11700 && duplicates === 200 && invalid === 100, `added ${added}, duplicates ${duplicates}, invalid ${invalid} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  check('The upload is recorded with its totals', imp?.status === 'done' && imp.added === 11700 && imp.duplicates === 200 && imp.invalid === 100 && imp.total_rows === 12000);
  const { count: total } = await member.db.from('dnc_entries').select('id', { count: 'exact', head: true }).eq('workspace_id', ws);
  check('Every format of a number lands as the same E.164 entry', total === 11700, `${total} entries`);
  const { data: sample } = await member.db.from('dnc_entries').select('e164,label,source,reason,import_id').eq('workspace_id', ws).eq('e164', '+447700000001').single();
  check('Entries keep their label, source, reason and upload', sample?.label === 'Lead 1' && sample.source === 'import' && sample.reason === 'Customer opt-out list' && sample.import_id === importId, JSON.stringify(sample));

  const again = await member.db.rpc('dnc_add', { p_workspace_id: ws, p_numbers: ['07700 000005', '+447700000005', '+447911123456'] });
  check('Adding numbers already on the list counts them as duplicates', again.data?.added === 1 && again.data?.duplicates === 2 && again.data?.invalid === 0, JSON.stringify(again.data));

  // ---- checking numbers ---------------------------------------------------------------------
  const { data: hits } = await member.db.rpc('dnc_check', { p_workspace_id: ws, p_numbers: ['07700 000010', '+44 7700 000011', '+447000000000', 'nonsense'] });
  check('dnc_check finds listed numbers however they are written', hits?.length === 2 && hits.every((h) => h.e164.startsWith('+447700')), JSON.stringify(hits));

  // ---- people can't be added with a DNC number --------------------------------------------------
  const addPerson = (u, fields) => u.db.from('people').insert({ workspace_id: ws, first_name: 'Test', last_name: 'Person', source: 'manual', ...fields }).select('id,do_not_call').single();
  const blockedAdd = await addPerson(member, { mobile_e164: '07700 000020' });
  check('Adding a person whose mobile is on the DNC list is refused', !!blockedAdd.error && /dnc_listed/.test(blockedAdd.error.message), blockedAdd.error?.message);
  const blockedDirect = await addPerson(member, { mobile_e164: '07911 000001', direct_dial_e164: '+447700000021' });
  check('…or whose direct dial is on it', !!blockedDirect.error && /dnc_listed/.test(blockedDirect.error.message));
  const okAdd = await addPerson(member, { mobile_e164: '07911 000002' });
  check('A clean number is added normally', !okAdd.error && okAdd.data?.do_not_call === false, okAdd.error?.message);
  const changeTo = await member.db.from('people').update({ mobile_e164: '+447700000022' }).eq('id', okAdd.data.id).select('id');
  check("Changing someone's number to a DNC number is refused", !!changeTo.error && /dnc_listed/.test(changeTo.error.message));

  // ---- adding a number flags existing people and blocks dialling ----------------------------------
  const { data: person } = await addPerson(member, { mobile_e164: '07911 000003' });
  await member.db.rpc('dnc_add', { p_workspace_id: ws, p_numbers: ['07911 000003'], p_reason: 'Asked by email' });
  const { data: flagged } = await admin.from('people').select('do_not_call').eq('id', person.id).single();
  check('Adding a number to the list flags the person who has it', flagged?.do_not_call === true);
  const { data: dial } = await member.db.rpc('can_dial', { p_workspace_id: ws, p_person_id: person.id }).single();
  check('Dialling them is refused with the DNC reason', dial?.allowed === false && dial?.reason === 'dnc_list', JSON.stringify(dial));
  const sameRowEdit = await member.db.from('people').update({ job_title: 'Director' }).eq('id', person.id).select('id');
  check('Editing other details of that person still works', !sameRowEdit.error, sameRowEdit.error?.message);

  // test and test-routed calls are checked too
  await admin.from('profiles').update({ mobile_e164: '+447700000030' }).eq('id', member.id);
  const testCall = await member.fn('telnyx-call', { workspace_id: ws, call_id: randomUUID(), kind: 'test', to: '+447700000030' });
  check('A test call to a DNC number is blocked before dialling', testCall.body.blocked === 'dnc_list', JSON.stringify(testCall.body));

  // ---- removing: owners and admins only --------------------------------------------------------------
  const { data: entry } = await admin.from('dnc_entries').select('id').eq('workspace_id', ws).eq('e164', '+447911000003').single();
  const memberRemove = await member.db.rpc('dnc_remove', { p_workspace_id: ws, p_ids: [entry.id] });
  check('A member cannot remove numbers from the list', !!memberRemove.error && /admins_only/.test(memberRemove.error.message));
  const directDelete = await member.db.from('dnc_entries').delete().eq('id', entry.id).select('id');
  check('…not even with a direct delete', (directDelete.data ?? []).length === 0);
  const ownerRemove = await owner.db.rpc('dnc_remove', { p_workspace_id: ws, p_ids: [entry.id] });
  const { data: unflagged } = await admin.from('people').select('do_not_call').eq('id', person.id).single();
  const { data: dial2 } = await member.db.rpc('can_dial', { p_workspace_id: ws, p_person_id: person.id }).single();
  check('An owner can remove it, and the person becomes callable again', ownerRemove.data === 1 && unflagged?.do_not_call === false && dial2?.reason !== 'dnc_list' && dial2?.reason !== 'do_not_call', `${ownerRemove.error?.message ?? ''} ${JSON.stringify(dial2)}`);

  // ---- CSV import of people skips DNC numbers ------------------------------------------------------------
  const csv = 'first_name,last_name,mobile\nAda,One,07911 100001\nBob,Two,07700 000040\nCat,Three,07911 100002\n';
  const path = `${ws}/dnc-test-${randomBytes(3).toString('hex')}.csv`;
  await admin.storage.from('imports').upload(path, new Blob([csv], { type: 'text/csv' }));
  cleanup.unshift(() => admin.storage.from('imports').remove([path]));
  const { data: impRow } = await admin.from('imports').insert({ workspace_id: ws, user_id: owner.id, storage_path: path, filename: 'people.csv', status: 'mapping', column_map: { first_name: 'first_name', last_name: 'last_name', mobile: 'mobile' } }).select('id').single();
  const ran = await owner.fn('import-csv', { import_id: impRow.id });
  const { data: impAfter } = await admin.from('imports').select('imported_count,dnc_skipped_count,status').eq('id', impRow.id).single();
  check('Importing people skips anyone on the DNC list and says how many', ran.body.imported === 2 && ran.body.dnc_skipped === 1 && impAfter?.dnc_skipped_count === 1, JSON.stringify(ran.body));

  // ---- search results flag DNC rows; reveals skip them (not charged) -----------------------------------------
  const { data: page } = await owner.db.rpc('search_leads', { p_workspace_id: ws, p_filters: { hasMobile: true }, p_limit: 20, p_offset: 0 });
  check('Lead search returns the DNC flag', Array.isArray(page) && page.length > 0 && page.every((r) => r.on_dnc === false), `${page?.length} rows`);
  const target = page[0];
  const clean = page[1];
  const { data: raw } = await admin.from('data_list').select('mobile_phone').eq('contact_id', target.lead_id).limit(1).single();
  await owner.db.rpc('dnc_add', { p_workspace_id: ws, p_numbers: [raw.mobile_phone] });
  const { data: page2 } = await owner.db.rpc('search_leads', { p_workspace_id: ws, p_filters: { hasMobile: true }, p_limit: 20, p_offset: 0 });
  check('…and marks a lead once its number is on the list', page2.find((r) => r.lead_id === target.lead_id)?.on_dnc === true && page2.find((r) => r.lead_id === clean.lead_id)?.on_dnc === false);
  const { data: credits0 } = await admin.from('workspaces').select('credit_balance').eq('id', ws).single();
  const { data: revealed, error: revErr } = await owner.db.rpc('reveal_leads', { p_workspace_id: ws, p_lead_ids: [target.lead_id, clean.lead_id] });
  const { data: credits1 } = await admin.from('workspaces').select('credit_balance').eq('id', ws).single();
  check('Revealing skips the DNC lead and charges only for the other', !revErr && revealed?.length === 1 && revealed[0].source_lead_id === clean.lead_id && credits0.credit_balance - credits1.credit_balance === 1, `${revErr?.message ?? ''} revealed ${revealed?.length}, charged ${credits0.credit_balance - credits1.credit_balance}`);

  const { data: localPage } = await owner.db.rpc('search_local', { p_workspace_id: ws, p_filters: { hasPhone: true }, p_limit: 10, p_offset: 0 });
  const biz = (localPage ?? []).find((r) => r.phone);
  if (biz) await owner.db.rpc('dnc_add', { p_workspace_id: ws, p_numbers: [biz.phone] });
  const { data: localPage2 } = await owner.db.rpc('search_local', { p_workspace_id: ws, p_filters: { hasPhone: true }, p_limit: 10, p_offset: 0 });
  check('Local business search marks businesses whose phone is on the list', !!biz && localPage2.find((r) => r.place_id === biz.place_id)?.on_dnc === true && localPage2.filter((r) => r.on_dnc).length === 1, biz?.phone);

  // ---- tenant isolation ---------------------------------------------------------------------------------------
  const seen = await outsider.db.from('dnc_entries').select('id').eq('workspace_id', ws).limit(5);
  const seenImports = await outsider.db.from('dnc_imports').select('id').eq('workspace_id', ws);
  check("Another company can't read your DNC list or uploads", (seen.data ?? []).length === 0 && (seenImports.data ?? []).length === 0);
  const sneak = await outsider.db.rpc('dnc_add', { p_workspace_id: ws, p_numbers: ['+447999999999'] });
  const peek = await outsider.db.rpc('dnc_check', { p_workspace_id: ws, p_numbers: ['+447700000001'] });
  const strip = await outsider.db.rpc('dnc_remove', { p_workspace_id: ws, p_ids: [randomUUID()] });
  check("…or add to it, check against it or remove from it", !!sneak.error && !!peek.error && !!strip.error);
  const own = await outsider.db.rpc('dnc_add', { p_workspace_id: otherWs, p_numbers: ['+447700000001'] });
  check("Their own list is separate (the same number is new there)", own.data?.added === 1, JSON.stringify(own.data));
  const { data: personThere, error: ptErr } = await outsider.db.from('people').insert({ workspace_id: otherWs, first_name: 'X', mobile_e164: '+447700000002', source: 'manual' }).select('id').single();
  check("Your DNC list doesn't block people in another workspace", !ptErr && !!personThere, ptErr?.message);

  // ---- limits ---------------------------------------------------------------------------------------------------
  const tooBig = await member.db.rpc('dnc_add', { p_workspace_id: ws, p_numbers: Array.from({ length: 5001 }, (_, i) => `+44790000${String(i).padStart(4, '0')}`) });
  check('A single request is capped at 5,000 numbers', !!tooBig.error && /too_many/.test(tooBig.error.message));
  const tooBigImport = await member.db.rpc('dnc_import_begin', { p_workspace_id: ws, p_file_name: 'huge.csv', p_kind: 'file', p_total: 200001 });
  check('An upload is capped at 200,000 numbers', !!tooBigImport.error && /too_many_rows/.test(tooBigImport.error.message));
  const badDirect = await owner.db.from('dnc_entries').insert({ workspace_id: ws, e164: 'not a number' });
  check('The table itself refuses anything that is not a phone number', !!badDirect.error);
  await sleep(10);
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

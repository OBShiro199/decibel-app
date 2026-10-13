#!/usr/bin/env node
// Teams end to end (migration 0032, `team` function, twilio-voice caller ID). Creates throwaway users and
// workspaces and deletes them afterwards. Buys no numbers (fake phone_numbers rows, no Twilio sid) and
// sends no real email (example.test addresses).
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/team.mjs
import { createClient } from '@supabase/supabase-js';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
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
// Twilio parent credentials (supabase/functions/.env, gitignored) sign the simulated Twilio request
const fnEnv = join(here, '..', '..', '..', 'supabase', 'functions', '.env');
const fromFnEnv = (k) => (existsSync(fnEnv) ? readFileSync(fnEnv, 'utf8').match(new RegExp(`^${k}=(.*)$`, 'm'))?.[1]?.replace(/^"|"$/g, '') : undefined);
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID ?? fromFnEnv('TWILIO_ACCOUNT_SID');
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? fromFnEnv('TWILIO_AUTH_TOKEN');
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

const anonClient = () => createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
async function user(label, emailOverride) {
  const email = emailOverride ?? `team-${label}-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url') + '1';
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Test ${label}` } });
  if (error) throw new Error(error.message);
  cleanup.push(() => admin.auth.admin.deleteUser(created.user.id));
  return signIn(created.user.id, email, password);
}
async function signIn(id, email, password) {
  const db = anonClient();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  const fn = async (name, body) => {
    const token = (await db.auth.getSession()).data.session.access_token;
    const res = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, apikey: ANON, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { id, email, db, fn };
}
const anonFn = async (name, body) => {
  const res = await fetch(`${URL_}/functions/v1/${name}`, { method: 'POST', headers: { apikey: ANON, Authorization: `Bearer ${ANON}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const workspaceFor = async (u, name) => {
  const { data, error } = await u.db.rpc('create_workspace', { p_name: name, p_slug: `team-${randomBytes(4).toString('hex')}` });
  if (error) throw new Error(error.message);
  cleanup.unshift(() => admin.from('workspaces').delete().eq('id', data.id));
  return data.id;
};

async function main() {
  const owner = await user('owner');
  const ws = await workspaceFor(owner, 'Team Probe Ltd');
  const outsider = await user('outsider');
  const otherWs = await workspaceFor(outsider, 'Other Co');

  // ---- invites ---------------------------------------------------------------------------------------
  const newEmail = `team-new-${randomBytes(4).toString('hex')}@example.test`;
  const inv = await owner.fn('team', { action: 'invite', workspace_id: ws, emails: [newEmail, 'not-an-email', owner.email], role: 'member' });
  const st = Object.fromEntries((inv.body.results ?? []).map((r) => [r.email, r.status]));
  check('Owner can invite; invalid and already-member addresses are reported, not invited', inv.status === 200 && st[newEmail] === 'invited' && st['not-an-email'] === 'invalid' && st[owner.email.toLowerCase()] === 'already_member', JSON.stringify(st));
  const link = inv.body.results.find((r) => r.email === newEmail)?.link ?? '';
  const token = link.split('/invite/')[1];
  check('The invite link points at /invite/<token>', /\/invite\/[0-9a-f]{48}$/.test(link), link.replace(/[0-9a-f]{40}/, '…'));

  const member = await user('member');
  await admin.from('workspace_members').insert({ workspace_id: ws, user_id: member.id, role: 'member' });
  const byMember = await member.fn('team', { action: 'invite', workspace_id: ws, emails: ['x@example.test'] });
  check('A member cannot invite', byMember.status === 403, `${byMember.status} ${byMember.body.message ?? ''}`);
  const byOutsider = await outsider.fn('team', { action: 'invite', workspace_id: ws, emails: ['x@example.test'] });
  check('Someone from another workspace cannot invite', byOutsider.status === 403, `${byOutsider.status}`);
  const direct = await member.db.from('invitations').select('token').eq('workspace_id', ws);
  check('Members cannot read invite tokens', (direct.data ?? []).length === 0);

  const { data: info } = await anonClient().rpc('get_invitation', { p_token: token });
  check('The invite page sees who invited them, the workspace, and that they have no account yet', info?.[0]?.workspace_name === 'Team Probe Ltd' && info?.[0]?.has_account === false && info?.[0]?.status === 'pending', JSON.stringify(info?.[0] ?? {}).slice(0, 160));

  // ---- signing up from the invite ----------------------------------------------------------------------
  const weak = await anonFn('team', { action: 'signup', token, full_name: 'New Rep', password: 'short' });
  check('Sign-up rejects a weak password', weak.status === 400 && weak.body.error === 'weak_password', weak.body.message);
  const ok = await anonFn('team', { action: 'signup', token, full_name: 'New Rep', password: 'GoodPassword123' });
  check('Sign-up from the invite creates the account and joins the workspace', ok.status === 200 && ok.body.email === newEmail, JSON.stringify(ok.body));
  const { data: created } = await admin.from('profiles').select('id,full_name,last_workspace_id').eq('email', newEmail).maybeSingle();
  if (created) cleanup.push(() => admin.auth.admin.deleteUser(created.id));
  const { data: joined } = await admin.from('workspace_members').select('role').eq('workspace_id', ws).eq('user_id', created?.id ?? randomUUID()).maybeSingle();
  check('…as a member, with their name, landing in that workspace', joined?.role === 'member' && created?.full_name === 'New Rep' && created?.last_workspace_id === ws, `${joined?.role} ${created?.full_name}`);
  const rep = created ? await signIn(created.id, newEmail, 'GoodPassword123') : null;
  check('They can log in with the password they chose (no confirmation email)', !!rep);
  const again = await anonFn('team', { action: 'signup', token, full_name: 'Again', password: 'GoodPassword123' });
  check('The invite cannot be used twice', again.status === 400 && again.body.error === 'invalid_invitation');

  // accepting never changes an existing member's role
  const adminUser = await user('admin');
  await admin.from('workspace_members').insert({ workspace_id: ws, user_id: adminUser.id, role: 'admin' });
  const reinv = await owner.fn('team', { action: 'invite', workspace_id: ws, emails: [adminUser.email], role: 'member' });
  check('Inviting someone already in the team does nothing', reinv.body.results?.[0]?.status === 'already_member');
  await admin.from('invitations').insert({ workspace_id: ws, email: adminUser.email, role: 'member', invited_by: owner.id });
  const { data: tok2 } = await admin.from('invitations').select('token').eq('workspace_id', ws).eq('email', adminUser.email).single();
  await adminUser.db.rpc('accept_invitation', { p_token: tok2.token });
  const { data: stillAdmin } = await admin.from('workspace_members').select('role').eq('workspace_id', ws).eq('user_id', adminUser.id).single();
  check('Accepting an invite never demotes an existing member', stillAdmin.role === 'admin', stillAdmin.role);

  // resend gives a fresh token
  const inv2 = await owner.fn('team', { action: 'invite', workspace_id: ws, emails: [`team-later-${randomBytes(3).toString('hex')}@example.test`] });
  const { data: pending } = await admin.from('invitations').select('id,token').eq('workspace_id', ws).eq('status', 'pending').order('created_at', { ascending: false }).limit(1).single();
  const resend = await owner.fn('team', { action: 'resend', invitation_id: pending.id });
  const { data: renewed } = await admin.from('invitations').select('token').eq('id', pending.id).single();
  check('Resend sends again with a fresh link', resend.status === 200 && renewed.token !== pending.token && resend.body.link?.endsWith(renewed.token), `${resend.status}`);
  void inv2;

  // ---- numbers and caller ID (fake rows: nothing is bought) ----------------------------------------------
  const wsNumber = '+447700900100';
  const repNumber = '+447700900200';
  await admin.from('phone_numbers').insert([
    { workspace_id: ws, e164: wsNumber, kind: 'twilio_mobile', status: 'active', is_default: true },
    { workspace_id: ws, e164: repNumber, kind: 'twilio_mobile', status: 'active', is_default: false },
  ]);
  const { data: repNum } = await admin.from('phone_numbers').select('id').eq('workspace_id', ws).eq('e164', repNumber).single();
  const assign = await owner.db.from('phone_numbers').update({ assigned_user_id: rep.id }).eq('id', repNum.id).select('id');
  check('An admin can give a rep a number', (assign.data ?? []).length === 1);
  const memberAssign = await member.db.from('phone_numbers').update({ assigned_user_id: member.id }).eq('id', repNum.id).select('id');
  check('A member cannot take a number', (memberAssign.data ?? []).length === 0);

  // Twilio asks twilio-voice what to dial; signed like Twilio signs it (parent account: no sub-account here)
  await admin.from('profiles').update({ mobile_e164: '+447700900300' }).eq('id', rep.id);
  await admin.from('workspaces').update({ minute_balance_seconds: 600 }).eq('id', ws);
  const voice = async (userId) => {
    const url = `${URL_}/functions/v1/twilio-voice?ws=${ws}`;
    const params = { AccountSid: TWILIO_SID, CallSid: `CA${randomBytes(16).toString('hex')}`, From: `client:${userId.replace(/-/g, '_')}`, To: '+447700900300', Kind: 'test', CallId: randomUUID(), Practice: 'true' };
    const sig = createHmac('sha1', TWILIO_TOKEN).update(Object.keys(params).sort().reduce((a, k) => a + k + params[k], url)).digest('base64');
    return (await fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'x-twilio-signature': sig }, body: new URLSearchParams(params) })).text();
  };
  const twiml = await voice(rep.id);
  check('A rep with their own number calls from it', twiml.includes(`callerId="${repNumber}"`), twiml.match(/callerId="[^"]*"/)?.[0] ?? twiml.slice(0, 120));

  // ---- visibility: admins see everyone's calls; reps see their own ------------------------------------------
  const now = new Date().toISOString();
  const { data: calls } = await admin.from('calls').insert([
    { workspace_id: ws, user_id: rep.id, to_e164: '+447700900301', status: 'completed', outcome: 'meeting_booked', talk_seconds: 120, duration_seconds: 130, started_at: now },
    { workspace_id: ws, user_id: member.id, to_e164: '+447700900302', status: 'completed', outcome: 'no_answer', talk_seconds: 0, duration_seconds: 20, started_at: now },
  ]).select('id,user_id');
  const repCall = calls.find((c) => c.user_id === rep.id);
  await admin.from('recordings').insert({ workspace_id: ws, call_id: repCall.id, storage_path: `${ws}/${repCall.id}.mp3`, duration_seconds: 120 });
  const seenByMember = (await member.db.from('calls').select('id,user_id').eq('workspace_id', ws)).data ?? [];
  check('A member only sees their own calls', seenByMember.length >= 1 && seenByMember.every((c) => c.user_id === member.id), `${seenByMember.length} rows`);
  const recByMember = (await member.db.from('recordings').select('id').eq('workspace_id', ws)).data ?? [];
  check('…and not a colleague’s recordings', recByMember.length === 0);
  const seenByOwner = (await owner.db.from('calls').select('id,user_id').eq('workspace_id', ws)).data ?? [];
  check('Owners and admins see everyone’s calls', new Set(seenByOwner.map((c) => c.user_id)).size >= 2, `${seenByOwner.length} rows`);
  const recByAdmin = (await adminUser.db.from('recordings').select('id').eq('workspace_id', ws)).data ?? [];
  check('…and their recordings', recByAdmin.length === 1);
  const recByRep = (await rep.db.from('recordings').select('id').eq('workspace_id', ws)).data ?? [];
  check('A rep can hear their own recordings', recByRep.length === 1);
  const memberDelete = await member.db.from('calls').delete().eq('id', repCall.id).select('id');
  check('A member cannot delete a colleague’s call', (memberDelete.data ?? []).length === 0);

  // ---- team analytics ------------------------------------------------------------------------------------------
  const from = new Date(Date.now() - 86400000).toISOString();
  const to = new Date(Date.now() + 86400000).toISOString();
  const { data: stats } = await member.db.rpc('team_stats', { p_workspace_id: ws, p_from: from, p_to: to });
  const repStat = (stats ?? []).find((s) => s.user_id === rep.id);
  check('Team stats list every member, with totals even for members', (stats ?? []).length === 4 && repStat?.meetings === 1 && repStat?.talk_seconds === 120 && repStat?.recordings === 1 && repStat?.numbers?.[0]?.e164 === repNumber, JSON.stringify(repStat ?? {}).slice(0, 200));
  const { data: outsiderStats } = await outsider.db.rpc('team_stats', { p_workspace_id: ws, p_from: from, p_to: to });
  check('Another workspace gets nothing from team stats', (outsiderStats ?? []).length === 0);

  // ---- removing a member -------------------------------------------------------------------------------------
  const { data: lead } = await admin.from('people').insert({ workspace_id: ws, first_name: 'Owned', last_name: 'Lead', owner_id: rep.id, source: 'manual', created_by: owner.id }).select('id').single();
  const byMemberRemove = await member.fn('team', { action: 'remove', workspace_id: ws, user_id: rep.id });
  check('A member cannot remove anyone', byMemberRemove.status === 403);
  const ownerRemove = await adminUser.fn('team', { action: 'remove', workspace_id: ws, user_id: owner.id });
  check('Nobody can remove the owner', ownerRemove.status === 400 && ownerRemove.body.error === 'cannot_remove_owner', ownerRemove.body.error);
  const removed = await owner.fn('team', { action: 'remove', workspace_id: ws, user_id: rep.id, reassign_to: adminUser.id, release_numbers: false });
  check('Removing a rep hands their leads over and frees their number', removed.status === 200 && removed.body.leads_moved === 1 && removed.body.numbers?.[0]?.e164 === repNumber && removed.body.released?.length === 0, JSON.stringify(removed.body));
  const { data: leadNow } = await admin.from('people').select('owner_id').eq('id', lead.id).single();
  const { data: numNow } = await admin.from('phone_numbers').select('assigned_user_id,status').eq('id', repNum.id).single();
  const { data: gone } = await admin.from('workspace_members').select('user_id').eq('workspace_id', ws).eq('user_id', rep.id).maybeSingle();
  check('…their lead now belongs to the colleague, the number is unassigned (still owned), and they are out', leadNow.owner_id === adminUser.id && numNow.assigned_user_id === null && numNow.status === 'active' && !gone);
  const repAfter = (await rep.db.from('calls').select('id').eq('workspace_id', ws)).data ?? [];
  check('A removed rep can no longer see the workspace’s calls', repAfter.length === 0);

  // ---- ownership -----------------------------------------------------------------------------------------------
  const notOwner = await adminUser.db.rpc('transfer_ownership', { p_workspace_id: ws, p_new_owner: adminUser.id });
  check('Only the owner can transfer ownership', !!notOwner.error && /owners_only/.test(notOwner.error.message));
  const transfer = await owner.db.rpc('transfer_ownership', { p_workspace_id: ws, p_new_owner: adminUser.id });
  const { data: roles } = await admin.from('workspace_members').select('user_id,role').eq('workspace_id', ws).in('user_id', [owner.id, adminUser.id]);
  const roleOf = Object.fromEntries((roles ?? []).map((r) => [r.user_id, r.role]));
  check('Transferring ownership makes them owner and the old owner an admin', !transfer.error && roleOf[adminUser.id] === 'owner' && roleOf[owner.id] === 'admin', JSON.stringify(roleOf));

  // ---- isolation ---------------------------------------------------------------------------------------------
  const crossRemove = await outsider.fn('team', { action: 'remove', workspace_id: ws, user_id: member.id });
  check('Another workspace cannot remove our members', crossRemove.status === 403);
  const crossInvites = (await outsider.db.from('invitations').select('id').eq('workspace_id', ws)).data ?? [];
  check('Another workspace cannot see our invites', crossInvites.length === 0);
  void otherWs;
}

try {
  await main();
} catch (e) {
  check('run completed', false, e.message);
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

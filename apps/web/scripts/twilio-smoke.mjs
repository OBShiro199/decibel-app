#!/usr/bin/env node
// Twilio smoke test against production. Places no calls and writes nothing: for every workspace with
// a Twilio sub-account it checks the vault credentials and API key at Twilio, that the TwiML app and
// each active number point at the deployed functions, and that twilio-voice accepts a request signed
// with the sub-account token (the recording-notice TwiML) and refuses unsigned or wrongly signed ones.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/twilio-smoke.mjs
import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
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
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !SERVICE) {
  console.error('Needs .env.local and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}
const FUNCTIONS = `${URL_}/functions/v1`;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const twilio = async (creds, path) => {
  const res = await fetch(path.startsWith('http') ? path : `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}${path}`, {
    headers: { authorization: 'Basic ' + Buffer.from(`${creds.account_sid}:${creds.auth_token}`).toString('base64') },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};
const sign = (token, url, params) =>
  createHmac('sha1', token).update(Object.keys(params).sort().reduce((acc, k) => acc + k + params[k], url)).digest('base64');
const post = (url, params, signature) =>
  fetch(url, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', ...(signature ? { 'x-twilio-signature': signature } : {}) }, body: new URLSearchParams(params) });

const { data: workspaces, error } = await admin
  .from('workspaces')
  .select('id,name,twilio_subaccount_sid,twilio_twiml_app_sid,twilio_api_key_sid,twilio_account_mode,recording_notice_text')
  .not('twilio_subaccount_sid', 'is', null);
if (error) throw new Error(error.message);
check('Workspaces have their Twilio sub-accounts back', workspaces.length > 0, `${workspaces.length}`);

for (const ws of workspaces) {
  const tag = ws.id.slice(0, 8);
  const { data: creds } = await admin.rpc('get_workspace_twilio_secret', { p_workspace_id: ws.id });
  check(`[${tag}] Vault credentials load for the sub-account`, creds?.account_sid === ws.twilio_subaccount_sid && !!creds?.auth_token);
  if (!creds?.auth_token) continue;

  const acct = await twilio(creds, `https://api.twilio.com/2010-04-01/Accounts/${creds.account_sid}.json`);
  check(`[${tag}] The sub-account is active at Twilio`, acct.status === 200 && acct.body.status === 'active', `${acct.status} ${acct.body.status ?? acct.body.message ?? ''}`);
  const key = await twilio(creds, `/Keys/${ws.twilio_api_key_sid}.json`);
  check(`[${tag}] The API key for browser tokens exists`, key.status === 200, `${key.status}`);
  const app = await twilio(creds, `/Applications/${ws.twilio_twiml_app_sid}.json`);
  check(`[${tag}] The TwiML app sends browser calls to twilio-voice`, app.body.voice_url?.startsWith(`${FUNCTIONS}/twilio-voice`), app.body.voice_url);

  const { data: numbers } = await admin.from('phone_numbers').select('e164,twilio_sid,kind').eq('workspace_id', ws.id).eq('status', 'active').neq('kind', 'verified_caller_id');
  for (const n of numbers ?? []) {
    const num = await twilio(creds, `/IncomingPhoneNumbers/${n.twilio_sid}.json`);
    check(`[${tag}] ${n.e164} is rented on Twilio and rings twilio-inbound`, num.status === 200 && num.body.voice_url?.startsWith(`${FUNCTIONS}/twilio-inbound`), `${num.status} ${num.body.voice_url ?? num.body.message ?? ''}`);
  }

  const url = `${FUNCTIONS}/twilio-voice?ws=${ws.id}&whisper=notice`;
  const params = { AccountSid: creds.account_sid, CallSid: 'CAsmoke00000000000000000000000000', From: '+15005550006', To: '+15005550006' };
  const ok = await post(url, params, sign(creds.auth_token, url, params));
  const twiml = await ok.text();
  check(`[${tag}] twilio-voice accepts a request signed by the sub-account`, ok.status === 200 && twiml.includes('<Say') , `${ok.status} ${twiml.slice(0, 80)}`);
  const unsigned = await post(url, params);
  check(`[${tag}] …and refuses an unsigned one`, unsigned.status === 403, `${unsigned.status}`);
  const forged = await post(url, params, sign('not-the-token', url, params));
  check(`[${tag}] …and one signed with the wrong token`, forged.status === 403, `${forged.status}`);
}

for (const fn of ['twilio-token', 'twilio-numbers']) {
  const res = await fetch(`${FUNCTIONS}/${fn}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  check(`${fn} is deployed and needs a signed-in user`, res.status === 401, `${res.status}`);
}
for (const fn of ['telnyx-call', 'telnyx-webhook']) {
  const res = await fetch(`${FUNCTIONS}/${fn}`, { method: 'POST', body: '{}' });
  check(`${fn} is gone`, res.status === 404, `${res.status}`);
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

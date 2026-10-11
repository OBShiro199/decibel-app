#!/usr/bin/env node
// Creates (or updates, if they exist) the account-level Telnyx resources Decibel needs, then
// prints the secrets to set on the Supabase functions. Safe to re-run.
//
//   node scripts/telnyx-setup.mjs            # reads TELNYX_API_KEY from supabase/functions/.env
//
// 1. Outbound voice profile "Decibel outbound": UK and EU destinations only, a per-minute rate cap
//    (blocks premium-rate numbers) and a daily spend limit.
// 2. Call Control application "Decibel voice": owns purchased numbers, dials the far leg of every
//    call, sends all call webhooks to the telnyx-webhook function.
// 3. Credential connection "Decibel browser calling": what reps' browsers log in to. Its outbound
//    calls are parked (never routed to the number the browser asked for) and announced to the same
//    webhook, so the server decides every destination. SIP URI calls are internal only.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const envFile = join(root, 'supabase', 'functions', '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}
const KEY = process.env.TELNYX_API_KEY;
if (!KEY) {
  console.error('TELNYX_API_KEY is not set.');
  process.exit(2);
}
const WEBHOOK = process.env.TELNYX_WEBHOOK_URL ?? 'https://fkjwglvztyyerewldnty.supabase.co/functions/v1/telnyx-webhook';
const DESTINATIONS = ['GB', 'IE', 'NL', 'DE', 'FR'];

async function api(method, path, body) {
  const res = await fetch(`https://api.telnyx.com/v2${path}`, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text.slice(0, 400)}`);
  return text ? JSON.parse(text).data : null;
}
const findBy = async (path, field, value) => ((await api('GET', `${path}?page[size]=250`)) ?? []).find((r) => r[field] === value);

// 1. outbound voice profile
const ovpBody = {
  name: 'Decibel outbound',
  traffic_type: 'conversational',
  service_plan: 'global',
  enabled: true,
  whitelisted_destinations: DESTINATIONS,
  max_destination_rate: 0.1, // USD per minute: UK landlines and main mobile networks pass, premium rate does not
  daily_spend_limit: '50.00',
  daily_spend_limit_enabled: true,
  call_recording: { call_recording_type: 'none' }, // recordings are started per call by Call Control
  tags: ['decibel'],
};
let ovp = await findBy('/outbound_voice_profiles', 'name', ovpBody.name);
ovp = ovp ? await api('PATCH', `/outbound_voice_profiles/${ovp.id}`, ovpBody) : await api('POST', '/outbound_voice_profiles', ovpBody);
console.log(`outbound voice profile  ${ovp.id}  (${ovp.whitelisted_destinations.join(', ')})`);

// 2. Call Control application
const appBody = {
  application_name: 'Decibel voice',
  webhook_event_url: WEBHOOK,
  webhook_api_version: '2',
  webhook_timeout_secs: 10,
  anchorsite_override: 'London, UK',
  active: true,
  call_cost_in_webhooks: false,
  dtmf_type: 'RFC 2833',
  first_command_timeout: true,
  first_command_timeout_secs: 30,
  outbound: { outbound_voice_profile_id: ovp.id, channel_limit: null },
  inbound: { channel_limit: null, sip_subdomain_receive_settings: 'only_my_connections' },
};
let app = await findBy('/call_control_applications', 'application_name', appBody.application_name);
app = app ? await api('PATCH', `/call_control_applications/${app.id}`, appBody) : await api('POST', '/call_control_applications', appBody);
console.log(`call control app        ${app.id}  → ${app.webhook_event_url}`);

// 3. credential connection for browser calling
const name = 'Decibel browser calling';
let conn = await findBy('/credential_connections', 'connection_name', name);
const connBody = {
  connection_name: name,
  active: true,
  anchorsite_override: 'London, UK',
  webhook_event_url: WEBHOOK,
  webhook_api_version: '2',
  webhook_timeout_secs: 10,
  sip_uri_calling_preference: 'internal',
  default_on_hold_comfort_noise_enabled: true,
  dtmf_type: 'RFC 2833',
  encode_contact_header_enabled: true,
  outbound: {
    call_parking_enabled: true, // the server decides where the call goes
    outbound_voice_profile_id: ovp.id,
    localization: 'GB',
    instant_ringback_enabled: true, // the rep hears ringing at once while the server dials
  },
  inbound: { simultaneous_ringing: 'disabled' },
};
if (!conn) {
  conn = await api('POST', '/credential_connections', { ...connBody, user_name: `decibel${randomBytes(6).toString('hex')}`, password: randomBytes(24).toString('base64url') });
} else {
  conn = await api('PATCH', `/credential_connections/${conn.id}`, connBody);
}
console.log(`credential connection   ${conn.id}  (parking ${conn.outbound?.call_parking_enabled ? 'on' : 'OFF'}, sip uri ${conn.sip_uri_calling_preference})`);

console.log(`\nSet these Supabase secrets:\nTELNYX_CC_APP_ID=${app.id}\nTELNYX_CREDENTIAL_CONNECTION_ID=${conn.id}\nTELNYX_OVP_ID=${ovp.id}`);

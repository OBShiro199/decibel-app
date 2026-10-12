// POST with the user's JWT, before the browser places a call:
//   { workspace_id, call_id, kind: 'standard' | 'test', person_id?, list_id?, to?, test_route?, practice?, record?, to_user_id? }
//   -> { call_id, destination } | { blocked: reason }
//
// Every check happens here, before anything rings, and the call row is written with the number
// the SERVER chose. The browser then places its Telnyx call carrying the call id in a SIP header;
// that leg is parked by Telnyx and telnyx-webhook dials the stored destination (never anything the
// browser sends). A call id can start exactly one call, within 2 minutes.
//
//   standard     a person in the workspace: can_dial_for checks (TPS, DNC, minutes, trial), and the
//                number dialled is the one stored on the person
//   test_route   power-dialler testing: a real call in every respect, but it rings `to`, which must
//                be the rep's own mobile or one of the workspace's numbers
//   test         setup test and practice calls: `to` must be the rep's own mobile or a workspace number
//   to_user_id   ring a teammate's browser (internal, free): used by the setup test with no number yet
import { admin, corsHeaders, fail, getRole, getUser, json } from '../_shared/http.ts';
import { ensureCredential, sipUri, telnyxConfigured } from '../_shared/telnyx.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const E164 = /^\+[1-9]\d{6,14}$/;
/** Where the browser's parked leg "dials": internal-only SIP, so it can never reach the phone network. */
const PARKED_DESTINATION = 'sip:decibel-parked@sip.telnyx.com';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return fail('method_not_allowed', 405);
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  if (!telnyxConfigured()) return fail('telephony_not_configured', 503);
  const input = await req.json().catch(() => ({}));
  const wsId = String(input.workspace_id ?? '');
  const callId = String(input.call_id ?? '');
  if (!UUID.test(wsId) || !UUID.test(callId)) return fail('bad_request');
  const kind: 'standard' | 'test' = input.kind === 'test' ? 'test' : 'standard';
  const personId = UUID.test(String(input.person_id ?? '')) ? String(input.person_id) : null;
  const listId = UUID.test(String(input.list_id ?? '')) ? String(input.list_id) : null;
  const toUserId = UUID.test(String(input.to_user_id ?? '')) ? String(input.to_user_id) : null;
  const testRoute = kind === 'standard' && input.test_route === true;
  const practice = input.practice === true;
  const requested = typeof input.to === 'string' ? input.to.trim() : '';

  const db = admin();
  const [role, rate, wsRes, numbersRes, existing] = await Promise.all([
    getRole(user.id, wsId),
    db.rpc('check_rate_limit', { p_key: `telnyx-call:${user.id}`, p_limit: 40, p_window_seconds: 60 }),
    db.from('workspaces').select('id,recording_policy,recording_notice_text,minute_balance_seconds,stripe_customer_id').eq('id', wsId).maybeSingle(),
    db.from('phone_numbers').select('id,e164,is_default,assigned_user_id').eq('workspace_id', wsId).eq('status', 'active').eq('provider', 'telnyx'),
    db.from('calls').select('id').eq('id', callId).maybeSingle(),
  ]);
  if (!role) return fail('forbidden', 403);
  if (rate.data === false) return fail('rate_limited', 429);
  const ws = wsRes.data;
  if (!ws) return fail('workspace_not_found', 404);
  if (existing.data) return fail('call_id_used', 409);

  // caller ID: the rep's own number if they have one, else the workspace default, else any active number
  const numbers = numbersRes.data ?? [];
  const caller = numbers.find((n) => n.assigned_user_id === user.id) ?? numbers.find((n) => n.is_default) ?? numbers[0] ?? null;

  let to = '';
  let blocked: string | null = null;
  const own = async () => {
    const { data } = await db.from('profiles').select('mobile_e164').eq('id', user.id).maybeSingle();
    return new Set([data?.mobile_e164, ...numbers.map((n) => n.e164)].filter(Boolean) as string[]);
  };

  if (toUserId) {
    // a teammate's browser: they must be a member of this workspace
    const { data: member } = await db.from('workspace_members').select('user_id').eq('workspace_id', wsId).eq('user_id', toUserId).maybeSingle();
    if (!member || toUserId === user.id) blocked = 'forbidden';
    else to = sipUri((await ensureCredential(toUserId)).sip_username);
  } else if (kind === 'standard') {
    if (!personId) blocked = 'person_not_found';
    else {
      const [check, person] = await Promise.all([
        db.rpc('can_dial_for', { p_workspace_id: wsId, p_person_id: personId, p_user_id: user.id }).single(),
        db.from('people').select('mobile_e164').eq('id', personId).eq('workspace_id', wsId).maybeSingle(),
      ]);
      const c = check.data as { allowed: boolean; reason: string | null } | null;
      if (!c?.allowed) blocked = c?.reason ?? 'forbidden';
      else if (testRoute) {
        if (!(await own()).has(requested)) blocked = 'test_number_not_yours';
        else to = requested;
      } else to = person.data?.mobile_e164 ?? ''; // never the browser's number
    }
  } else {
    if (ws.minute_balance_seconds <= 0 && !ws.stripe_customer_id) blocked = 'no_minutes';
    else if (!(await own()).has(requested)) blocked = 'test_number_not_yours';
    else to = requested;
  }
  if (!blocked && !toUserId && !E164.test(to)) blocked = 'no_mobile';
  // every number dialled (test and test-routed calls too) is checked against the DNC list
  if (!blocked && !toUserId) {
    const { data: listed } = await db.from('dnc_entries').select('id').eq('workspace_id', wsId).eq('e164', to).maybeSingle();
    if (listed) blocked = 'dnc_list';
  }
  if (!blocked && !toUserId && !caller) blocked = 'no_caller_id';

  const base = {
    id: callId,
    workspace_id: wsId,
    user_id: user.id,
    from_user_id: user.id,
    person_id: personId,
    list_id: listId,
    kind,
    direction: 'outbound',
  };
  if (blocked) {
    await db.from('calls').insert({ ...base, to_e164: to || requested || 'unknown', status: 'blocked', blocked_reason: blocked, ended_at: new Date().toISOString() });
    return json({ blocked });
  }

  const record = kind === 'standard' && (ws.recording_policy === 'always' || (ws.recording_policy === 'rep_choice' && input.record === true));
  const { error } = await db.from('calls').insert({
    ...base,
    phone_number_id: caller?.id ?? null,
    to_e164: to,
    from_e164: caller?.e164 ?? null,
    status: 'queued',
    recording_consent_played: record,
    practice,
  });
  if (error) {
    console.error('telnyx-call insert', error.message);
    return fail('call_failed', 500);
  }
  return json({ call_id: callId, destination: PARKED_DESTINATION, practice });
});

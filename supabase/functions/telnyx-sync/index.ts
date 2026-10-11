// Every 10 minutes (pg_cron, migration 0025):
//   - follows pending number orders and activates approved numbers (or marks them rejected)
//   - refreshes requirement-group statuses
//   - fails calls stuck before connecting (the browser leg never arrived) and forgets webhook ids
//     older than a week
import { admin, corsHeaders, fail, isCron, json } from '../_shared/http.ts';
import { syncPendingNumber, syncRequirementGroups } from '../_shared/numbers.ts';
import { telnyxConfigured } from '../_shared/telnyx.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (!(await isCron(req))) return fail('unauthorized', 401);
  const db = admin();
  const out = { numbers: 0, activated: 0, rejected: 0, stale_calls: 0 };

  if (telnyxConfigured()) {
    const { data: pending } = await db.from('phone_numbers').select('id,workspace_id,e164,number_order_id,status').eq('status', 'pending_review').eq('provider', 'telnyx').limit(200);
    for (const row of pending ?? []) {
      out.numbers++;
      const now = await syncPendingNumber(db, row).catch((e) => {
        console.warn('telnyx-sync number', row.e164, (e as Error).message);
        return 'pending_review';
      });
      if (now === 'active') out.activated++;
      if (now === 'rejected') out.rejected++;
    }
    await syncRequirementGroups(db);
  }

  // a call row whose browser leg never reached Telnyx
  const cutoff = new Date(Date.now() - 10 * 60_000).toISOString();
  const { data: stale } = await db
    .from('calls')
    .update({ status: 'failed', hangup_cause: 'never_connected', ended_at: new Date().toISOString() })
    .eq('status', 'queued')
    .lt('created_at', cutoff)
    .select('id');
  out.stale_calls = stale?.length ?? 0;
  await db.from('telnyx_events').delete().lt('received_at', new Date(Date.now() - 7 * 86400_000).toISOString());

  return json(out);
});

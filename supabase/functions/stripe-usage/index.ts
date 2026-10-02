// Nightly: report yesterday's outbound call minutes per workspace to Stripe
// metered billing. Schedule with pg_cron / Supabase cron at 02:00 Europe/London,
// Authorization: Bearer <CRON_SECRET>.
import { admin, fail, isCron, json } from '../_shared/http.ts';
import { stripe, STRIPE_KEY } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (!(await isCron(req))) return fail('unauthorized', 401);
  if (!STRIPE_KEY) return fail('stripe_not_configured', 503);
  const db = admin();
  const eventName = Deno.env.get('STRIPE_METER_EVENT_NAME') ?? 'call_minutes';

  const end = new Date();
  end.setUTCHours(0, 0, 0, 0);
  const start = new Date(end.getTime() - 86400000);
  const day = start.toISOString().slice(0, 10);

  const { data: workspaces } = await db
    .from('workspaces')
    .select('id,stripe_customer_id,plan')
    .not('stripe_customer_id', 'is', null)
    .neq('plan', 'trial');

  const results: Record<string, unknown>[] = [];
  for (const ws of workspaces ?? []) {
    const { data: done } = await db.from('usage_reports').select('day').eq('workspace_id', ws.id).eq('day', day).maybeSingle();
    if (done) continue;
    const { data: calls } = await db
      .from('calls')
      .select('duration_seconds')
      .eq('workspace_id', ws.id)
      .eq('direction', 'outbound')
      .gte('started_at', start.toISOString())
      .lt('started_at', end.toISOString());
    const seconds = (calls ?? []).reduce((s, c) => s + (c.duration_seconds ?? 0), 0);
    const minutes = Math.ceil(seconds / 60);
    try {
      if (minutes > 0) {
        await stripe('POST', '/billing/meter_events', {
          event_name: eventName,
          identifier: `${ws.id}:${day}`,
          timestamp: Math.floor(start.getTime() / 1000) + 43200,
          payload: { stripe_customer_id: ws.stripe_customer_id, value: minutes },
        });
      }
      await db.from('usage_reports').insert({ workspace_id: ws.id, day, seconds });
      results.push({ workspace_id: ws.id, minutes });
    } catch (e) {
      results.push({ workspace_id: ws.id, error: (e as Error).message });
    }
  }
  return json({ day, results });
});

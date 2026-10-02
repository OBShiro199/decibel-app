// Stripe webhooks keep subscriptions, plan and credits in sync.
import { admin } from '../_shared/http.ts';
import { PLAN_CREDITS, planForPrice, stripe, verifyStripeSignature } from '../_shared/stripe.ts';

const STATUS: Record<string, string> = {
  trialing: 'trialing',
  active: 'active',
  past_due: 'past_due',
  canceled: 'canceled',
  unpaid: 'past_due',
  paused: 'paused',
  incomplete: 'incomplete',
  incomplete_expired: 'canceled',
};

const ts = (s?: number | null) => (s ? new Date(s * 1000).toISOString() : null);

async function workspaceForCustomer(customerId: string): Promise<string | null> {
  const { data } = await admin().from('workspaces').select('id').eq('stripe_customer_id', customerId).maybeSingle();
  return data?.id ?? null;
}

async function syncSubscription(sub: any) {
  const db = admin();
  const wsId = sub.metadata?.workspace_id ?? (await workspaceForCustomer(sub.customer));
  if (!wsId) return;
  const item = sub.items?.data?.[0];
  const plan = planForPrice(item?.price?.id) ?? sub.metadata?.plan ?? 'starter';
  const status = STATUS[sub.status] ?? 'incomplete';
  await db.from('subscriptions').upsert(
    {
      workspace_id: wsId,
      stripe_subscription_id: sub.id,
      stripe_price_id: item?.price?.id ?? null,
      plan,
      status,
      seats: Math.max(1, item?.quantity ?? 1),
      current_period_start: ts(item?.current_period_start ?? sub.current_period_start),
      current_period_end: ts(item?.current_period_end ?? sub.current_period_end),
      cancel_at_period_end: !!sub.cancel_at_period_end,
    },
    { onConflict: 'workspace_id' },
  );
  const live = ['trialing', 'active', 'past_due'].includes(status);
  await db
    .from('workspaces')
    .update({ plan: live ? plan : 'trial', stripe_customer_id: sub.customer })
    .eq('id', wsId);
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const payload = await req.text();
  if (!secret || !(await verifyStripeSignature(payload, req.headers.get('stripe-signature') ?? '', secret))) {
    return new Response('invalid signature', { status: 400 });
  }
  const event = JSON.parse(payload);
  const obj = event.data.object;
  const db = admin();

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const wsId = obj.metadata?.workspace_id;
        if (!wsId) break;
        if (obj.customer) await db.from('workspaces').update({ stripe_customer_id: obj.customer }).eq('id', wsId);
        if (obj.mode === 'payment' && obj.payment_status === 'paid' && obj.metadata?.credits) {
          // idempotent on the checkout session id
          const { data: seen } = await db
            .from('credit_transactions')
            .select('id')
            .eq('workspace_id', wsId)
            .eq('note', `stripe:${obj.id}`)
            .maybeSingle();
          if (!seen) {
            await db.from('credit_transactions').insert({
              workspace_id: wsId,
              user_id: obj.metadata.user_id ?? null,
              delta: Number(obj.metadata.credits),
              reason: 'purchase',
              note: `stripe:${obj.id}`,
            });
          }
        }
        if (obj.mode === 'subscription' && obj.subscription) {
          await syncSubscription(await stripe('GET', `/subscriptions/${obj.subscription}`));
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(obj);
        break;
      case 'invoice.paid': {
        // monthly credit grant per seat on every paid subscription invoice
        if (!['subscription_create', 'subscription_cycle'].includes(obj.billing_reason)) break;
        const wsId = await workspaceForCustomer(obj.customer);
        if (!wsId) break;
        const { data: sub } = await db.from('subscriptions').select('plan,seats').eq('workspace_id', wsId).maybeSingle();
        const grant = (PLAN_CREDITS[sub?.plan ?? ''] ?? 0) * (sub?.seats ?? 1);
        if (grant > 0 && obj.amount_paid > 0) {
          const { data: seen } = await db
            .from('credit_transactions')
            .select('id')
            .eq('workspace_id', wsId)
            .eq('note', `stripe:${obj.id}`)
            .maybeSingle();
          if (!seen) {
            await db.from('credit_transactions').insert({
              workspace_id: wsId,
              delta: grant,
              reason: 'subscription_grant',
              note: `stripe:${obj.id}`,
            });
          }
        }
        break;
      }
    }
  } catch (e) {
    console.error('stripe-webhook', event.type, (e as Error).message);
    return new Response('handler error', { status: 500 });
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'content-type': 'application/json' } });
});

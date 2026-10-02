// App-facing Stripe actions. POST { workspace_id, action, ... } with the user's JWT.
//   checkout   { plan: 'starter'|'growth', interval: 'monthly'|'annual' } -> { url }   (owner)
//   credits    { pack: '500'|'2000'|'10000' }                             -> { url }   (owner/admin)
//   portal     {}                                                         -> { url }   (owner)
//   sync_seats {}                                                         -> { seats } (owner/admin)
//   invoices   {}                                                         -> { invoices } (owner/admin)
import { admin, APP_URL, corsHeaders, fail, getRole, getUser, isAdmin, json } from '../_shared/http.ts';
import { CREDIT_PACKS, PRICES, stripe, STRIPE_KEY } from '../_shared/stripe.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const input = await req.json().catch(() => ({}));
  const { workspace_id, action } = input;
  if (!workspace_id || !action) return fail('workspace_id and action required');
  const role = await getRole(user.id, workspace_id);
  if (!isAdmin(role)) return fail('forbidden', 403);
  if (!STRIPE_KEY) return fail('stripe_not_configured', 503);

  const db = admin();
  const { data: ws } = await db
    .from('workspaces')
    .select('id,name,stripe_customer_id,plan,trial_ends_at')
    .eq('id', workspace_id)
    .single();
  if (!ws) return fail('workspace_not_found', 404);

  const seats = async () => {
    const { count } = await db
      .from('workspace_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('workspace_id', ws.id);
    return Math.max(1, count ?? 1);
  };

  const customer = async (): Promise<string> => {
    if (ws.stripe_customer_id) return ws.stripe_customer_id;
    const c = await stripe<{ id: string }>('POST', '/customers', {
      name: ws.name,
      email: user.email,
      metadata: { workspace_id: ws.id },
    });
    await db.from('workspaces').update({ stripe_customer_id: c.id }).eq('id', ws.id);
    return c.id;
  };

  try {
    switch (action) {
      case 'checkout': {
        if (role !== 'owner') return fail('owner_only', 403);
        const plan = input.plan as 'starter' | 'growth';
        const interval = input.interval === 'annual' ? 'annual' : 'monthly';
        const price = PRICES[plan]?.[interval];
        if (!price) return fail('price_not_configured', 503);
        const trialEnd = Math.floor(new Date(ws.trial_ends_at).getTime() / 1000);
        const session = await stripe<{ url: string }>('POST', '/checkout/sessions', {
          mode: 'subscription',
          customer: await customer(),
          line_items: { 0: { price, quantity: await seats() } },
          subscription_data: {
            metadata: { workspace_id: ws.id, plan },
            // keep whatever is left of the 14-day trial (Stripe needs > 48h)
            trial_end: ws.plan === 'trial' && trialEnd - Date.now() / 1000 > 172800 ? trialEnd : undefined,
          },
          metadata: { workspace_id: ws.id, plan },
          allow_promotion_codes: true,
          success_url: `${APP_URL}/app/settings/billing?checkout=success`,
          cancel_url: `${APP_URL}/app/settings/plans?checkout=cancelled`,
        });
        return json({ url: session.url });
      }
      case 'credits': {
        const pack = CREDIT_PACKS[String(input.pack)];
        if (!pack?.price) return fail('price_not_configured', 503);
        const session = await stripe<{ url: string }>('POST', '/checkout/sessions', {
          mode: 'payment',
          customer: await customer(),
          line_items: { 0: { price: pack.price, quantity: 1 } },
          metadata: { workspace_id: ws.id, credits: pack.credits, user_id: user.id },
          success_url: `${APP_URL}/app/settings/billing?credits=success`,
          cancel_url: `${APP_URL}/app/settings/billing?credits=cancelled`,
        });
        return json({ url: session.url });
      }
      case 'portal': {
        if (role !== 'owner') return fail('owner_only', 403);
        const session = await stripe<{ url: string }>('POST', '/billing_portal/sessions', {
          customer: await customer(),
          return_url: `${APP_URL}/app/settings/billing`,
        });
        return json({ url: session.url });
      }
      case 'sync_seats': {
        const n = await seats();
        const { data: sub } = await db
          .from('subscriptions')
          .select('stripe_subscription_id,seats')
          .eq('workspace_id', ws.id)
          .maybeSingle();
        if (sub?.stripe_subscription_id && sub.seats !== n) {
          const live = await stripe<{ items: { data: { id: string }[] } }>('GET', `/subscriptions/${sub.stripe_subscription_id}`);
          const item = live.items.data[0]?.id;
          if (item) {
            await stripe('POST', `/subscriptions/${sub.stripe_subscription_id}`, {
              items: { 0: { id: item, quantity: n } },
              proration_behavior: 'create_prorations',
            });
            await db.from('subscriptions').update({ seats: n }).eq('workspace_id', ws.id);
          }
        }
        return json({ seats: n });
      }
      case 'invoices': {
        if (!ws.stripe_customer_id) return json({ invoices: [] });
        const list = await stripe<{ data: any[] }>('GET', '/invoices', { customer: ws.stripe_customer_id, limit: 12 });
        return json({
          invoices: list.data.map((i) => ({
            id: i.id,
            number: i.number,
            created: i.created,
            total: i.total,
            currency: i.currency,
            status: i.status,
            url: i.hosted_invoice_url,
          })),
        });
      }
      default:
        return fail('unknown action');
    }
  } catch (e) {
    console.error('billing', action, (e as Error).message);
    return fail((e as Error).message, 502);
  }
});

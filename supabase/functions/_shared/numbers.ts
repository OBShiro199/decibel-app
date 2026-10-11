// Telnyx number lifecycle shared by telnyx-numbers (owner actions) and telnyx-sync (every 10 min).
//
// UK numbers need regulatory details (Telnyx requirement groups: company website, contact, use
// case, an address, a company certificate or ID, and a recent proof of address). A workspace files
// them once per number type; orders reference the group and go active after Telnyx's review
// (about 72 hours; minutes once a group is approved). phone_numbers rows stay 'pending_review'
// with the order id until then.
import { APP_URL, admin } from './http.ts';
import { layout, p, sendEmail } from './email.ts';
import { CC_APP_ID, telnyx } from './telnyx.ts';

type Db = ReturnType<typeof admin>;
export type NumberType = 'local' | 'national' | 'mobile';

interface Requirement {
  id: string;
  label?: string;
  name?: string;
  field_type: string;
  description?: string;
}

/** The GB requirement ids for a number type, matched to the fields we collect. */
export async function gbRequirements(type: NumberType) {
  const data = await telnyx<{ regulatory_requirements: Requirement[] }[]>(
    'GET',
    `/regulatory_requirements?filter[country_code]=GB&filter[phone_number_type]=${type}&filter[action]=ordering`,
  );
  const reqs = (Array.isArray(data) ? data : []).flatMap((d) => d.regulatory_requirements ?? []);
  const find = (type: string, re: RegExp) => reqs.find((r) => r.field_type === type && re.test(`${r.label ?? r.name ?? ''} ${r.description ?? ''}`))?.id;
  const ids = {
    website: find('string', /website/i),
    contact: find('string', /contact information/i),
    useCase: find('string', /use case/i),
    address: reqs.find((r) => r.field_type === 'address_id')?.id,
    identity: find('number_order_document_id', /passport|registration certificate|identity/i),
    addressProof: find('number_order_document_id', /proof of address|utility|bill/i),
  };
  const known = new Set(Object.values(ids).filter(Boolean));
  const unknown = reqs.filter((r) => !known.has(r.id));
  return { ids, unknown, all: reqs };
}

const NUMBER_OK = ['active'];

/**
 * Follows one pending number: when its order succeeded and the number is active, point it at the
 * Call Control app, tag it with the workspace and mark it active (emailing the owner); when it
 * failed, mark it rejected with Telnyx's reason.
 */
export async function syncPendingNumber(db: Db, row: { id: string; workspace_id: string; e164: string; number_order_id: string | null; status: string }) {
  if (!row.number_order_id) return row.status;
  const order = await telnyx<{ status: string; phone_numbers?: { phone_number: string; status: string; requirements_status?: string }[] }>(
    'GET',
    `/number_orders/${row.number_order_id}`,
  );
  const item = order.phone_numbers?.find((n) => n.phone_number === row.e164);
  const failed = order.status === 'failure' || order.status === 'cancelled' || item?.status === 'failure' || item?.requirements_status === 'cancelled';
  if (failed) {
    const detail = item?.requirements_status === 'cancelled' ? 'The order was cancelled: the details were not completed in time.' : 'Telnyx could not approve this number.';
    await db.from('phone_numbers').update({ status: 'rejected', status_detail: detail }).eq('id', row.id);
    await notifyOwner(db, row.workspace_id, 'rejected', row.e164, detail);
    return 'rejected';
  }
  const found = await telnyx<{ id: string; status: string }[]>('GET', `/phone_numbers?filter[phone_number]=${encodeURIComponent(row.e164)}`);
  const num = Array.isArray(found) ? found[0] : null;
  if (!num || !NUMBER_OK.includes(num.status)) {
    const detail = item?.requirements_status ? `Telnyx review: ${item.requirements_status.replace(/-/g, ' ')}` : null;
    if (detail) await db.from('phone_numbers').update({ status_detail: detail }).eq('id', row.id);
    return 'pending_review';
  }
  await telnyx('PATCH', `/phone_numbers/${num.id}`, { connection_id: CC_APP_ID, customer_reference: row.workspace_id, tags: [`ws-${row.workspace_id}`] });
  const { count } = await db.from('phone_numbers').select('id', { count: 'exact', head: true }).eq('workspace_id', row.workspace_id).eq('is_default', true);
  await db
    .from('phone_numbers')
    .update({ status: 'active', provider_id: num.id, status_detail: null, is_default: (count ?? 0) === 0, purchased_at: new Date().toISOString() })
    .eq('id', row.id);
  await notifyOwner(db, row.workspace_id, 'active', row.e164);
  return 'active';
}

async function notifyOwner(db: Db, workspaceId: string, what: 'active' | 'rejected', e164: string, reason?: string) {
  const { data: ws } = await db.from('workspaces').select('name,created_by').eq('id', workspaceId).single();
  if (!ws?.created_by) return;
  const { data: owner } = await db.from('profiles').select('email').eq('id', ws.created_by).single();
  if (!owner?.email) return;
  const url = `${APP_URL}/app/settings/phone-numbers`;
  if (what === 'active') {
    await sendEmail(owner.email, 'Your Decibel number is active', layout('Your number is ready', p(`${e164} is now live for <b>${ws.name}</b>. You can start calling from it.`), { label: 'Open Decibel', url }));
  } else {
    await sendEmail(
      owner.email,
      'We need another look at your number application',
      layout('Your number could not be approved', p(`${reason ?? ''} Check your business details and documents, then submit again. You can keep calling from a verified number meanwhile.`), {
        label: 'Review details',
        url,
      }),
    );
  }
}

/** Refreshes a workspace's requirement groups from Telnyx (status and reviewer comments). */
export async function syncRequirementGroups(db: Db, workspaceId?: string) {
  let q = db.from('number_requirement_groups').select('id,telnyx_group_id,status').neq('status', 'approved');
  if (workspaceId) q = q.eq('workspace_id', workspaceId);
  const { data } = await q.limit(100);
  for (const g of data ?? []) {
    try {
      const group = await telnyx<{ status: string }>('GET', `/requirement_groups/${g.telnyx_group_id}`);
      if (group?.status && group.status !== g.status) {
        await db.from('number_requirement_groups').update({ status: group.status, updated_at: new Date().toISOString() }).eq('id', g.id);
      }
    } catch (err) {
      console.warn('requirement group sync', g.telnyx_group_id, (err as Error).message);
    }
  }
}

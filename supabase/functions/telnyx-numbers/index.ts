// Owner/admin actions for phone numbers, on Telnyx. POST { workspace_id, action, ... } with the user's JWT.
//   search            { type: 'local'|'national'|'mobile', area? }  -> { numbers: [{ e164, friendly, locality, upfront, monthly, currency }] }
//   requirements      { type }                                       -> { group: { status, business_name } | null }
//   buy               { e164, type }                                 -> { number } | { needs_documents: true }
//   submit_documents  { e164, type, business: {...}, documents: {identity, address_proof} } -> { number } (pending review)
//   verify_start      { e164, method?: 'sms'|'call' }                -> { sent: true }
//   verify_check      { e164, code }                                 -> { verified, number? }
//   refresh           {}                                             -> { numbers }   (follow pending orders now)
//   set_default { id }    assign { id, user_id }    release { id }
import { admin, corsHeaders, fail, getRole, getUser, isAdmin, json } from '../_shared/http.ts';
import { normalizePhone } from '../_shared/phone.ts';
import { gbRequirements, syncPendingNumber, syncRequirementGroups, type NumberType } from '../_shared/numbers.ts';
import { CC_APP_ID, telnyx, TelnyxError, telnyxConfigured } from '../_shared/telnyx.ts';

const KIND: Record<NumberType, string> = { local: 'local', national: 'national', mobile: 'mobile' };
const TYPES = new Set(['local', 'national', 'mobile']);
const clip = (v: unknown, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const input = await req.json().catch(() => ({}));
  const { workspace_id, action } = input;
  if (!workspace_id || !action) return fail('workspace_id and action required');
  if (!isAdmin(await getRole(user.id, workspace_id))) return fail('forbidden', 403);
  if (!telnyxConfigured()) return fail('telephony_not_configured', 503);
  const db = admin();
  const type = (TYPES.has(input.type) ? input.type : 'local') as NumberType;

  const hasDefault = async () => {
    const { count } = await db.from('phone_numbers').select('id', { count: 'exact', head: true }).eq('workspace_id', workspace_id).eq('is_default', true);
    return (count ?? 0) > 0;
  };

  /** Orders a number against the workspace's requirement group and records it as pending. */
  const order = async (e164: string, groupId: string) => {
    const placed = await telnyx<{ id: string; status: string }>('POST', '/number_orders', {
      phone_numbers: [{ phone_number: e164, requirement_group_id: groupId }],
      connection_id: CC_APP_ID,
      customer_reference: workspace_id,
    });
    const { data, error } = await db
      .from('phone_numbers')
      .upsert(
        {
          workspace_id,
          e164,
          friendly_name: e164,
          country_code: 'GB',
          kind: KIND[type],
          provider: 'telnyx',
          status: 'pending_review',
          number_order_id: placed.id,
          requirement_group_id: groupId,
          assigned_user_id: user.id,
          monthly_cost_pence: type === 'mobile' ? 160 : 80,
          status_detail: 'Ordered. Telnyx reviews UK numbers, usually within 72 hours.',
          released_at: null,
        },
        { onConflict: 'workspace_id,e164' },
      )
      .select()
      .single();
    if (error) throw new TelnyxError(error.message, 500);
    // an already-approved group can activate within minutes: check straight away
    const now = await syncPendingNumber(db, { id: data.id, workspace_id, e164, number_order_id: placed.id, status: 'pending_review' }).catch(() => 'pending_review');
    const { data: fresh } = await db.from('phone_numbers').select('*').eq('id', data.id).single();
    return { number: fresh ?? data, status: now };
  };

  try {
    switch (action) {
      case 'search': {
        const area = clip(input.area, 6).replace(/\D/g, '');
        const q = new URLSearchParams({
          'filter[country_code]': 'GB',
          'filter[phone_number_type]': type,
          'filter[features][]': 'voice',
          'filter[limit]': '12',
          'filter[exclude_held_numbers]': 'true',
        });
        if (type === 'local' && area) q.set('filter[national_destination_code]', area);
        const found = await telnyx<
          { phone_number: string; cost_information?: { upfront_cost?: string; monthly_cost?: string; currency?: string }; region_information?: { region_type: string; region_name: string }[] }[]
        >('GET', `/available_phone_numbers?${q}`);
        return json({
          numbers: (found ?? []).map((n) => ({
            e164: n.phone_number,
            friendly: n.phone_number.replace(/^\+44/, '0'),
            locality: (n.region_information ?? []).find((r) => r.region_type === 'location')?.region_name ?? null,
            upfront: n.cost_information?.upfront_cost ? Number(n.cost_information.upfront_cost) : null,
            monthly: n.cost_information?.monthly_cost ? Number(n.cost_information.monthly_cost) : null,
            currency: n.cost_information?.currency ?? 'USD',
          })),
        });
      }

      case 'requirements': {
        await syncRequirementGroups(db, workspace_id);
        const { data } = await db.from('number_requirement_groups').select('status,business_name,status_detail,updated_at').eq('workspace_id', workspace_id).eq('phone_number_type', type).maybeSingle();
        return json({ group: data ?? null });
      }

      case 'buy': {
        if (!user.email_confirmed_at) return fail('email_not_verified', 403);
        const e164 = normalizePhone(input.e164);
        if (!e164) return fail('invalid_number');
        const { data: group } = await db.from('number_requirement_groups').select('telnyx_group_id,status').eq('workspace_id', workspace_id).eq('phone_number_type', type).maybeSingle();
        if (!group || ['declined', 'expired', 'no-longer-eligible'].includes(group.status)) return json({ needs_documents: true, previous: group?.status ?? null });
        return json(await order(e164, group.telnyx_group_id));
      }

      case 'submit_documents': {
        if (!user.email_confirmed_at) return fail('email_not_verified', 403);
        const e164 = normalizePhone(input.e164);
        const b = input.business ?? {};
        const d = input.documents ?? {};
        const business = {
          name: clip(b.name, 120),
          registration: clip(b.registration_number, 40),
          website: clip(b.website, 200),
          street: clip(b.street, 120),
          city: clip(b.city, 80),
          postcode: clip(b.postcode, 12).toUpperCase(),
          first: clip(b.contact_first_name, 60),
          last: clip(b.contact_last_name, 60),
          phone: normalizePhone(b.contact_phone) ?? '',
        };
        const missing = Object.entries(business).filter(([, v]) => !v).map(([k]) => k);
        if (!e164) missing.push('number');
        if (!/^https?:\/\/\S+\.\S+/.test(business.website)) missing.push('website');
        if (typeof d.identity !== 'string' || typeof d.address_proof !== 'string') missing.push('documents');
        if (missing.length) return fail('missing_details', 400, { missing: [...new Set(missing)] });
        for (const path of [d.identity, d.address_proof]) if (!String(path).startsWith(`${workspace_id}/`)) return fail('bad_document', 400);

        const { ids, unknown } = await gbRequirements(type);
        if (unknown.length || Object.values(ids).some((v) => !v)) {
          console.error('unexpected GB requirements', JSON.stringify(unknown.map((r) => r.label ?? r.name)));
          return fail('requirements_changed', 502, { message: 'Telnyx changed what it needs for UK numbers. We have been alerted.' });
        }

        // 1. the business address
        const address = await telnyx<{ id: string }>('POST', '/addresses', {
          first_name: business.first,
          last_name: business.last,
          business_name: business.name,
          street_address: business.street,
          locality: business.city,
          postal_code: business.postcode,
          country_code: 'GB',
          phone_number: business.phone,
          customer_reference: workspace_id,
          address_book: false,
          validate_address: false,
        });
        // 2. the two documents (Telnyx deletes unlinked uploads after 30 minutes, so upload now)
        const upload = async (path: string) => {
          const file = await db.storage.from('imports').download(path);
          if (file.error || !file.data) throw new TelnyxError('document_missing', 400);
          if (file.data.size > 20 * 1024 * 1024) throw new TelnyxError('document_too_large', 400);
          const bytes = new Uint8Array(await file.data.arrayBuffer());
          let bin = '';
          for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
          const doc = await telnyx<{ id: string }>('POST', '/documents', { file: btoa(bin), filename: path.split('/').pop(), customer_reference: workspace_id });
          return doc.id;
        };
        const [identityDoc, proofDoc] = await Promise.all([upload(d.identity), upload(d.address_proof)]);
        // 3. the requirement group, then submit it for approval
        const useCase =
          `${business.name} (UK company ${business.registration}) uses this number as the caller ID for its own sales team's outbound business-to-business calls to UK companies, ` +
          `made through Decibel, a browser-based sales calling platform. Calls to the number ring the same team. The number is used only by ${business.name} and is not sub-allocated to any other business.`;
        const group = await telnyx<{ id: string; status: string }>('POST', '/requirement_groups', {
          country_code: 'GB',
          phone_number_type: type,
          action: 'ordering',
          customer_reference: workspace_id,
          regulatory_requirements: [
            { requirement_id: ids.website, field_value: business.website },
            { requirement_id: ids.contact, field_value: `Name: ${business.first} ${business.last}; Business: ${business.name}; Phone: ${business.phone}` },
            { requirement_id: ids.useCase, field_value: useCase },
            { requirement_id: ids.address, field_value: address.id },
            { requirement_id: ids.identity, field_value: identityDoc },
            { requirement_id: ids.addressProof, field_value: proofDoc },
          ],
        });
        const submitted = await telnyx<{ status?: string }>('POST', `/requirement_groups/${group.id}/submit_for_approval`).catch((e) => {
          console.warn('submit_for_approval', (e as Error).message);
          return { status: group.status };
        });
        await db.from('number_requirement_groups').upsert(
          {
            workspace_id,
            phone_number_type: type,
            telnyx_group_id: group.id,
            status: submitted?.status ?? group.status ?? 'pending-approval',
            business_name: business.name,
            created_by: user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,phone_number_type' },
        );
        // 4. order the chosen number against it (reviewed with the group)
        try {
          return json(await order(e164!, group.id));
        } catch (e) {
          // the number went while the details were being filled in: the details are saved, pick another
          return json({ details_saved: true, number_unavailable: true, message: (e as Error).message });
        }
      }

      case 'verify_start': {
        const e164 = normalizePhone(input.e164);
        if (!e164) return fail('invalid_number');
        await telnyx('POST', '/verified_numbers', { phone_number: e164, verification_method: input.method === 'call' ? 'call' : 'sms' });
        return json({ sent: true });
      }

      case 'verify_check': {
        const e164 = normalizePhone(input.e164);
        const code = clip(input.code, 10).replace(/\D/g, '');
        if (!e164 || !code) return fail('invalid_code');
        try {
          await telnyx('POST', `/verified_numbers/${encodeURIComponent(e164)}/actions/verify`, { verification_code: code });
        } catch (e) {
          return json({ verified: false, message: (e as Error).message });
        }
        const { data, error } = await db
          .from('phone_numbers')
          .upsert(
            {
              workspace_id,
              e164,
              friendly_name: e164,
              country_code: e164.startsWith('+44') ? 'GB' : 'XX',
              kind: 'verified_caller_id',
              provider: 'telnyx',
              status: 'active',
              provider_id: e164,
              assigned_user_id: user.id,
              is_default: !(await hasDefault()),
              purchased_at: new Date().toISOString(),
              released_at: null,
              status_detail: null,
            },
            { onConflict: 'workspace_id,e164' },
          )
          .select()
          .single();
        if (error) throw new TelnyxError(error.message, 500);
        return json({ verified: true, number: data });
      }

      case 'refresh': {
        const { data: pending } = await db.from('phone_numbers').select('id,workspace_id,e164,number_order_id,status').eq('workspace_id', workspace_id).eq('status', 'pending_review');
        for (const row of pending ?? []) await syncPendingNumber(db, row).catch((e) => console.warn('refresh', row.e164, (e as Error).message));
        await syncRequirementGroups(db, workspace_id);
        const { data } = await db.from('phone_numbers').select('*').eq('workspace_id', workspace_id).neq('status', 'released');
        return json({ numbers: data ?? [] });
      }

      case 'set_default': {
        await db.from('phone_numbers').update({ is_default: false }).eq('workspace_id', workspace_id).eq('is_default', true);
        const { data, error } = await db.from('phone_numbers').update({ is_default: true }).eq('workspace_id', workspace_id).eq('id', input.id).eq('status', 'active').select().maybeSingle();
        if (error || !data) return fail('number_not_active');
        return json({ number: data });
      }

      case 'assign': {
        if (input.user_id && !(await getRole(input.user_id, workspace_id))) return fail('not_a_member');
        const { data } = await db.from('phone_numbers').update({ assigned_user_id: input.user_id ?? null }).eq('workspace_id', workspace_id).eq('id', input.id).select().maybeSingle();
        return json({ number: data });
      }

      case 'release': {
        const { data: num } = await db.from('phone_numbers').select('*').eq('workspace_id', workspace_id).eq('id', input.id).maybeSingle();
        if (!num) return fail('not_found', 404);
        if (num.provider === 'telnyx' && num.provider_id) {
          const path = num.kind === 'verified_caller_id' ? `/verified_numbers/${encodeURIComponent(num.e164)}` : `/phone_numbers/${num.provider_id}`;
          await telnyx('DELETE', path).catch((e) => console.warn('release failed', (e as Error).message));
        }
        await db.from('phone_numbers').update({ status: 'released', is_default: false, released_at: new Date().toISOString() }).eq('id', num.id);
        return json({ ok: true });
      }

      default:
        return fail('unknown action');
    }
  } catch (e) {
    const err = e as TelnyxError;
    console.error('telnyx-numbers', action, err.status, err.message);
    return fail(err.message || 'telephony_error', err.status && err.status >= 400 && err.status < 600 ? err.status : 500, { code: err.code });
  }
});

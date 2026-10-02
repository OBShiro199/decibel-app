// Owner/admin proxy to Twilio for everything number-related.
// POST { workspace_id, action, ... } with the user's JWT.
//   search         { country, type: 'local'|'national'|'mobile', prefix? }       -> { numbers: [{ e164, friendly, locality }] }
//   buy            { e164, type, country, bundle_sid?, address_sid? }            -> { number } | { needs_bundle: true }
//   create_bundle  { e164, type, country, business: {...}, document?: {...} }    -> { number } (status pending_review)
//   verify_start   { e164 }                                                      -> { validation_code }
//   verify_check   { e164 }                                                      -> { verified, number? }
//   set_default    { id }     assign { id, user_id }     release { id }
import { admin, corsHeaders, fail, FUNCTIONS_URL, getRole, getUser, isAdmin, json } from '../_shared/http.ts';
import { ensureWorkspaceTwilio, loadWorkspace, normalizePhone, PARENT_SID, PARENT_TOKEN, twilio, TwilioError } from '../_shared/twilio.ts';

const TYPE = { local: 'Local', national: 'National', mobile: 'Mobile' } as const;
const KIND = { local: 'twilio_local', national: 'twilio_national', mobile: 'twilio_mobile' } as const;
const COST = { local: 100, national: 100, mobile: 200 } as const;
const REG = 'https://numbers.twilio.com/v2/RegulatoryCompliance';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const input = await req.json().catch(() => ({}));
  const { workspace_id, action } = input;
  if (!workspace_id || !action) return fail('workspace_id and action required');
  if (!isAdmin(await getRole(user.id, workspace_id))) return fail('forbidden', 403);

  const row = await loadWorkspace(workspace_id);
  if (!row) return fail('workspace_not_found', 404);
  const db = admin();

  try {
    const { ws, creds } = await ensureWorkspaceTwilio(row);
    const inboundUrl = `${FUNCTIONS_URL}/twilio-inbound`;

    const hasDefault = async () => {
      const { count } = await db
        .from('phone_numbers')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', ws.id)
        .eq('is_default', true);
      return (count ?? 0) > 0;
    };

    const purchase = async (e164: string, type: keyof typeof TYPE, country: string, bundle?: string, address?: string) => {
      const bought = await twilio<{ sid: string; phone_number: string; friendly_name: string }>(
        creds,
        'POST',
        '/IncomingPhoneNumbers.json',
        {
          PhoneNumber: e164,
          FriendlyName: `Decibel ${ws.name}`.slice(0, 64),
          VoiceUrl: inboundUrl,
          VoiceMethod: 'POST',
          BundleSid: bundle,
          AddressSid: address,
        },
      );
      const { data, error } = await db
        .from('phone_numbers')
        .upsert(
          {
            workspace_id: ws.id,
            e164: bought.phone_number,
            friendly_name: bought.friendly_name,
            country_code: country,
            kind: KIND[type],
            status: 'active',
            twilio_sid: bought.sid,
            regulatory_bundle_sid: bundle ?? null,
            address_sid: address ?? null,
            assigned_user_id: user.id,
            is_default: !(await hasDefault()),
            monthly_cost_pence: COST[type],
            purchased_at: new Date().toISOString(),
          },
          { onConflict: 'workspace_id,e164' },
        )
        .select()
        .single();
      if (error) throw new TwilioError(error.message, 500);
      return data;
    };

    /**
     * An already-approved bundle for this country and number type: the workspace's own, or
     * (when TWILIO_SHARED_BUNDLE=true) a clone of the parent account's. A shared bundle
     * registers the number to the parent account's business identity, so it suits your own
     * workspaces and testing; customer workspaces should submit their own details.
     */
    const approvedBundle = async (country: string, type: keyof typeof TYPE): Promise<string | null> => {
      const query = { Status: 'twilio-approved', IsoCountry: country, NumberType: type, PageSize: '5' };
      const own = await twilio<{ results: { sid: string }[] }>(creds, 'GET', `${REG}/Bundles`, query);
      if (own.results?.[0]) return own.results[0].sid;
      if (Deno.env.get('TWILIO_SHARED_BUNDLE') !== 'true' || creds.account_sid === PARENT_SID) return null;
      const parent = { account_sid: PARENT_SID, auth_token: PARENT_TOKEN };
      const shared = await twilio<{ results: { sid: string }[] }>(parent, 'GET', `${REG}/Bundles`, query);
      const source = shared.results?.[0]?.sid;
      if (!source) return null;
      const clone = await twilio<{ bundle_sid: string; status: string }>(parent, 'POST', `${REG}/Bundles/${source}/Clones`, {
        TargetAccountSid: creds.account_sid,
        FriendlyName: `Decibel shared ${country} ${type}`,
      });
      return clone.status === 'twilio-approved' ? clone.bundle_sid : null;
    };

    switch (action) {
      case 'search': {
        const country = (input.country ?? 'GB').toUpperCase();
        const type = (input.type ?? 'local') as keyof typeof TYPE;
        if (!TYPE[type]) return fail('invalid type');
        const prefix = normalizePhone(input.prefix ?? '') ?? '';
        const res = await twilio<{ available_phone_numbers: any[] }>(
          creds,
          'GET',
          `/AvailablePhoneNumbers/${country}/${TYPE[type]}.json`,
          { PageSize: '40', VoiceEnabled: 'true', Contains: prefix ? `${prefix.replace('+', '')}*` : undefined },
        );
        let list = res.available_phone_numbers ?? [];
        if (prefix) {
          const filtered = list.filter((n) => n.phone_number.startsWith(prefix));
          if (filtered.length) list = filtered;
        }
        return json({
          numbers: list.slice(0, 12).map((n) => ({
            e164: n.phone_number,
            friendly: n.friendly_name,
            locality: n.locality || n.region || null,
            address_required: n.address_requirements ?? 'none',
          })),
        });
      }

      case 'buy': {
        // PRD: email verification is required before a number can be purchased.
        if (!user.email_confirmed_at) return fail('email_not_verified', 403);
        const type = (input.type ?? 'local') as keyof typeof TYPE;
        const e164 = normalizePhone(input.e164);
        if (!e164 || !TYPE[type]) return fail('invalid number');
        const country = (input.country ?? 'GB').toUpperCase();
        const bundleNeeded = (err: TwilioError) =>
          [21649, 21631, 21615, 21650, 21651].includes(err.code ?? 0) || /bundle|address/i.test(err.message);
        try {
          const number = await purchase(e164, type, country, input.bundle_sid, input.address_sid);
          return json({ number });
        } catch (e) {
          const err = e as TwilioError;
          if (!bundleNeeded(err)) throw err;
          // Twilio requires a regulatory bundle for this number. Before asking the user for
          // business details, reuse a bundle Twilio has already approved.
          const bundle = await approvedBundle(country, type).catch((x) => {
            console.warn('approved bundle lookup failed', (x as Error).message);
            return null;
          });
          if (bundle) {
            try {
              const number = await purchase(e164, type, country, bundle, input.address_sid);
              return json({ number, reused_bundle: true });
            } catch (again) {
              const err2 = again as TwilioError;
              if (!bundleNeeded(err2)) throw err2;
              return json({ needs_bundle: true, message: err2.message });
            }
          }
          return json({ needs_bundle: true, message: err.message });
        }
      }

      case 'create_bundle': {
        if (!user.email_confirmed_at) return fail('email_not_verified', 403);
        const type = (input.type ?? 'local') as keyof typeof TYPE;
        const country = (input.country ?? 'GB').toUpperCase();
        const e164 = normalizePhone(input.e164);
        const b = input.business ?? {};
        if (!e164 || !b.name || !b.street || !b.city || !b.postcode) return fail('business name and address required');

        const address = await twilio<{ sid: string }>(creds, 'POST', '/Addresses.json', {
          CustomerName: b.name,
          Street: b.street,
          City: b.city,
          Region: b.region || b.city,
          PostalCode: b.postcode,
          IsoCountry: country,
          FriendlyName: `${b.name} registered address`.slice(0, 64),
        });

        const regs = await twilio<{ results: { sid: string }[] }>(creds, 'GET', `${REG}/Regulations`, {
          IsoCountry: country,
          NumberType: type,
          EndUserType: 'business',
        });
        const regulationSid = regs.results?.[0]?.sid;

        const bundle = await twilio<{ sid: string }>(creds, 'POST', `${REG}/Bundles`, {
          FriendlyName: `${b.name} ${country} ${type}`.slice(0, 64),
          Email: user.email!,
          RegulationSid: regulationSid,
          IsoCountry: regulationSid ? undefined : country,
          NumberType: regulationSid ? undefined : type,
          EndUserType: regulationSid ? undefined : 'business',
          StatusCallback: `${FUNCTIONS_URL}/twilio-bundle-status?ws=${ws.id}`,
        });

        const endUser = await twilio<{ sid: string }>(creds, 'POST', `${REG}/EndUsers`, {
          FriendlyName: b.name,
          Type: 'business',
          Attributes: JSON.stringify({
            business_name: b.name,
            business_registration_number: b.registration_number ?? '',
            business_website: b.website ?? '',
          }),
        });
        await twilio(creds, 'POST', `${REG}/Bundles/${bundle.sid}/ItemAssignments`, { ObjectSid: endUser.sid });

        // Proof of address: uploaded from the imports bucket path the browser stored it at.
        if (input.document?.storage_path) {
          const { data: file } = await db.storage.from('imports').download(input.document.storage_path);
          if (file) {
            const form = new FormData();
            form.append('FriendlyName', `${b.name} proof of address`.slice(0, 64));
            form.append('Type', input.document.type ?? 'utility_bill');
            form.append('Attributes', JSON.stringify({ address_sids: [address.sid], business_name: b.name }));
            form.append('File', file, input.document.filename ?? 'proof-of-address.pdf');
            const up = await fetch('https://numbers-upload.twilio.com/v2/RegulatoryCompliance/SupportingDocuments', {
              method: 'POST',
              headers: { authorization: 'Basic ' + btoa(`${creds.account_sid}:${creds.auth_token}`) },
              body: form,
            });
            const doc = await up.json().catch(() => ({}));
            if (up.ok && doc.sid) {
              await twilio(creds, 'POST', `${REG}/Bundles/${bundle.sid}/ItemAssignments`, { ObjectSid: doc.sid });
            } else {
              console.warn('supporting document upload failed', up.status, doc?.message);
            }
          }
        }

        await twilio(creds, 'POST', `${REG}/Bundles/${bundle.sid}`, { Status: 'pending-review' });

        const { data, error } = await db
          .from('phone_numbers')
          .upsert(
            {
              workspace_id: ws.id,
              e164,
              country_code: country,
              kind: KIND[type],
              status: 'pending_review',
              regulatory_bundle_sid: bundle.sid,
              address_sid: address.sid,
              assigned_user_id: user.id,
              monthly_cost_pence: COST[type],
            },
            { onConflict: 'workspace_id,e164' },
          )
          .select()
          .single();
        if (error) throw new TwilioError(error.message, 500);
        return json({ number: data });
      }

      case 'verify_start': {
        const e164 = normalizePhone(input.e164);
        if (!e164) return fail('invalid number');
        const res = await twilio<{ validation_code: string }>(creds, 'POST', '/OutgoingCallerIds.json', {
          PhoneNumber: e164,
          FriendlyName: `Decibel ${user.email}`.slice(0, 64),
        });
        return json({ validation_code: res.validation_code });
      }

      case 'verify_check': {
        const e164 = normalizePhone(input.e164);
        if (!e164) return fail('invalid number');
        const res = await twilio<{ outgoing_caller_ids: { sid: string; phone_number: string }[] }>(
          creds,
          'GET',
          '/OutgoingCallerIds.json',
          { PhoneNumber: e164 },
        );
        const hit = res.outgoing_caller_ids?.[0];
        if (!hit) return json({ verified: false });
        const { data, error } = await db
          .from('phone_numbers')
          .upsert(
            {
              workspace_id: ws.id,
              e164: hit.phone_number,
              friendly_name: 'Verified caller ID',
              country_code: hit.phone_number.startsWith('+44') ? 'GB' : 'XX',
              kind: 'verified_caller_id',
              status: 'active',
              twilio_sid: hit.sid,
              assigned_user_id: user.id,
              is_default: !(await hasDefault()),
              purchased_at: new Date().toISOString(),
            },
            { onConflict: 'workspace_id,e164' },
          )
          .select()
          .single();
        if (error) throw new TwilioError(error.message, 500);
        return json({ verified: true, number: data });
      }

      case 'set_default': {
        await db.from('phone_numbers').update({ is_default: false }).eq('workspace_id', ws.id).eq('is_default', true);
        const { data, error } = await db
          .from('phone_numbers')
          .update({ is_default: true })
          .eq('workspace_id', ws.id)
          .eq('id', input.id)
          .eq('status', 'active')
          .select()
          .maybeSingle();
        if (error || !data) return fail('number_not_active');
        return json({ number: data });
      }

      case 'assign': {
        if (input.user_id && !(await getRole(input.user_id, ws.id))) return fail('not_a_member');
        const { data } = await db
          .from('phone_numbers')
          .update({ assigned_user_id: input.user_id ?? null })
          .eq('workspace_id', ws.id)
          .eq('id', input.id)
          .select()
          .maybeSingle();
        return json({ number: data });
      }

      case 'release': {
        const { data: num } = await db
          .from('phone_numbers')
          .select('*')
          .eq('workspace_id', ws.id)
          .eq('id', input.id)
          .maybeSingle();
        if (!num) return fail('not_found', 404);
        if (num.twilio_sid) {
          const path =
            num.kind === 'verified_caller_id'
              ? `/OutgoingCallerIds/${num.twilio_sid}.json`
              : `/IncomingPhoneNumbers/${num.twilio_sid}.json`;
          await twilio(creds, 'DELETE', path).catch((e) => console.warn('release failed', e.message));
        }
        await db
          .from('phone_numbers')
          .update({ status: 'released', is_default: false, released_at: new Date().toISOString(), twilio_sid: null })
          .eq('id', num.id);
        return json({ ok: true });
      }

      default:
        return fail('unknown action');
    }
  } catch (e) {
    const err = e as TwilioError;
    console.error('twilio-numbers', action, err.message);
    return fail(err.message || 'twilio_error', err.status && err.status >= 400 && err.status < 600 ? err.status : 500, {
      code: err.code,
    });
  }
});

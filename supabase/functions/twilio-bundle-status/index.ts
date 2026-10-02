// Twilio regulatory bundle status webhook: pending_review -> active / rejected.
// On approval the reserved number is bought and the owner is emailed.
import { admin, APP_URL, FUNCTIONS_URL } from '../_shared/http.ts';
import { layout, sendEmail } from '../_shared/email.ts';
import { loadCreds, PARENT_SID, PARENT_TOKEN, twilio, webhook } from '../_shared/twilio.ts';

Deno.serve(async (req) => {
  const ctx = await webhook(req, 'twilio-bundle-status');
  if (ctx instanceof Response) return ctx;
  const { body, ws } = ctx;
  const db = admin();
  const bundleSid = body.BundleSid;
  const status = (body.Status ?? '').toLowerCase();
  if (!bundleSid) return new Response('ok');

  const { data: numbers } = await db
    .from('phone_numbers')
    .select('*')
    .eq('workspace_id', ws.id)
    .eq('regulatory_bundle_sid', bundleSid)
    .eq('status', 'pending_review');
  if (!numbers?.length) return new Response('ok');

  const { data: owner } = await db.from('profiles').select('email,full_name').eq('id', ws.created_by).single();
  const creds =
    ws.twilio_account_mode === 'parent' ? { account_sid: PARENT_SID, auth_token: PARENT_TOKEN } : await loadCreds(ws.id);

  if (status === 'twilio-approved' && creds) {
    const { count: defaults } = await db
      .from('phone_numbers')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', ws.id)
      .eq('is_default', true);
    let madeDefault = (defaults ?? 0) > 0;
    for (const n of numbers) {
      try {
        const bought = await twilio<{ sid: string; phone_number: string; friendly_name: string }>(
          creds,
          'POST',
          '/IncomingPhoneNumbers.json',
          {
            PhoneNumber: n.e164,
            BundleSid: bundleSid,
            AddressSid: n.address_sid ?? undefined,
            VoiceUrl: `${FUNCTIONS_URL}/twilio-inbound`,
            VoiceMethod: 'POST',
          },
        );
        await db
          .from('phone_numbers')
          .update({
            status: 'active',
            twilio_sid: bought.sid,
            friendly_name: bought.friendly_name,
            is_default: !madeDefault,
            purchased_at: new Date().toISOString(),
          })
          .eq('id', n.id);
        madeDefault = true;
      } catch (e) {
        // the reserved number was taken while the bundle was in review: keep it pending so
        // the owner can pick another one against the now-approved bundle
        console.warn('post-approval purchase failed', (e as Error).message);
        await db.from('phone_numbers').update({ status: 'pending_bundle' }).eq('id', n.id);
      }
    }
    if (owner?.email) {
      await sendEmail(
        owner.email,
        'Your Decibels number is active',
        layout('Your number is ready', `Twilio approved your details for <b>${ws.name}</b>. You can start calling from your new number.`, {
          label: 'Open Decibels',
          url: `${APP_URL}/app/settings/phone-numbers`,
        }),
      );
    }
  } else if (status === 'twilio-rejected') {
    await db.from('phone_numbers').update({ status: 'rejected' }).in('id', numbers.map((n) => n.id));
    if (owner?.email) {
      await sendEmail(
        owner.email,
        'We need another look at your number application',
        layout(
          'Twilio could not approve your details',
          `${body.FailureReason ? `Reason: ${body.FailureReason}. ` : ''}Check the business address and proof of address, then submit again. You can keep calling with a verified caller ID meanwhile.`,
          { label: 'Review details', url: `${APP_URL}/app/settings/phone-numbers` },
        ),
      );
    }
  }
  return new Response('ok');
});

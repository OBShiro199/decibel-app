// Nightly housekeeping (schedule alongside stripe-usage):
//  - retention: delete recordings past the plan's window (90 days trial/Starter, 1 year Growth/Scale)
//  - reminders: nudge owners who abandoned onboarding ~24h ago
//  - invitations: mark expired
import { admin, APP_URL, fail, isCron, json } from '../_shared/http.ts';
import { layout, sendEmail } from '../_shared/email.ts';

const RETENTION_DAYS: Record<string, number> = { trial: 90, starter: 90, growth: 365, scale: 365 };

Deno.serve(async (req) => {
  if (!(await isCron(req))) return fail('unauthorized', 401);
  const db = admin();
  const out = { recordings_deleted: 0, reminders_sent: 0, invitations_expired: 0, stale_calls_closed: 0 };

  // retention
  const { data: workspaces } = await db.from('workspaces').select('id,plan');
  for (const ws of workspaces ?? []) {
    const cutoff = new Date(Date.now() - (RETENTION_DAYS[ws.plan] ?? 90) * 86400000).toISOString();
    const { data: old } = await db
      .from('recordings')
      .select('id,storage_path')
      .eq('workspace_id', ws.id)
      .lt('created_at', cutoff)
      .limit(500);
    if (old?.length) {
      await db.storage.from('recordings').remove(old.map((r) => r.storage_path));
      await db.from('recordings').delete().in('id', old.map((r) => r.id));
      out.recordings_deleted += old.length;
    }
  }

  // abandoned onboarding: created 24-48h ago and still incomplete
  const from = new Date(Date.now() - 48 * 3600000).toISOString();
  const to = new Date(Date.now() - 24 * 3600000).toISOString();
  const { data: stuck } = await db
    .from('workspaces')
    .select('id,name,created_by,onboarding_state')
    .is('onboarding_completed_at', null)
    .gte('created_at', from)
    .lt('created_at', to);
  for (const ws of stuck ?? []) {
    const { data: owner } = await db.from('profiles').select('email').eq('id', ws.created_by).single();
    if (!owner?.email) continue;
    const sent = await sendEmail(
      owner.email,
      'You are a few minutes from your first call',
      layout(
        'Pick up where you left off',
        `Your workspace <b>${ws.name}</b> is nearly ready. Finish setup and make your first call. Your first 5,000 credits are free.`,
        { label: 'Finish setup', url: `${APP_URL}/onboarding` },
      ),
    );
    if (sent) out.reminders_sent++;
  }

  const { data: expired } = await db
    .from('invitations')
    .update({ status: 'expired' })
    .eq('status', 'pending')
    .lt('expires_at', new Date().toISOString())
    .select('id');
  out.invitations_expired = expired?.length ?? 0;

  // calls still "live" after 6 hours missed their final Twilio callback
  const { data: stale } = await db
    .from('calls')
    .update({ status: 'failed', hangup_cause: 'stale', ended_at: new Date().toISOString() })
    .in('status', ['queued', 'initiated', 'ringing', 'in_progress'])
    .lt('started_at', new Date(Date.now() - 6 * 3600000).toISOString())
    .select('id');
  out.stale_calls_closed = stale?.length ?? 0;

  return json(out);
});

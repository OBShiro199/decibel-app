import { redirect } from 'next/navigation';
import { stepByNumber } from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/server';
import type { Workspace, WorkspaceRole } from '@/lib/types';
import { HOME } from '@/lib/constants';

export const dynamic = 'force-dynamic';

export default async function OnboardingIndex() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/onboarding');

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('last_workspace_id').eq('id', user.id).maybeSingle(),
    supabase.from('workspace_members').select('role, workspace:workspaces(*)').eq('user_id', user.id),
  ]);
  const rows = ((memberships ?? []) as unknown as { role: WorkspaceRole; workspace: Workspace | null }[]).filter((m) => m.workspace);
  if (!rows.length) redirect('/onboarding/workspace');
  const active = rows.find((m) => m.workspace!.id === profile?.last_workspace_id) ?? rows[0];
  if (active.role !== 'owner') redirect('/onboarding/test?invited=1');
  if (active.workspace!.onboarding_completed_at) redirect(HOME);
  redirect(`/onboarding/${stepByNumber(active.workspace!.onboarding_state?.step ?? 1).slug}`);
}

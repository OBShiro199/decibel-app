import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { Wizard } from '@/components/onboarding/wizard';
import { stepBySlug } from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/server';
import type { Profile, Workspace, WorkspaceRole } from '@/lib/types';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Set up your workspace' };

export default async function OnboardingStep({
  params,
  searchParams,
}: {
  params: Promise<{ step: string }>;
  searchParams: Promise<{ new?: string; invited?: string }>;
}) {
  const { step: slug } = await params;
  const query = await searchParams;
  const step = stepBySlug(slug);
  if (!step) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/onboarding/${slug}`);

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('workspace_members').select('role, workspace:workspaces(*)').eq('user_id', user.id),
  ]);
  if (!profile) redirect('/login');

  const rows = ((memberships ?? []) as unknown as { role: WorkspaceRole; workspace: Workspace | null }[]).filter((m) => m.workspace);
  const creatingNew = query.new === '1' && step.slug === 'workspace';
  const active = creatingNew ? null : (rows.find((m) => m.workspace!.id === profile.last_workspace_id) ?? rows[0] ?? null);

  if (!active && step.slug !== 'workspace') redirect('/onboarding/workspace');
  const invited = !!active && active.role !== 'owner';
  if (invited && step.slug !== 'test') redirect('/onboarding/test?invited=1');
  if (active && !invited && active.workspace!.onboarding_completed_at) redirect('/app');
  // step 1 is done once a workspace exists: move on rather than create a second one by accident
  if (active && !invited && step.slug === 'workspace') redirect('/onboarding/business');

  return (
    <Wizard
      step={step.slug}
      user={{ id: user.id, email: user.email ?? '', emailConfirmed: !!user.email_confirmed_at }}
      profile={profile as Profile}
      workspace={active?.workspace ?? null}
      invited={invited}
    />
  );
}

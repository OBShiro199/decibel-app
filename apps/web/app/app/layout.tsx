import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app/shell';
import { createClient } from '@/lib/supabase/server';
import type { Profile, Workspace, WorkspaceRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  // getClaims verifies the session token locally (no network hop), so the user id is known at
  // once and the user record (for email confirmation), profile and memberships load in parallel
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) redirect('/login');

  const [
    {
      data: { user },
    },
    { data: profile },
    { data: memberships },
  ] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from('profiles').select('*').eq('id', userId).single(),
    supabase.from('workspace_members').select('role, workspace:workspaces(*)').eq('user_id', userId),
  ]);
  if (!user) redirect('/login');

  const rows = ((memberships ?? []) as unknown as { role: WorkspaceRole; workspace: Workspace | null }[]).filter((m) => m.workspace);
  if (!profile || rows.length === 0) redirect('/onboarding');

  const active = rows.find((m) => m.workspace!.id === profile.last_workspace_id) ?? rows[0];
  const workspace = active.workspace!;
  // owners finish the wizard first; invited members go straight in
  if (!workspace.onboarding_completed_at && active.role === 'owner') redirect('/onboarding');

  return (
    <AppShell
      initial={{
        user: { id: user.id, email: user.email ?? '', emailConfirmed: !!user.email_confirmed_at },
        profile: profile as Profile,
        workspace,
        role: active.role,
        workspaces: rows.map((m) => ({ id: m.workspace!.id, name: m.workspace!.name, logo_url: m.workspace!.logo_url, role: m.role })),
      }}
    >
      {children}
    </AppShell>
  );
}

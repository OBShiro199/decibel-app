import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app/shell';
import { createClient } from '@/lib/supabase/server';
import type { Profile, Workspace, WorkspaceRole } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: memberships }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('workspace_members').select('role, workspace:workspaces(*)').eq('user_id', user.id),
  ]);

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

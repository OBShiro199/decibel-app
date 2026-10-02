'use client';
import { installMockApi } from '@/lib/dev-preview/mock-api';
import { members, profile, workspace } from '@/lib/dev-preview/data';
import { AppShell } from '@/components/app/shell';
import type { Profile, Workspace } from '@/lib/types';

installMockApi();

export function PreviewShell({ children }: { children: React.ReactNode }) {
  return (
    <AppShell
      initial={{
        user: { id: profile.id, email: profile.email, emailConfirmed: true },
        profile: profile as unknown as Profile,
        workspace: workspace as unknown as Workspace,
        role: 'owner',
        workspaces: [{ id: workspace.id, name: workspace.name, logo_url: null, role: 'owner' }],
      }}
    >
      {children}
    </AppShell>
  );
}
void members;

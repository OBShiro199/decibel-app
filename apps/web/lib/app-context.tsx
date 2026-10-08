'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { setAnalyticsContext } from '@/lib/analytics';
import { supabase } from '@/lib/supabase/client';
import type { Profile, Workspace, WorkspaceRole } from '@/lib/types';
import { HOME } from '@/lib/constants';

export interface AppContextValue {
  user: { id: string; email: string; emailConfirmed: boolean };
  profile: Profile;
  workspace: Workspace;
  role: WorkspaceRole;
  isAdmin: boolean;
  isOwner: boolean;
  workspaces: { id: string; name: string; logo_url: string | null; role: WorkspaceRole }[];
  /** Re-reads the workspace row (credits, minutes, plan). */
  refreshWorkspace: () => Promise<void>;
  switchWorkspace: (id: string) => Promise<void>;
}

const Ctx = createContext<AppContextValue | null>(null);

export function AppProvider({
  initial,
  children,
}: {
  initial: Omit<AppContextValue, 'refreshWorkspace' | 'switchWorkspace' | 'isAdmin' | 'isOwner'>;
  children: React.ReactNode;
}) {
  const qc = useQueryClient();
  const wsId = initial.workspace.id;

  const { data: workspace } = useQuery({
    queryKey: ['workspace', wsId],
    queryFn: async () => {
      const { data, error } = await supabase().from('workspaces').select('*').eq('id', wsId).single();
      if (error) throw error;
      return data as Workspace;
    },
    initialData: initial.workspace,
    staleTime: 15_000,
  });

  const { data: profile } = useQuery({
    queryKey: ['profile', initial.user.id],
    queryFn: async () => {
      const { data, error } = await supabase().from('profiles').select('*').eq('id', initial.user.id).single();
      if (error) throw error;
      return data as Profile;
    },
    initialData: initial.profile,
  });

  const refreshWorkspace = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['workspace', wsId] });
  }, [qc, wsId]);

  const switchWorkspace = useCallback(
    async (id: string) => {
      await supabase().from('profiles').update({ last_workspace_id: id }).eq('id', initial.user.id);
      window.location.assign(HOME);
    },
    [initial.user.id],
  );

  useEffect(() => {
    setAnalyticsContext({ workspace_id: wsId, plan: workspace.plan, user_id: initial.user.id, email: initial.user.email });
  }, [wsId, workspace.plan, initial.user.id, initial.user.email]);

  const value = useMemo<AppContextValue>(
    () => ({
      ...initial,
      profile,
      workspace,
      isAdmin: initial.role === 'owner' || initial.role === 'admin',
      isOwner: initial.role === 'owner',
      refreshWorkspace,
      switchWorkspace,
    }),
    [initial, profile, workspace, refreshWorkspace, switchWorkspace],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useApp(): AppContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useApp must be used inside <AppProvider>');
  return v;
}

'use client';
// Shared query definitions. Pages and the hover/idle prefetcher use the same
// keys and fetchers, so a prefetched tab opens with its data already in cache.
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import type { Call, List, Person, Recording, TenantCompany } from '@/lib/types';

export const PERSON_SELECT = '*, company:tenant_companies(id,name,domain)';

export const todayQueueQuery = (workspaceId: string, userId: string) =>
  queryOptions({
    queryKey: ['today', workspaceId, userId],
    queryFn: async () => {
      // one round trip: the RPC returns people rows, PostgREST embeds the company
      const { data, error } = await supabase().rpc('today_queue', { p_workspace_id: workspaceId, p_limit: 50 }).select(PERSON_SELECT);
      if (error) throw error;
      return (data ?? []) as unknown as Person[];
    },
  });

export const peopleQuery = (workspaceId: string, listId?: string) =>
  queryOptions({
    queryKey: ['people', workspaceId, listId ?? 'all'],
    placeholderData: undefined, // never show one list's people under another list
    queryFn: async () => {
      const db = supabase();
      if (listId) {
        const { data, error } = await db.from('list_members').select(`position, person:people(${PERSON_SELECT})`).eq('list_id', listId).order('position').order('added_at').limit(1000);
        if (error) throw error;
        return ((data ?? []) as unknown as { person: Person | null }[]).map((r) => r.person).filter(Boolean) as Person[];
      }
      const { data, error } = await db.from('people').select(PERSON_SELECT).eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as Person[];
    },
  });

export const listsQuery = (workspaceId: string, userId: string) =>
  queryOptions({
    queryKey: ['lists', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('lists')
        .select('*, list_members(count)')
        .eq('workspace_id', workspaceId)
        .or(`is_shared.eq.true,owner_id.eq.${userId}`)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((l) => ({ ...(l as List), count: (l as { list_members?: { count: number }[] }).list_members?.[0]?.count ?? 0 }));
    },
  });

export const companiesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['companies', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase().from('tenant_companies').select('*, people(count)').eq('workspace_id', workspaceId).order('name').limit(1000);
      if (error) throw error;
      return (data ?? []) as unknown as (TenantCompany & { people: { count: number }[] })[];
    },
  });

export interface CallFilters {
  rep: string;
  outcome: string;
  listId: string;
  from: string;
  to: string;
  page: number;
}
export const CALLS_PAGE = 50;
export const DEFAULT_CALL_FILTERS: CallFilters = { rep: '', outcome: '', listId: '', from: '', to: '', page: 0 };
export type CallLogRow = Call & { recording: Recording[] | Recording | null };

export const callsQuery = (workspaceId: string, f: CallFilters) =>
  queryOptions({
    queryKey: ['calls', workspaceId, f.rep, f.outcome, f.listId, f.from, f.to, f.page],
    queryFn: async () => {
      let q = supabase()
        .from('calls')
        .select('*, person:people(id,full_name,job_title,company:tenant_companies(id,name)), recording:recordings(id,call_id,storage_path,duration_seconds)', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('started_at', { ascending: false })
        .range(f.page * CALLS_PAGE, f.page * CALLS_PAGE + CALLS_PAGE - 1);
      if (f.rep) q = q.eq('user_id', f.rep);
      if (f.outcome === 'none') q = q.is('outcome', null);
      else if (f.outcome) q = q.eq('outcome', f.outcome);
      if (f.listId) q = q.eq('list_id', f.listId);
      if (f.from) q = q.gte('started_at', new Date(`${f.from}T00:00:00`).toISOString());
      if (f.to) q = q.lte('started_at', new Date(`${f.to}T23:59:59`).toISOString());
      const { data, error, count } = await q;
      if (error) throw error;
      return { rows: (data ?? []) as unknown as CallLogRow[], count: count ?? 0 };
    },
  });

/** Primary data per sidebar destination, for prefetch on hover/focus and on idle. */
export function prefetchRoute(qc: QueryClient, href: string, workspaceId: string, userId: string) {
  if (href === '/app') void qc.prefetchQuery(todayQueueQuery(workspaceId, userId));
  else if (href === '/app/people' || href === '/app/pipeline') void qc.prefetchQuery(peopleQuery(workspaceId));
  else if (href === '/app/companies') void qc.prefetchQuery(companiesQuery(workspaceId));
  else if (href === '/app/lists') void qc.prefetchQuery(listsQuery(workspaceId, userId));
  else if (href === '/app/calls') void qc.prefetchQuery(callsQuery(workspaceId, DEFAULT_CALL_FILTERS));
}

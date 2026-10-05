'use client';
// Shared query definitions. Pages and the hover/idle prefetcher use the same
// keys and fetchers, so a prefetched tab opens with its data already in cache.
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { COUNTRIES, MARKETS } from '@/lib/constants';
import type { Call, List, Person, PhoneNumber, Recording, TenantCompany } from '@/lib/types';

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
        .select('*, person:people(id,full_name,job_title,company:tenant_companies(id,name)), recording:recordings(id,call_id,storage_path,duration_seconds)', { count: 'estimated' })
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

const londonDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(d);

export const todayStatsQuery = (workspaceId: string, userId: string) =>
  queryOptions({
    queryKey: ['stats', 'today', workspaceId, userId],
    queryFn: async () => {
      const { data, error } = await supabase().from('call_stats_daily').select('dials,connects,meetings,talk_seconds').eq('workspace_id', workspaceId).eq('user_id', userId).eq('day', londonDay(new Date()));
      if (error) throw error;
      return (data ?? []).reduce((a, r) => ({ dials: a.dials + (r.dials ?? 0), connects: a.connects + (r.connects ?? 0), meetings: a.meetings + (r.meetings ?? 0), talk: a.talk + (r.talk_seconds ?? 0) }), { dials: 0, connects: 0, meetings: 0, talk: 0 });
    },
  });

export const numbersQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['numbers', workspaceId],
    queryFn: async () => {
      const { data, error } = await supabase().from('phone_numbers').select('*').eq('workspace_id', workspaceId).neq('status', 'released').order('created_at');
      if (error) throw error;
      return (data ?? []) as PhoneNumber[];
    },
  });

/** Countries the workspace sells into (onboarding step 2), which scope lead search. */
export const marketsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['business-profile', workspaceId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase().from('business_profiles').select('markets').eq('workspace_id', workspaceId).maybeSingle();
      const codes = [...new Set(((data?.markets as string[]) ?? []).flatMap((m) => MARKETS[m] ?? []))];
      return codes.length ? codes : COUNTRIES.map((c) => c.code);
    },
  });

export const industriesQuery = () =>
  queryOptions({
    queryKey: ['industries'],
    staleTime: Infinity,
    queryFn: async () => ((await supabase().from('industries').select('name').order('name')).data ?? []).map((i) => i.name as string),
  });

export const savedSearchesQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['saved-searches', workspaceId],
    queryFn: async () => (await supabase().from('saved_searches').select('id,name,filters').eq('workspace_id', workspaceId).order('created_at')).data ?? [],
  });

export interface StatRow {
  user_id: string | null;
  day: string;
  dials: number;
  connects: number;
  meetings: number;
  talk_seconds: number | null;
}
/** Monday of this week to today, Europe/London: the dashboard's default period. */
export function thisWeek(): { start: string; end: string } {
  const now = new Date();
  const d = new Date(now);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return { start: londonDay(d), end: londonDay(now) };
}
export const dashboardQuery = (workspaceId: string, start: string, end: string) =>
  queryOptions({
    queryKey: ['dashboard', workspaceId, start, end],
    queryFn: async () => {
      const db = supabase();
      const [{ data, error }, { data: tx }] = await Promise.all([
        db.from('call_stats_daily').select('user_id,day,dials,connects,meetings,talk_seconds').eq('workspace_id', workspaceId).gte('day', start).lte('day', end),
        db.from('credit_transactions').select('delta').eq('workspace_id', workspaceId).eq('reason', 'reveal').gte('created_at', new Date(`${start}T00:00:00`).toISOString()).lte('created_at', new Date(`${end}T23:59:59`).toISOString()),
      ]);
      if (error) throw error;
      return { rows: (data ?? []) as StatRow[], credits: (tx ?? []).reduce((s, t) => s - t.delta, 0) };
    },
  });

export function prefetchRoute(qc: QueryClient, href: string, workspaceId: string, userId: string) {
  const go = (o: Parameters<QueryClient['prefetchQuery']>[0]) => void qc.prefetchQuery(o);
  if (href === '/app') {
    void qc.prefetchQuery(todayQueueQuery(workspaceId, userId));
    void qc.prefetchQuery(todayStatsQuery(workspaceId, userId));
    void qc.prefetchQuery(numbersQuery(workspaceId));
  } else if (href === '/app/leads') {
    void qc.prefetchQuery(marketsQuery(workspaceId));
    void qc.prefetchQuery(industriesQuery());
    void qc.prefetchQuery(savedSearchesQuery(workspaceId));
  } else if (href === '/app/companies') void qc.prefetchQuery(companiesQuery(workspaceId));
  else if (href === '/app/lists') void qc.prefetchQuery(listsQuery(workspaceId, userId));
  else if (href === '/app/calls') void qc.prefetchQuery(callsQuery(workspaceId, DEFAULT_CALL_FILTERS));
  else if (href === '/app/dashboard') {
    const { start, end } = thisWeek();
    void qc.prefetchQuery(dashboardQuery(workspaceId, start, end));
  }
  void go;
}

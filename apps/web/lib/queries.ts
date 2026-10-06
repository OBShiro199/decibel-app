'use client';
// Shared query definitions. Pages and the hover/idle prefetcher use the same
// keys and fetchers, so a prefetched tab opens with its data already in cache.
import { queryOptions, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';
import { COUNTRIES, MARKETS } from '@/lib/constants';
import { dashboardRanges, thisWeek } from '@/lib/dashboard';
import { knownFitRows } from '@/lib/fit-rows';
import { applyLeadFilters, EMPTY_FILTERS, type LeadFilters } from '@/lib/leads';
import type { Activity, Call, ContactPublic, List, Note, Person, PhoneNumber, Recording, Task, TenantCompany } from '@/lib/types';

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
export { thisWeek };
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

// ---- credits ------------------------------------------------------------------------
/** Everything this workspace has ever received (welcome credits, purchases, refunds): the bar's denominator. */
export const creditsGrantedQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['credits-granted', workspaceId],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase().from('credit_transactions').select('delta').eq('workspace_id', workspaceId).gt('delta', 0);
      if (error) throw error;
      return (data ?? []).reduce((sum, r) => sum + (r.delta > 0 ? r.delta : 0), 0);
    },
  });

// ---- leads search -----------------------------------------------------------------
export const leadsQuery = (workspaceId: string, scoped: LeadFilters, page: number, pageSize: number) =>
  queryOptions({
    queryKey: ['leads', workspaceId, scoped, page, pageSize],
    queryFn: async () => {
      const db = supabase();
      const { data, count, error } = await applyLeadFilters(db.from('contacts_public').select('*', { count: 'estimated' }), scoped)
        .order('last_verified_at', { ascending: false })
        .order('id')
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      const contacts = (data ?? []) as ContactPublic[];
      // which of these has the workspace already revealed? (free forever, show unmasked)
      const map: Record<string, Pick<Person, 'id' | 'mobile_e164' | 'email'>> = {};
      if (contacts.length) {
        const { data: people } = await db.from('people').select('id,source_contact_id,mobile_e164,email').eq('workspace_id', workspaceId).in('source_contact_id', contacts.map((c) => c.id));
        (people ?? []).forEach((p) => (map[p.source_contact_id as string] = p));
      }
      return { contacts, count: count ?? 0, revealed: map };
    },
  });

// ---- person record ----------------------------------------------------------------
export type PersonCallRow = Call & { recording: Recording[] | Recording | null };
export const personQuery = (id: string) =>
  queryOptions({
    queryKey: ['person', id],
    placeholderData: undefined,
    queryFn: async () => {
      const { data, error } = await supabase().from('people').select('*, company:tenant_companies(*)').eq('id', id).maybeSingle();
      if (error) throw error;
      return data as unknown as (Person & { company: TenantCompany | null }) | null;
    },
  });
export const personCallsQuery = (id: string) =>
  queryOptions({
    queryKey: ['person', id, 'calls'],
    placeholderData: undefined,
    queryFn: async () => ((await supabase().from('calls').select('*, recording:recordings(id,call_id,storage_path,duration_seconds)').eq('person_id', id).order('started_at', { ascending: false }).limit(100)).data ?? []) as unknown as PersonCallRow[],
  });
export const personNotesQuery = (id: string) =>
  queryOptions({
    queryKey: ['person', id, 'notes'],
    placeholderData: undefined,
    queryFn: async () => ((await supabase().from('notes').select('*').eq('person_id', id).order('created_at', { ascending: false }).limit(100)).data ?? []) as Note[],
  });
export const personTasksQuery = (id: string) =>
  queryOptions({
    queryKey: ['person', id, 'tasks'],
    placeholderData: undefined,
    queryFn: async () => ((await supabase().from('tasks').select('*').eq('person_id', id).order('completed_at', { ascending: false, nullsFirst: true }).order('due_at', { ascending: true, nullsFirst: false }).limit(100)).data ?? []) as Task[],
  });
export const personActivitiesQuery = (id: string) =>
  queryOptions({
    queryKey: ['person', id, 'activities'],
    placeholderData: undefined,
    queryFn: async () => ((await supabase().from('activities').select('*').eq('person_id', id).order('created_at', { ascending: false }).limit(200)).data ?? []) as Activity[],
  });

/** Warm a person's record (hovering a row or link), so opening it shows everything at once. */
export function prefetchPerson(qc: QueryClient, id: string) {
  void qc.prefetchQuery(personQuery(id));
  void qc.prefetchQuery(personCallsQuery(id));
  void qc.prefetchQuery(personNotesQuery(id));
  void qc.prefetchQuery(personTasksQuery(id));
  void qc.prefetchQuery(personActivitiesQuery(id));
}

// ---- prefetching --------------------------------------------------------------------
/** Loads a tab's data into the cache ahead of the click. Uses the same keys as the pages. */
export function prefetchRoute(qc: QueryClient, href: string, workspaceId: string, userId: string) {
  if (href === '/app') {
    void qc.prefetchQuery(todayQueueQuery(workspaceId, userId));
    void qc.prefetchQuery(todayStatsQuery(workspaceId, userId));
    void qc.prefetchQuery(numbersQuery(workspaceId));
  } else if (href === '/app/leads') {
    void qc.prefetchQuery(industriesQuery());
    void qc.prefetchQuery(savedSearchesQuery(workspaceId));
    void qc.prefetchQuery(listsQuery(workspaceId, userId));
    // the first page of results, once the markets are known and the table's size is remembered
    void qc.fetchQuery(marketsQuery(workspaceId)).then((allowed) => {
      const pageSize = knownFitRows('leads');
      if (pageSize) void qc.prefetchQuery(leadsQuery(workspaceId, { ...EMPTY_FILTERS, q: '', countries: allowed }, 0, pageSize));
    }).catch(() => {});
  } else if (href === '/app/companies') void qc.prefetchQuery(companiesQuery(workspaceId));
  else if (href === '/app/lists' || href === '/app/dialler') void qc.prefetchQuery(listsQuery(workspaceId, userId));
  else if (href === '/app/calls') {
    void qc.prefetchQuery(callsQuery(workspaceId, DEFAULT_CALL_FILTERS));
    void qc.prefetchQuery(listsQuery(workspaceId, userId));
  } else if (href === '/app/dashboard') {
    for (const { start, end } of dashboardRanges('week')) void qc.prefetchQuery(dashboardQuery(workspaceId, start, end));
  }
}

/** Every main tab plus the dashboard: run once at idle after the first page has its data. */
export const PREFETCH_ROUTES = ['/app', '/app/leads', '/app/lists', '/app/calls', '/app/dialler', '/app/dashboard'];

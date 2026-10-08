'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Plus, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/lib/app-context';
import { useAllLists, useMemberNames } from '@/lib/hooks';
import { fromSaved, isSet, LEAD_FILTERS, LOCAL_FILTERS } from '@/lib/lead-search';
import { searchListHref } from '@/lib/queries';
import type { List } from '@/lib/types';
import { supabase } from '@/lib/supabase/client';
import { cn, timeAgo } from '@/lib/utils';
import { useFirstReveal } from '@/components/ui/reveal';
import { ListPickerDialog } from '@/components/app/records';
import { summary } from '@/components/app/smart-filters';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, EmptyState, ErrorCard, Skeleton } from '@/components/ui/display';
import { useToast } from '@/components/ui/overlay';

export default function ListsPage() {
  const firstReveal = useFirstReveal('lists:cards');
  const { workspace } = useApp();
  const router = useRouter();
  const toast = useToast();
  const names = useMemberNames();
  const lists = useAllLists();
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);

  // last call per list, for the "last called" line on each card
  const lastCalled = useQuery({
    queryKey: ['lists', 'last-called', workspace.id],
    queryFn: async () => {
      const { data } = await supabase().from('calls').select('list_id,started_at').eq('workspace_id', workspace.id).not('list_id', 'is', null).order('started_at', { ascending: false }).limit(500);
      const map: Record<string, string> = {};
      (data ?? []).forEach((c) => {
        if (c.list_id && !map[c.list_id]) map[c.list_id] = c.started_at;
      });
      return map;
    },
  });

  // the dialler opens on the list, ready to start
  const start = (id: string) => router.push(`/app/dialler?list=${id}&new=1`);

  const removeSearch = async (l: List) => {
    const { error } = await supabase().from('lists').delete().eq('id', l.id);
    if (error) return toast('That list could not be deleted.');
    void qc.invalidateQueries({ queryKey: ['lists', workspace.id] });
    toast(`Deleted “${l.name}”`);
  };

  return (
    <div className="flex h-full flex-col">
      {/* same toolbar as the other tabs: count on the left, the action on the right */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white-800 px-4">
        <span className="text-sm tabular-nums text-black-700">
          {lists.data ? `${lists.data.length} ${lists.data.length === 1 ? 'list' : 'lists'}` : 'Loading'}
        </span>
        <span className="text-sm text-white-900 max-md:hidden">Lists of people to call, and searches you saved from Leads and Local businesses.</span>
        <Button size="compact" variant="primary" className="ml-auto" onClick={() => setCreating(true)}>
          <Plus size={14} strokeWidth={1.5} /> New list
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">

      {lists.error ? (
        <ErrorCard message={(lists.error as Error).message} onRetry={() => lists.refetch()} />
      ) : lists.isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card p-4" aria-busy>
              <Skeleton className="h-6 w-40" />
              <Skeleton className="mt-2 w-20" />
              <div className="mt-4 flex items-center gap-2 border-t border-white-800 pt-3">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-3 flex-1" />
                <Skeleton className="h-8 w-28" />
              </div>
            </div>
          ))}
        </div>
      ) : !lists.data?.length ? (
        <div className="card">
          <EmptyState title="Create your first list" description="Group the people you want to call, or save a search from Leads to come back to it." action={<Button variant="primary" onClick={() => setCreating(true)}>New list</Button>} />
        </div>
      ) : (
        <div className={cn(firstReveal && 'stagger', 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3')}>
          {lists.data.map((l) =>
            l.search ? (
              <SearchListCard key={l.id} list={l} owner={names[l.owner_id]} onOpen={() => router.push(searchListHref(l))} onDelete={() => void removeSearch(l)} />
            ) : (
              <article key={l.id} className="card flex flex-col p-4 transition-colors hover:border-black-700">
                <Link href={`/app/lists/${l.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="truncate text-md font-medium text-black-400">{l.name}</h2>
                    {!l.is_shared ? <Badge>Private</Badge> : null}
                  </div>
                  <p className="tabular mt-1 text-black-700">
                    {l.count} {l.count === 1 ? 'person' : 'people'}
                  </p>
                </Link>
                <div className="mt-auto flex items-center gap-2 border-t border-white-800 pt-3">
                  <Avatar name={names[l.owner_id]} size={20} />
                  <span className="t-caption min-w-0 flex-1 truncate text-black-700">
                    {names[l.owner_id] ?? 'Teammate'} · {lastCalled.data?.[l.id] ? `called ${timeAgo(lastCalled.data[l.id])}` : 'not called yet'}
                  </span>
                  <Button size="compact" disabled={!l.count} onClick={() => start(l.id)}>
                    <Phone size={14} strokeWidth={1.5} /> Start calling
                  </Button>
                </div>
              </article>
            ),
          )}
        </div>
      )}

      </div>
      <ListPickerDialog open={creating} createOnly onClose={() => setCreating(false)} onPick={(id) => router.push(`/app/lists/${id}`)} />
    </div>
  );
}

/** A saved search: its filters as chips, opened as a live search on Leads or Local businesses. */
function SearchListCard({ list, owner, onOpen, onDelete }: { list: List & { count: number }; owner?: string; onOpen: () => void; onDelete: () => void }) {
  const { filters, q } = fromSaved(list.search ?? {});
  const defs = list.search_source === 'local' ? LOCAL_FILTERS : LEAD_FILTERS;
  const chips = [...(q ? [`“${q}”`] : []), ...defs.filter((d) => isSet(d, filters)).map((d) => summary(d, filters))];
  return (
    <article className="card flex flex-col p-4 transition-colors hover:border-black-700">
      <button onClick={onOpen} className="block text-left">
        <div className="flex items-start justify-between gap-2">
          <h2 className="truncate text-md font-medium text-black-400">{list.name}</h2>
          <span className="tag tag-1 shrink-0">{list.search_source === 'local' ? 'Local search' : 'Leads search'}</span>
        </div>
        <div className="mt-2 flex h-[22px] flex-wrap gap-1 overflow-hidden">
          {chips.length ? chips.map((c) => <span key={c} className="tag tag-7 max-w-[220px] truncate">{c}</span>) : <span className="text-black-700">All {list.search_source === 'local' ? 'businesses' : 'leads'}</span>}
        </div>
      </button>
      <div className="mt-auto flex items-center gap-2 border-t border-white-800 pt-3">
        <Avatar name={owner} size={20} />
        <span className="t-caption min-w-0 flex-1 truncate text-black-700">
          {owner ?? 'Teammate'} · saved {timeAgo(list.created_at)}
        </span>
        <Button size="icon-compact" variant="ghost" aria-label={`Delete ${list.name}`} onClick={onDelete}>
          <Trash2 size={14} strokeWidth={1.5} />
        </Button>
        <Button size="compact" onClick={onOpen}>
          <Search size={14} strokeWidth={1.5} /> Open search
        </Button>
      </div>
    </article>
  );
}

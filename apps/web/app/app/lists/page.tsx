'use client';
import { useQuery } from '@tanstack/react-query';
import { Phone, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useApp } from '@/lib/app-context';
import { useLists, useMemberNames } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import { cn, timeAgo } from '@/lib/utils';
import { useFirstReveal } from '@/components/ui/reveal';
import { ListPickerDialog } from '@/components/app/records';
import { Button } from '@/components/ui/button';
import { Avatar, Badge, EmptyState, ErrorCard, Skeleton } from '@/components/ui/display';
import { useToast } from '@/components/ui/overlay';

export default function ListsPage() {
  const firstReveal = useFirstReveal('lists:cards');
  const { workspace } = useApp();
  const router = useRouter();
  const toast = useToast();
  const names = useMemberNames();
  const lists = useLists();
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState<string | null>(null);

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

  const start = async (id: string) => {
    setStarting(id);
    const { data, error } = await supabase().rpc('start_calling_list', { p_list_id: id });
    setStarting(null);
    if (error) return toast(`Could not start: ${error.message}`);
    toast(`${data ?? 0} people queued for you`);
    router.push('/app');
  };

  return (
    <div className="flex h-full flex-col">
      {/* same toolbar as the other tabs: count on the left, the action on the right */}
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-white-800 px-4">
        <span className="text-sm tabular-nums text-black-700">
          {lists.data ? `${lists.data.length} ${lists.data.length === 1 ? 'list' : 'lists'}` : 'Loading'}
        </span>
        <span className="text-sm text-white-900 max-md:hidden">Start a list to put it in your Today queue.</span>
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
          <EmptyState title="Create your first list" description="Group the people you want to call, then work the list top to bottom." action={<Button variant="primary" onClick={() => setCreating(true)}>New list</Button>} />
        </div>
      ) : (
        <div className={cn(firstReveal && 'stagger', 'grid gap-3 sm:grid-cols-2 lg:grid-cols-3')}>
          {lists.data.map((l) => (
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
              <div className="mt-4 flex items-center gap-2 border-t border-white-800 pt-3">
                <Avatar name={names[l.owner_id]} size={20} />
                <span className="t-caption min-w-0 flex-1 truncate text-black-700">
                  {names[l.owner_id] ?? 'Teammate'} · {lastCalled.data?.[l.id] ? `called ${timeAgo(lastCalled.data[l.id])}` : 'not called yet'}
                </span>
                <Button size="compact" disabled={!l.count} loading={starting === l.id} onClick={() => start(l.id)}>
                  <Phone size={14} strokeWidth={1.5} /> Start calling
                </Button>
              </div>
            </article>
          ))}
        </div>
      )}

      </div>
      <ListPickerDialog open={creating} createOnly onClose={() => setCreating(false)} onPick={(id) => router.push(`/app/lists/${id}`)} />
    </div>
  );
}

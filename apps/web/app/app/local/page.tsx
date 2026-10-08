'use client';
// Local businesses: the real listings table with stackable filters (see components/app/local-view.tsx).
// ?search=<list id> opens a saved search list.
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useApp } from '@/lib/app-context';
import { fromSaved } from '@/lib/lead-search';
import { searchListQuery } from '@/lib/queries';
import { LocalView } from '@/components/app/local-view';

export default function LocalPage() {
  return (
    <Suspense fallback={null}>
      <Local />
    </Suspense>
  );
}

function Local() {
  const params = useSearchParams();
  const { workspace } = useApp();
  const searchId = params.get('search');
  const saved = useQuery({ ...searchListQuery(workspace.id, searchId ?? ''), enabled: !!searchId });
  if (searchId && saved.isLoading) return null;
  const list = saved.data?.search_source === 'local' ? saved.data : null;
  const loaded = list?.search ? fromSaved(list.search) : null;
  return <LocalView key={list?.id ?? 'all'} initialFilters={loaded?.filters} initialText={loaded?.q} savedList={list ? { id: list.id, name: list.name } : undefined} />;
}

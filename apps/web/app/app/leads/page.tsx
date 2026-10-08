'use client';
// Leads: the real lead database with stackable filters (see components/app/leads-view.tsx).
// This is the app's home page. ?search=<list id> opens a saved search list.
import { useQuery } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useApp } from '@/lib/app-context';
import { TRIAL_CREDITS } from '@/lib/constants';
import { fromSaved } from '@/lib/lead-search';
import { searchListQuery } from '@/lib/queries';
import { LeadsView } from '@/components/app/leads-view';
import { LeadsSkeleton } from '@/components/app/skeletons';
import { useToast } from '@/components/ui/overlay';

export default function LeadsPage() {
  return (
    <Suspense fallback={<LeadsSkeleton />}>
      <Leads />
    </Suspense>
  );
}

function Leads() {
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const { workspace } = useApp();
  const searchId = params.get('search');
  const saved = useQuery({ ...searchListQuery(workspace.id, searchId ?? ''), enabled: !!searchId });

  // first arrival from onboarding: an overlay toast, so nothing on the page moves
  useEffect(() => {
    if (params.get('welcome') !== '1') return;
    toast(`Welcome to Decibel. Your first ${TRIAL_CREDITS.toLocaleString('en-GB')} credits are free.`);
    router.replace('/app/leads');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (searchId && saved.isLoading) return <LeadsSkeleton />;
  const list = saved.data?.search_source === 'leads' ? saved.data : null;
  const loaded = list?.search ? fromSaved(list.search) : null;
  return <LeadsView key={list?.id ?? 'all'} initialFilters={loaded?.filters} initialText={loaded?.q} savedList={list ? { id: list.id, name: list.name } : undefined} />;
}

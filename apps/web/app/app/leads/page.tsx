'use client';
// Leads: the real lead database with stackable filters (see components/app/leads-view.tsx).
import { Suspense } from 'react';
import { LeadsView } from '@/components/app/leads-view';
import { LeadsSkeleton } from '@/components/app/skeletons';

export default function LeadsPage() {
  return (
    <Suspense fallback={<LeadsSkeleton />}>
      <LeadsView />
    </Suspense>
  );
}

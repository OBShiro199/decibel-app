'use client';
// Search with AI: describe who you want to call; results open in the normal search workspace.
import { Suspense } from 'react';
import { AiSearch } from '@/components/app/ai-search';

export default function AiSearchPage() {
  return (
    <Suspense fallback={null}>
      <AiSearch />
    </Suspense>
  );
}

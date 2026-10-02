import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCardSkeleton } from '@/components/app/skeletons';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Start free trial' };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton rows={3} />}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}

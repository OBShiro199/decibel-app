import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCardSkeleton } from '@/components/app/skeletons';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Log in' };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton rows={2} />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}

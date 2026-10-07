import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCardSkeleton } from '@/components/app/skeletons';
import { AuthForm } from '@/components/auth-form';

export const metadata: Metadata = { title: 'Log in', description: 'Log in to Decibel to search verified UK and EU mobiles and call them from your browser.', alternates: { canonical: '/login' } };

export default function Page() {
  return (
    <Suspense fallback={<AuthCardSkeleton rows={2} />}>
      <AuthForm mode="login" />
    </Suspense>
  );
}

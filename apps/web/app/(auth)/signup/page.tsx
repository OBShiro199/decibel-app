import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCardSkeleton } from '@/components/app/skeletons';
import { AuthForm } from '@/components/auth-form';
import { DesktopOnly } from '@/components/desktop-only';

export const metadata: Metadata = {
  title: 'Start your free trial',
  description: 'Try Decibel free for 14 days: 5,000 credits to reveal verified UK and EU mobiles, plus the browser power dialler. No card needed.',
  alternates: { canonical: '/signup' },
};

export default function Page() {
  return (
    <DesktopOnly>
      <Suspense fallback={<AuthCardSkeleton rows={3} />}>
        <AuthForm mode="signup" />
      </Suspense>
    </DesktopOnly>
  );
}

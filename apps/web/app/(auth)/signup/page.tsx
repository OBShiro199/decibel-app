import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuthCardSkeleton } from '@/components/app/skeletons';
import { AuthForm } from '@/components/auth-form';
import { DesktopOnly } from '@/components/desktop-only';

export const metadata: Metadata = { title: 'Start free trial' };

export default function Page() {
  return (
    <DesktopOnly>
      <Suspense fallback={<AuthCardSkeleton rows={3} />}>
        <AuthForm mode="signup" />
      </Suspense>
    </DesktopOnly>
  );
}

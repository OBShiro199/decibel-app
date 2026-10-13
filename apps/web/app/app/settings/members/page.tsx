'use client';
// Members moved to the Team page.
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function MembersRedirect() {
  const router = useRouter();
  useEffect(() => router.replace('/app/team'), [router]);
  return null;
}

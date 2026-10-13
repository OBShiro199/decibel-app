'use client';
// Merged into another settings page when settings were simplified (2026-10-13).
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Moved() {
  const router = useRouter();
  useEffect(() => router.replace('/app/settings/general'), [router]);
  return null;
}

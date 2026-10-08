'use client';
// TPS/CTPS checks: upload a list, every UK number is screened against the TPS and CTPS registers.
import { Suspense } from 'react';
import { TpsChecks } from '@/components/app/tps-checks';

export default function TpsChecksPage() {
  return (
    <Suspense fallback={null}>
      <TpsChecks />
    </Suspense>
  );
}

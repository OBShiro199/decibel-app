import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { stepBySlug } from '@/lib/onboarding';
import { OnboardingPreview } from './preview';

// Local design preview of the onboarding wizard on sample data (no sign-in).
// /dev-onboarding/icp shows step 3 with steps 1 and 2 done. Never available in production.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default async function Page({ params }: { params: Promise<{ step: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { step } = await params;
  const s = stepBySlug(step);
  if (!s) notFound();
  return <OnboardingPreview step={s.slug} n={s.n} />;
}

import type { Metadata } from 'next';

// Onboarding is for signed-in owners only: keep it out of search results.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return children;
}

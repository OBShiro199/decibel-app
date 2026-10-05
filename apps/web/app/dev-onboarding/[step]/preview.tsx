'use client';
import { installMockApi } from '@/lib/dev-preview/mock-api';
import { profile, workspace } from '@/lib/dev-preview/data';
import { Wizard } from '@/components/onboarding/wizard';
import type { StepSlug } from '@/lib/onboarding';
import type { Profile, Workspace } from '@/lib/types';

installMockApi();

export function OnboardingPreview({ step, n }: { step: StepSlug; n: number }) {
  const ws = {
    ...workspace,
    onboarding_completed_at: null,
    onboarding_state: { step: n, completed: Array.from({ length: n - 1 }, (_, i) => i + 1) },
  } as unknown as Workspace;
  return <Wizard step={step} user={{ id: profile.id, email: profile.email, emailConfirmed: true }} profile={profile as unknown as Profile} workspace={n === 1 ? null : ws} invited={false} />;
}

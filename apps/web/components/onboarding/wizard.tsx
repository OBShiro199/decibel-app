'use client';
import { ArrowLeft, Check } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { track } from '@/lib/analytics';
import { STEPS, stepBySlug, type StepSlug } from '@/lib/onboarding';
import { saveInBackground } from '@/lib/background-save';
import { supabase } from '@/lib/supabase/client';
import type { OnboardingState, Profile, Workspace } from '@/lib/types';
import { inter } from '@/lib/fonts';
import { cn } from '@/lib/utils';
import { Logo } from '@/components/marketing/logo';
import { SoftphoneProvider } from '@/components/softphone/provider';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/overlay';
import { BusinessStep, ComplianceStep, IcpStep, InviteStep, NumberStep, TestStep, WorkspaceStep } from './steps';

export interface StepProps {
  user: { id: string; email: string; emailConfirmed: boolean };
  profile: Profile;
  workspace: Workspace;
  state: OnboardingState;
  invited: boolean;
  /** Marks the step complete (merging `patch` into onboarding_state) and advances. */
  done: (patch?: Partial<OnboardingState>) => Promise<void>;
}

// The footer bar lives in the wizard shell so Back / Skip / Continue never move.
// Steps render their buttons into it through <StepFooter>.
interface Nav {
  footer: HTMLElement | null;
  go: (slug: StepSlug) => void;
  skip: React.ReactNode;
  /** Step 1 hands over the workspace it just created, so step 2 opens without a page load. */
  adopt: (ws: Workspace) => void;
}
const NavCtx = createContext<Nav>({ footer: null, go: () => {}, skip: null, adopt: () => {} });
export const useWizardNav = () => useContext(NavCtx);

export function StepFooter({ back, children }: { back?: StepSlug; children: React.ReactNode }) {
  const { footer, go, skip } = useContext(NavCtx);
  if (!footer) return null;
  return createPortal(
    <>
      {back ? (
        <Button variant="ghost" onClick={() => go(back)}>
          <ArrowLeft size={16} strokeWidth={1.5} /> Back
        </Button>
      ) : null}
      <div className="ml-auto flex items-center gap-3">
        {skip}
        {children}
      </div>
    </>,
    footer,
  );
}

export function Wizard({
  step: initialStep,
  user,
  profile,
  workspace: initialWorkspace,
  invited,
}: {
  step: StepSlug;
  user: StepProps['user'];
  profile: Profile;
  workspace: Workspace | null;
  invited: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  // Steps switch on the client (history.pushState), so the shell never remounts
  // and nothing waits on a server round trip between steps.
  const step = (stepBySlug(pathname.split('/')[2] ?? '')?.slug ?? initialStep) as StepSlug;
  const [workspace, setWorkspace] = useState(initialWorkspace);
  useEffect(() => setWorkspace(initialWorkspace), [initialWorkspace]);
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  const [finishing, setFinishing] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);

  const current = stepBySlug(step)!;
  const state: OnboardingState = workspace?.onboarding_state ?? { step: 1 };
  const completed = new Set(state.completed ?? []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [step]);

  const go = useCallback((slug: StepSlug) => {
    window.history.pushState(null, '', `/onboarding/${slug}`);
  }, []);

  const advance = useCallback(
    async (skipped: boolean, patch: Partial<OnboardingState> = {}) => {
      if (!workspace) return;
      track('onboarding_step_completed', { step: current.n, skipped });
      if (invited) {
        setFinishing(true);
        router.replace('/app');
        return;
      }
      const next = STEPS.find((s) => s.n === current.n + 1);
      const nextState: OnboardingState = {
        ...state,
        ...patch,
        step: next ? Math.max(state.step ?? 1, next.n) : current.n,
        completed: skipped ? [...completed].filter((n) => n !== current.n) : [...new Set([...completed, current.n])],
        skipped: skipped ? [...new Set([...(state.skipped ?? []), current.n])] : (state.skipped ?? []).filter((n) => n !== current.n),
      };
      const update: Record<string, unknown> = { onboarding_state: nextState };
      if (next) {
        // optimistic: move on at once, save in the background
        setWorkspace({ ...workspace, ...(patch.recording_policy ? { recording_policy: patch.recording_policy as Workspace['recording_policy'] } : {}), onboarding_state: nextState });
        go(next.slug);
        void saveInBackground(() => supabase().from('workspaces').update(update).eq('id', workspace.id), { what: 'your progress', toast });
        return;
      }
      setFinishing(true);
      update.onboarding_completed_at = new Date().toISOString();
      const ok = await saveInBackground(() => supabase().from('workspaces').update(update).eq('id', workspace.id), { what: 'your setup', toast });
      if (!ok) {
        setFinishing(false);
        return;
      }
      const started = state.started_at ? new Date(state.started_at).getTime() : null;
      track('onboarding_completed', { minutes_taken: started ? Math.round((Date.now() - started) / 60000) : null });
      router.replace('/app?welcome=1');
      router.refresh();
    },
    [completed, current.n, go, invited, router, state, toast, workspace],
  );

  const shared = workspace
    ? { user, profile, workspace, state, invited, done: (patch?: Partial<OnboardingState>) => advance(false, patch) }
    : null;

  const body =
    step === 'workspace' || !shared ? (
      <WorkspaceStep user={user} profile={profile} />
    ) : step === 'business' ? (
      <BusinessStep {...shared} />
    ) : step === 'icp' ? (
      <IcpStep {...shared} />
    ) : step === 'number' ? (
      <NumberStep {...shared} />
    ) : step === 'test' ? (
      <TestStep {...shared} />
    ) : step === 'compliance' ? (
      <ComplianceStep {...shared} />
    ) : (
      <InviteStep {...shared} />
    );

  const skip = invited ? (
    <button className="h-9 px-2 text-black-700 hover:text-black-400" onClick={() => router.replace('/app')}>
      Skip and open Decibel
    </button>
  ) : shared && current.skippable ? (
    <button className="h-9 px-2 text-black-700 hover:text-black-400" disabled={finishing} onClick={() => advance(true)}>
      Skip for now
    </button>
  ) : null;

  const page = (
    <div className="flex h-dvh flex-col overflow-hidden md:flex-row">
      <aside className="shrink-0 border-b border-white-800 bg-white-200 p-4 md:w-[var(--settings-rail-width)] md:border-b-0 md:border-r md:p-6">
        <Link href="/" aria-label="Decibel home" className="inline-block">
          <Logo />
        </Link>
        {invited ? (
          <p className="mt-6 text-black-700">One quick check and you are in: test your microphone and make a test call.</p>
        ) : (
          <ol className="mt-4 flex gap-1 overflow-x-auto md:mt-8 md:flex-col">
            {STEPS.map((s) => {
              const isDone = completed.has(s.n);
              const isCurrent = s.slug === step;
              const reachable = !!workspace && s.n !== 1 && s.n <= (state.step ?? 1);
              const content = (
                <>
                  <span
                    className={cn(
                      'flex h-5 w-6 shrink-0 items-center justify-center border tabular-nums text-xs transition-colors',
                      isDone ? 'border-success-500 bg-success-500 text-white-100' : isCurrent ? 'border-black-400 bg-white-300 text-black-400' : 'border-white-800 text-white-900',
                    )}
                  >
                    {isDone ? <Check size={12} strokeWidth={2.5} /> : String(s.n).padStart(2, '0')}
                  </span>
                  <span className="whitespace-nowrap">{s.label}</span>
                </>
              );
              // one weight for every state, so labels never change width
              const cls = cn(
                'flex h-9 w-full items-center gap-2.5 border px-2 text-left text-sm transition-colors',
                isCurrent ? 'border-white-800 bg-white-100 text-black-400' : 'border-transparent text-black-700',
              );
              return (
                <li key={s.slug} className="shrink-0">
                  {reachable && !isCurrent ? (
                    <button onClick={() => go(s.slug)} className={cn(cls, 'hover:bg-white-300')}>
                      {content}
                    </button>
                  ) : (
                    <span className={cls} aria-current={isCurrent ? 'step' : undefined}>
                      {content}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        )}
      </aside>

      <main className="dotgrid flex min-h-0 min-w-0 flex-1 flex-col bg-canvas">
        <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-[680px] px-4 py-8 md:px-6 md:py-12">
            <p className="eyebrow h-4">
              {invited ? 'Quick check' : `Step ${current.n} of ${STEPS.length}`}
            </p>
            <div key={step} className="step-in">
              {body}
            </div>
          </div>
        </div>
        {/* fixed action bar: same place on every step */}
        <div className="shrink-0 border-t border-white-800 bg-white-100">
          <div ref={setFooter} className="mx-auto flex h-[68px] w-full max-w-[680px] items-center gap-3 px-4 md:px-6" />
        </div>
      </main>
    </div>
  );

  return (
    <div className={`${inter.variable} app-shell`}>
    <NavCtx.Provider
      value={{
        footer,
        go,
        skip,
        adopt: (ws) => {
          setWorkspace(ws);
          go('business');
        },
      }}
    >
      {workspace ? (
        <SoftphoneProvider workspaceId={workspace.id} userId={user.id} recordingPolicy={workspace.recording_policy} listen={false}>
          {page}
        </SoftphoneProvider>
      ) : (
        page
      )}
    </NavCtx.Provider>
    <div id="app-portal" />
    </div>
  );
}

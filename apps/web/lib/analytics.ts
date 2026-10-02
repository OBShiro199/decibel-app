'use client';
// PostHog product analytics (PRD section 14). No-ops until NEXT_PUBLIC_POSTHOG_KEY is set.
import type { PostHog } from 'posthog-js';

let ph: PostHog | null = null;
let loading: Promise<void> | null = null;
let context: Record<string, unknown> = {};

function load(): Promise<void> {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key || typeof window === 'undefined') return Promise.resolve();
  if (!loading) {
    loading = import('posthog-js').then(({ default: posthog }) => {
      posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://eu.i.posthog.com',
        capture_pageview: false,
        persistence: 'localStorage+cookie',
      });
      ph = posthog;
    });
  }
  return loading;
}

/** workspace_id and plan ride on every event once set. */
export function setAnalyticsContext(next: { workspace_id?: string; plan?: string; user_id?: string; email?: string }) {
  context = { ...context, workspace_id: next.workspace_id, plan: next.plan };
  if (next.user_id) void load().then(() => ph?.identify(next.user_id!, next.email ? { email: next.email } : undefined));
}

export function track(event: string, properties: Record<string, unknown> = {}) {
  if (process.env.NODE_ENV === 'development') console.debug('[analytics]', event, properties);
  void load().then(() => ph?.capture(event, { ...context, ...properties }));
}

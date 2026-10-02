'use client';
import { Lock } from 'lucide-react';
import type { FunctionError } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';

/** Page header: H2, description, 1px rule, then the sections. */
export function SettingsPage({ title, description, actions, children }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="t-h2">{title}</h1>
          {description ? <p className="mt-2 max-w-2xl text-black-700">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      <hr className="mt-6 border-0 border-t border-white-800" />
      <div className="space-y-10 py-8">{children}</div>
    </div>
  );
}

export function Section({
  title,
  description,
  children,
  footer,
  actions,
  className,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className}>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="t-h4">{title}</h2>
          {description ? <p className="mt-1 max-w-2xl text-black-700">{description}</p> : null}
        </div>
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </div>
      {children}
      {footer ? <div className="mt-4 flex items-center justify-end gap-2">{footer}</div> : null}
    </section>
  );
}

/** Calm notice shown to members on admin-only controls. */
export function AdminOnly({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <p className={cn('t-small flex items-center gap-2 rounded-sm border border-white-800 bg-white-200 px-3 py-2 text-black-700', className)}>
      <Lock size={16} strokeWidth={1.5} className="shrink-0" />
      {children ?? 'Only owners and admins can change this.'}
    </p>
  );
}

export function Notice({ tone = 'neutral', children, className }: { tone?: 'neutral' | 'warning' | 'danger'; children: React.ReactNode; className?: string }) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : undefined}
      className={cn(
        't-small rounded-sm border px-3 py-2',
        tone === 'neutral' && 'border-white-800 bg-white-200 text-black-700',
        tone === 'warning' && 'border-warning-500 bg-warning-100 text-warning-700',
        tone === 'danger' && 'border-danger-500 bg-danger-100 text-danger-700',
        className,
      )}
    >
      {children}
    </div>
  );
}

export const errorMessage = (e: unknown): string => (e as { message?: string } | null)?.message || 'Something went wrong.';

export const BILLING_NOT_CONNECTED = 'Billing is not connected yet. Add Stripe keys to the Edge Function secrets to enable checkout.';

/** Maps billing Edge Function errors to calm copy. */
export function describeBillingError(e: unknown): string {
  const err = e as FunctionError;
  const m = err?.message ?? '';
  if (m === 'stripe_not_configured' || m === 'price_not_configured') return BILLING_NOT_CONNECTED;
  if (m === 'owner_only') return 'Only the workspace owner can do this.';
  if (m === 'forbidden') return 'Only owners and admins can do this.';
  if (/Failed to send a request|Failed to fetch/i.test(m)) return 'Could not reach the billing service. Check that the Edge Functions are deployed.';
  return m || 'Something went wrong.';
}

export const isBillingNotConfigured = (e: unknown) => ['stripe_not_configured', 'price_not_configured'].includes((e as FunctionError)?.message ?? '');

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Read-only mono field with a Copy button. */
export function CopyField({ value, onCopied }: { value: string; onCopied?: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={value} onFocus={(e) => e.currentTarget.select()} className="control t-mono min-w-0 flex-1 bg-white-200" aria-label="Value" />
      <button
        type="button"
        onClick={async () => {
          if (await copyText(value)) onCopied?.();
        }}
        className="h-9 shrink-0 rounded-sm border border-white-800 bg-white-100 px-3 transition-colors hover:border-black-700"
      >
        Copy
      </button>
    </div>
  );
}

/** Pages through an RLS-scoped select, 1,000 rows at a time. */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>, max = 100_000): Promise<T[]> {
  const out: T[] = [];
  const size = 1000;
  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < size) break;
  }
  return out;
}

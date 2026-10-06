'use client';
// Credits left, as a soft progress bar in the sidebar. The bar shows what is left out of
// everything the workspace has received; it turns amber when low and coral when nearly out.
import { Coins } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useApp } from '@/lib/app-context';
import { creditsGrantedQuery } from '@/lib/queries';
import { TRIAL_CREDITS } from '@/lib/constants';

const TONES = {
  ok: { track: '#e9effd', fill: 'linear-gradient(90deg, #a9c1f5, #5f86e0)' },
  low: { track: '#fbf1dc', fill: 'linear-gradient(90deg, #f3cf86, #d39a32)' },
  out: { track: '#fbe7e7', fill: 'linear-gradient(90deg, #f3aaaa, #e06b6b)' },
} as const;

export function CreditsMeter() {
  const { workspace } = useApp();
  const left = workspace.credit_balance;
  const granted = useQuery(creditsGrantedQuery(workspace.id));
  // until the total loads, assume the welcome amount so the bar doesn't jump much when it arrives
  const total = Math.max(granted.data ?? TRIAL_CREDITS, left, 1);
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const tone = TONES[left <= 0 || pct < 5 ? 'out' : pct < 20 ? 'low' : 'ok'];
  const label = `${left.toLocaleString('en-GB')} of ${total.toLocaleString('en-GB')} credits left`;

  return (
    <>
      <Link
        href="/app/settings/billing"
        title={label}
        className="mx-2 mb-2 block rounded-sm px-2 py-2 transition-colors hover:bg-white-300 max-[1100px]:hidden"
      >
        <span className="flex items-baseline justify-between">
          <span className="text-black-700">Credits</span>
          <span className="tabular-nums font-medium text-black-400">{left.toLocaleString('en-GB')} left</span>
        </span>
        <span
          role="progressbar"
          aria-label="Credits left"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={left}
          aria-valuetext={label}
          className="mt-1.5 block h-1.5 overflow-hidden rounded-full"
          style={{ background: tone.track }}
        >
          <span className="block h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.2,0,0,1)]" style={{ width: `${pct}%`, background: tone.fill }} />
        </span>
      </Link>
      {/* narrow sidebar: just the coin, with the number in its tooltip */}
      <Link href="/app/settings/billing" title={label} aria-label={label} className="mx-auto mb-1 hidden h-8 w-8 items-center justify-center rounded-sm text-black-700 hover:bg-white-300 max-[1100px]:flex">
        <Coins size={16} strokeWidth={1.5} />
      </Link>
    </>
  );
}

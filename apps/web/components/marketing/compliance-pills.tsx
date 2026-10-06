import { cn } from '@/lib/utils';

// There is no TPS "approval" scheme, so these say what Decibel does: every dial is screened.
const COMPLIANCE = ['GDPR compliant', 'TPS screened', 'CTPS screened'];

/** Shield-ticked pills for the hero and the pricing card. */
export function CompliancePills({ className }: { className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-2', className)} aria-label="Compliance">
      {COMPLIANCE.map((label) => (
        <li key={label} className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-white-800 bg-white-100 px-2.5 text-[13px] tracking-[-0.01em] text-black-400">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden className="text-[#5f86e0]">
            <path d="M8 1.5 2.5 3.5v4c0 3.3 2.3 6 5.5 7 3.2-1 5.5-3.7 5.5-7v-4L8 1.5Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            <path d="m5.6 8 1.7 1.7 3.2-3.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {label}
        </li>
      ))}
    </ul>
  );
}

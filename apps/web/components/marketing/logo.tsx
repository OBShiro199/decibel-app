import { cn } from '@/lib/utils';

/** Decibel wordmark: five sound bars + the name. Inherits colour from `currentColor`. */
export function LogoMark({ size = 20, className }: { size?: number; className?: string }) {
  const bars = [
    [1, 8, 4],
    [5, 4, 12],
    [9, 1, 18],
    [13, 5, 10],
    [17, 7, 6],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden className={className}>
      {bars.map(([x, y, h]) => (
        <rect key={x} x={x} y={y} width="2" height={h} rx="1" fill="currentColor" />
      ))}
    </svg>
  );
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-black-0', className)}>
      <LogoMark />
      <span className="font-display text-lg font-semibold leading-6 tracking-[-0.36px]">Decibel</span>
    </span>
  );
}

'use client';
import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/** The ear mark, exported from favicon.io into public/brand. */
export const EAR_SRC = '/brand/android-chrome-512x512.png';

/** Fallback mark (five sound bars) shown only if the ear image is missing. */
function BarsMark({ size = 20 }: { size?: number }) {
  const bars = [
    [1, 8, 4],
    [5, 4, 12],
    [9, 1, 18],
    [13, 5, 10],
    [17, 7, 6],
  ];
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden>
      {bars.map(([x, y, h]) => (
        <rect key={x} x={x} y={y} width="2" height={h} rx="1" fill="currentColor" />
      ))}
    </svg>
  );
}

export function LogoMark({ size = 24, className }: { size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  // the image can fail before hydration attaches onError, so check it once mounted too
  useEffect(() => {
    const img = ref.current;
    if (img && img.complete && img.naturalWidth === 0) setFailed(true);
  }, []);
  if (failed) return <BarsMark size={size - 4} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img ref={ref} src={EAR_SRC} alt="" aria-hidden width={size} height={size} onError={() => setFailed(true)} className={cn('shrink-0 object-contain', className)} style={{ width: size, height: size }} />
  );
}

/** Decibel logo: the ear, then the name. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-black-0', className)}>
      <LogoMark />
      <span className="font-display text-lg font-semibold leading-6 tracking-[-0.36px]">Decibel</span>
    </span>
  );
}

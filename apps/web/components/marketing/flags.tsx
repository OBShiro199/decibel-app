// Small UK and EU flags for the hero. Inline SVG (emoji flags don't render on
// Windows), drawn at one size with a hairline edge so they sit quietly in the copy.
import { useId } from 'react';
import { cn } from '@/lib/utils';

const BOX = 'inline-block shrink-0 overflow-hidden shadow-[0_0_0_1px_rgba(8,9,10,0.08)]';
// default size; pass className to size the flag to surrounding type instead
const SIZE = 'h-3 w-[18px] rounded-[2px]';

export function UkFlag({ className }: { className?: string }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice" className={cn(BOX, className ?? SIZE)} role="img" aria-label="United Kingdom">
      <clipPath id={`${id}t`}>
        <path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" />
      </clipPath>
      <rect width="60" height="30" fill="#012169" />
      <path d="M0,0 L60,30 M60,0 L0,30" stroke="#fff" strokeWidth="6" />
      <path d="M0,0 L60,30 M60,0 L0,30" clipPath={`url(#${id}t)`} stroke="#C8102E" strokeWidth="4" />
      <path d="M30,0 v30 M0,15 h60" stroke="#fff" strokeWidth="10" />
      <path d="M30,0 v30 M0,15 h60" stroke="#C8102E" strokeWidth="6" />
    </svg>
  );
}

// twelve five-point stars on a circle, radius one third of the flag's height
function star(cx: number, cy: number, r: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.382 : r;
    return `${(cx + rr * Math.cos(a)).toFixed(2)},${(cy + rr * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
}
const STARS = Array.from({ length: 12 }, (_, i) => {
  const a = (i * Math.PI) / 6;
  return star(45 + 20 * Math.sin(a), 30 - 20 * Math.cos(a), 3.6);
});

export function EuFlag({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 60" className={cn(BOX, className ?? SIZE)} role="img" aria-label="European Union">
      <rect width="90" height="60" fill="#003399" />
      {STARS.map((p) => (
        <polygon key={p} points={p} fill="#FFCC00" />
      ))}
    </svg>
  );
}

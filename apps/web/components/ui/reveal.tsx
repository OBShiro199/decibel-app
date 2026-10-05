'use client';
import { useRef } from 'react';
import { cn } from '@/lib/utils';

// Regions that have already faded in once this session. Refetches, filter changes,
// realtime updates and back-navigation never replay the entrance.
const revealed = new Set<string>();

/** True only on the first render of `id` this session: use it to gate an entrance class. */
export function useFirstReveal(id: string): boolean {
  const first = useRef(!revealed.has(id)).current;
  revealed.add(id);
  return first;
}

/** Fades its content in the first time `id` appears in this session, then never again. */
export function RevealOnce({ id, children, className, delay = 0 }: { id: string; children: React.ReactNode; className?: string; delay?: number }) {
  const animate = useRef(!revealed.has(id)).current;
  revealed.add(id);
  return (
    <div className={cn(animate && 'reveal-once', className)} style={animate && delay ? { animationDelay: `${Math.min(delay, 300)}ms` } : undefined}>
      {children}
    </div>
  );
}

'use client';
import { useSyncExternalStore } from 'react';
import { getConnection, subscribeConnection, type ConnectionStatus } from '@/lib/twilio/device';
import { cn } from '@/lib/utils';

const META: Record<ConnectionStatus, { label: string; dot: string; pulse?: boolean }> = {
  idle: { label: 'Starting', dot: 'bg-white-900' },
  connecting: { label: 'Connecting', dot: 'bg-warning-500', pulse: true },
  connected: { label: 'Connected', dot: 'bg-success-500' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-warning-500', pulse: true },
  offline: { label: 'Offline', dot: 'bg-danger-500' },
};

export function useConnectionStatus(): ConnectionStatus {
  return useSyncExternalStore(subscribeConnection, getConnection, () => 'idle');
}

/** Softphone link to Twilio: green when connected, amber pulsing while reconnecting, red offline. */
export function ConnectionDot({ withLabel = true, className }: { withLabel?: boolean; className?: string }) {
  const status = useConnectionStatus();
  const m = META[status];
  return (
    <span className={cn('inline-flex w-[104px] items-center gap-1.5 tabular-nums text-[10px] uppercase tracking-[0.06em] text-white-900', !withLabel && 'w-auto', className)} title={`Softphone ${m.label.toLowerCase()}`} role="status" aria-label={`Softphone ${m.label}`}>
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', m.dot, m.pulse && 'pulse-dot')} style={m.pulse ? { width: 6, height: 6 } : undefined} />
      {withLabel ? m.label : null}
    </span>
  );
}

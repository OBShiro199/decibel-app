'use client';
import { useEffect, useRef } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { track } from '@/lib/analytics';

export const COOKIE_KEY = 'decibels.cookies';
export const COOKIE_EVENT = 'decibels:cookies';
export type CookieChoice = 'essential' | 'analytics';

export function readCookieChoice(): CookieChoice | null {
  try {
    const v = window.localStorage.getItem(COOKIE_KEY);
    return v === 'essential' || v === 'analytics' ? v : null;
  } catch {
    return null;
  }
}

/** Marketing analytics are opt-in: nothing is sent unless the visitor accepted analytics. */
export function trackMarketing(event: string, props: Record<string, unknown> = {}) {
  if (typeof window === 'undefined' || readCookieChoice() !== 'analytics') return;
  track(event, props);
}

/** Fires `event` once per mount, immediately if analytics are allowed or as soon as they are accepted. */
export function TrackView({ event }: { event: string }) {
  const fired = useRef(false);
  useEffect(() => {
    const fire = () => {
      if (fired.current || readCookieChoice() !== 'analytics') return;
      fired.current = true;
      track(event);
    };
    fire();
    window.addEventListener(COOKIE_EVENT, fire);
    return () => window.removeEventListener(COOKIE_EVENT, fire);
  }, [event]);
  return null;
}

/** ButtonLink that reports `cta_click {location}`. */
export function CtaLink({ location, onClick, ...props }: React.ComponentProps<typeof ButtonLink> & { location: string }) {
  return (
    <ButtonLink
      {...props}
      onClick={(e) => {
        trackMarketing('cta_click', { location });
        onClick?.(e);
      }}
    />
  );
}

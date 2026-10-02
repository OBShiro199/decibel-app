'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { COOKIE_EVENT, COOKIE_KEY, type CookieChoice, readCookieChoice } from './analytics';

const REOPEN_EVENT = 'decibels:cookies-reopen';

/** Analytics stay off until the visitor explicitly accepts them. */
export function CookieBanner() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (readCookieChoice() === null) setOpen(true);
    const reopen = () => setOpen(true);
    window.addEventListener(REOPEN_EVENT, reopen);
    return () => window.removeEventListener(REOPEN_EVENT, reopen);
  }, []);

  if (!open) return null;

  const choose = (choice: CookieChoice) => {
    try {
      window.localStorage.setItem(COOKIE_KEY, choice);
    } catch {
      // storage unavailable: treat as essential-only for this visit
    }
    setOpen(false);
    window.dispatchEvent(new Event(COOKIE_EVENT));
  };

  return (
    <section
      aria-label="Cookie choices"
      className="fixed inset-x-4 bottom-4 z-menu mx-auto max-w-[560px] rounded-lg border border-white-800 bg-white-100 p-4 sm:inset-x-auto sm:left-4 sm:mx-0"
    >
      <p className="t-h4 text-black-0">Cookies</p>
      <p className="mt-1 text-black-700">
        We use essential storage to run the site. With your permission we also use privacy-friendly analytics to see which pages are useful. Analytics are
        off unless you accept.{' '}
        <Link href="/cookies" className="link">
          Cookie policy
        </Link>
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={() => choose('essential')}>Essential only</Button>
        <Button onClick={() => choose('analytics')}>Accept analytics</Button>
      </div>
    </section>
  );
}

/** Lets a visitor revisit their choice (used on the cookie policy page). */
export function CookieSettingsButton() {
  return <Button onClick={() => window.dispatchEvent(new Event(REOPEN_EVENT))}>Change cookie choice</Button>;
}

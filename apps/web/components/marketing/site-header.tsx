'use client';
import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { CtaLink } from './analytics';
import { Logo } from './logo';

const NAV = [
  { href: '/#product', label: 'Product' },
  { href: '/#data', label: 'Data' },
  { href: '/#pricing', label: 'Pricing' },
  { href: '/compliance', label: 'Compliance' },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className="sticky top-0 z-header h-16 border-b border-white-800 bg-white-200">
      <div className="mx-auto flex h-full max-w-[1180px] items-center gap-8 border-x border-white-800 px-5 md:px-8">
        <Link href="/" aria-label="Decibels home" className="rounded-sm" onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} className="flex h-8 items-center px-2.5 tabular-nums text-xs tracking-[0.06em] text-black-700 transition-colors hover:text-black-400">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" className="hidden md:inline-flex">
            Log in
          </ButtonLink>
          <CtaLink href="/signup" variant="primary" location="header">
            Start free trial
          </CtaLink>
          <button
            type="button"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="site-mobile-nav"
            onClick={() => setOpen((o) => !o)}
            className="flex h-9 w-9 items-center justify-center rounded-sm text-black-400 hover:bg-white-300 md:hidden"
          >
            {open ? <X size={16} strokeWidth={1.5} /> : <Menu size={16} strokeWidth={1.5} />}
          </button>
        </div>
      </div>
      <div id="site-mobile-nav" hidden={!open} className="absolute inset-x-0 top-full border-b border-white-800 bg-white-100 md:hidden">
        <nav aria-label="Mobile" className="mx-auto flex max-w-[1152px] flex-col px-4 py-2">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="t-body-lg flex h-11 items-center border-b border-white-800 text-black-400">
              {item.label}
            </Link>
          ))}
          <Link href="/login" onClick={() => setOpen(false)} className="t-body-lg flex h-11 items-center text-black-400">
            Log in
          </Link>
        </nav>
      </div>
    </header>
  );
}

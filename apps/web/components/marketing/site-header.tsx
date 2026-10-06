'use client';
import { ChevronDown, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ButtonLink } from '@/components/ui/button';
import { CRM_TOOLS } from '@/lib/integrations-data';
import { INDUSTRY_LINKS, PRODUCT_LINKS, type MarketingLink } from '@/lib/marketing-pages';
import { cn } from '@/lib/utils';
import { CtaLink } from './analytics';
import { Logo } from './logo';

type MenuId = 'product' | 'industries' | 'integrations';

const PLAIN = [
  { href: '/#pricing', label: 'Pricing' },
  { href: '/careers', label: 'Careers' },
];

const ASCII_FONT = "ui-monospace, 'SF Mono', SFMono-Regular, Menlo, Consolas, monospace";

function Glyph({ children }: { children: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-white-800 bg-white-200 text-[10px] text-black-700 transition-colors group-hover:border-white-900 group-hover:text-black-400" style={{ fontFamily: ASCII_FONT }} aria-hidden>
      {children}
    </span>
  );
}

function MenuLink({ link, onPick }: { link: MarketingLink; onPick: () => void }) {
  return (
    <Link href={link.href} onClick={onPick} className="group flex items-start gap-3 rounded-[6px] p-2 transition-colors hover:bg-white-200">
      <Glyph>{link.glyph}</Glyph>
      <span className="min-w-0">
        <span className="block text-[14px] font-medium tracking-[-0.01em] text-black-400">{link.label}</span>
        <span className="block text-[13px] leading-[18px] text-black-700">{link.blurb}</span>
      </span>
    </Link>
  );
}

function ProductPanel({ onPick }: { onPick: () => void }) {
  return (
    <div className="grid w-[800px] grid-cols-[1fr_230px]">
      <div className="p-3">
        <p className="px-2 pb-2 pt-1 text-[13px] tracking-[-0.01em] text-faint">[ Product ]</p>
        <div className="grid grid-cols-2 gap-1">
          {PRODUCT_LINKS.filter((l) => l.href !== '/integrations').map((l) => (
            <MenuLink key={l.href} link={l} onPick={onPick} />
          ))}
        </div>
        <Link href="/features" onClick={onPick} className="mx-2 mt-2 inline-flex text-[13px] text-black-700 hover:text-black-400">
          All features →
        </Link>
      </div>
      <div className="flex flex-col border-l border-white-800 bg-white-200 p-5">
        <p className="text-[13px] tracking-[-0.01em] text-faint">[ See it live ]</p>
        <p className="mt-3 text-[13px] leading-[19px] text-black-700">Fifteen minutes with the founder, on your own market. No slides.</p>
        <pre className="mt-auto select-none pt-5 text-[11px] leading-[14px] text-faint" style={{ fontFamily: ASCII_FONT }} aria-hidden>
          {'.-------------------.\n|  15 minutes,      |\n|  with the founder |\n\'-------------------\''}
        </pre>
        <Link href="/demo" onClick={onPick} className="mt-3 text-[13px] font-medium text-black-400 underline-offset-2 hover:underline">
          Book a 15-min demo →
        </Link>
      </div>
    </div>
  );
}

function IntegrationsPanel({ onPick }: { onPick: () => void }) {
  return (
    <div className="w-[640px] p-3">
      <div className="flex items-baseline justify-between px-2 pb-2 pt-1">
        <p className="text-[13px] tracking-[-0.01em] text-faint">[ CRM integrations · coming soon ]</p>
        <p className="text-[13px] text-black-700">CSV export available now</p>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {CRM_TOOLS.map((t) => (
          <Link key={t.id} href="/integrations" onClick={onPick} className="flex items-center gap-2.5 rounded-[6px] p-2 transition-colors hover:bg-white-200">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/integrations/${t.id}.webp`} alt="" width={24} height={24} className="h-6 w-6 shrink-0 rounded-[4px] border border-white-800 bg-white-100 object-contain p-0.5" loading="lazy" />
            <span className="truncate text-[13px] text-black-400">{t.name}</span>
          </Link>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-white-800 px-2 pt-3">
        <Link href="/integrations" onClick={onPick} className="text-[13px] font-medium text-black-400 hover:underline hover:underline-offset-2">
          See all integrations →
        </Link>
        <a href="mailto:oliver@usedecibel.com?subject=Integration%20request" className="text-[13px] text-black-700 hover:text-black-400">
          Request a tool
        </a>
      </div>
    </div>
  );
}

function IndustriesPanel({ onPick }: { onPick: () => void }) {
  return (
    <div className="w-[380px] p-3">
      <p className="px-2 pb-2 pt-1 text-[13px] tracking-[-0.01em] text-faint">[ Industries ]</p>
      <div className="space-y-1">
        {INDUSTRY_LINKS.map((l) => (
          <MenuLink key={l.href} link={l} onPick={onPick} />
        ))}
      </div>
      <Link href="/industries" onClick={onPick} className="mx-2 mt-2 inline-flex text-[13px] text-black-700 hover:text-black-400">
        All industries →
      </Link>
    </div>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false); // mobile menu
  const [menu, setMenu] = useState<MenuId | null>(null); // desktop dropdown
  const closeTimer = useRef<number | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  // close everything on navigation
  useEffect(() => {
    setMenu(null);
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open && !menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setMenu(null);
      }
    };
    const onDown = (e: MouseEvent) => {
      if (menu && navRef.current && !navRef.current.contains(e.target as Node)) setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
    };
  }, [open, menu]);

  // hover opens a menu; a short delay on leave lets the pointer cross the gap to the panel
  const enter = (id: MenuId) => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setMenu(id);
  };
  const leave = () => {
    closeTimer.current = window.setTimeout(() => setMenu(null), 140);
  };

  const trigger = (id: MenuId, label: string) => (
    <div className="relative" onMouseEnter={() => enter(id)} onMouseLeave={leave}>
      <button
        type="button"
        aria-expanded={menu === id}
        aria-haspopup="true"
        onClick={() => setMenu((m) => (m === id ? null : id))}
        className={cn('flex h-8 items-center gap-1 px-2.5 text-[15px] tracking-[-0.01em] transition-colors', menu === id ? 'text-black-400' : 'text-black-700 hover:text-black-400')}
      >
        {label}
        <ChevronDown size={12} strokeWidth={1.75} className={cn('transition-transform duration-150', menu === id && 'rotate-180')} />
      </button>
      {menu === id ? (
        <div className="absolute left-0 top-full pt-3">
          <div className="nav-panel overflow-hidden rounded-[6px] border border-white-800 bg-white-100 shadow-[0_18px_48px_rgba(18,18,18,0.10)]">
            {id === 'product' ? <ProductPanel onPick={() => setMenu(null)} /> : id === 'industries' ? <IndustriesPanel onPick={() => setMenu(null)} /> : <IntegrationsPanel onPick={() => setMenu(null)} />}
          </div>
        </div>
      ) : null}
    </div>
  );

  const mobileGroup = (title: string, links: { href: string; label: string }[]) => (
    <div className="border-b border-white-800 py-2">
      <p className="py-2 text-[13px] tracking-[-0.01em] text-faint">[ {title} ]</p>
      {links.map((l) => (
        <Link key={l.href} href={l.href} onClick={() => setOpen(false)} className="flex h-10 items-center text-base text-black-400">
          {l.label}
        </Link>
      ))}
    </div>
  );

  return (
    <header className="sticky top-0 z-header h-16 border-b border-white-800 bg-white-200">
      <div className="mx-auto flex h-full max-w-[1180px] items-center gap-8 border-x border-white-800 px-5 md:px-8">
        <Link href="/" aria-label="Decibel home" className="rounded-sm" onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <nav ref={navRef} aria-label="Main" className="hidden items-center gap-1 md:flex">
          {trigger('product', 'Product')}
          {trigger('industries', 'Industries')}
          {trigger('integrations', 'Integrations')}
          {PLAIN.map((item) => (
            <Link key={item.href} href={item.href} className="flex h-8 items-center px-2.5 text-[15px] tracking-[-0.01em] text-black-700 transition-colors hover:text-black-400">
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ButtonLink href="/login" variant="ghost" className="hidden lg:inline-flex">
            Log in
          </ButtonLink>
          <CtaLink href="/demo" location="header_demo" className="hidden lg:inline-flex">
            Book a demo
          </CtaLink>
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
      <div id="site-mobile-nav" hidden={!open} className="absolute inset-x-0 top-full max-h-[calc(100dvh-64px)] overflow-y-auto border-b border-white-800 bg-white-100 md:hidden">
        <nav aria-label="Mobile" className="mx-auto flex max-w-[1152px] flex-col px-4 pb-4">
          {mobileGroup('Product', [...PRODUCT_LINKS.filter((l) => l.href !== '/integrations'), { href: '/features', label: 'All features' }])}
          {mobileGroup('Integrations', [{ href: '/integrations', label: 'All integrations' }])}
          {mobileGroup('Industries', INDUSTRY_LINKS)}
          {mobileGroup('More', [...PLAIN, { href: '/blog', label: 'Blog' }, { href: '/demo', label: 'Book a 15-min demo' }, { href: '/login', label: 'Log in' }])}
        </nav>
      </div>
    </header>
  );
}

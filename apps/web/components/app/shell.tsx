'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { prefetchRoute } from '@/lib/queries';
import {
  Building2, Check, ChevronsUpDown, Coins, Database, List as ListIcon, LogOut, Phone, Plus, Settings, Sun, Zap,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppProvider, useApp, type AppContextValue } from '@/lib/app-context';
import { supabase } from '@/lib/supabase/client';
import { destroyDevice } from '@/lib/twilio/device';
import type { Person } from '@/lib/types';
import { cn } from '@/lib/utils';
import { SidebarCallWidget, SoftphoneToggle } from '@/components/app/quick-dial';
import { SoftphoneProvider } from '@/components/softphone/provider';
import { Avatar, CompanyLogo } from '@/components/ui/display';
import { LogoMark } from '@/components/marketing/logo';
import { Dialog, MenuItem, Popover } from '@/components/ui/overlay';

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: '/app', label: 'Today', icon: Sun, exact: true },
  { href: '/app/leads', label: 'Leads', icon: Database },
  { href: '/app/companies', label: 'Companies', icon: Building2 },
  { href: '/app/lists', label: 'Lists', icon: ListIcon },
  { href: '/app/calls', label: 'Calls', icon: Phone },
  { href: '/app/dialler', label: 'Power dialler', icon: Zap },
];


export function AppShell({
  initial,
  children,
}: {
  initial: Omit<AppContextValue, 'refreshWorkspace' | 'switchWorkspace' | 'isAdmin' | 'isOwner'>;
  children: React.ReactNode;
}) {
  return (
    <AppProvider initial={initial}>
      <ShellInner>{children}</ShellInner>
    </AppProvider>
  );
}

// false on the server and during hydration, true on every client render after that
const noopSubscribe = () => () => {};
function useHydrated() {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const { workspace, user } = useApp();
  // Page content is client data (TanStack Query). The sidebar prefetches other pages' data,
  // and that can land before a slow page chunk hydrates, so the first client render would
  // differ from the server HTML. Pages therefore mount just after hydration; the shell and
  // sidebar still render on the server. Client-side navigation is unaffected.
  const hydrated = useHydrated();
  return (
    <div className={`app-shell`}>
      <SoftphoneProvider workspaceId={workspace.id} userId={user.id} recordingPolicy={workspace.recording_policy}>
        <div className="flex h-dvh">
          <Sidebar />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas [scrollbar-gutter:stable]">{hydrated ? children : null}</main>
        </div>
        <ShortcutsDialog />
      </SoftphoneProvider>
      <div id="app-portal" />
    </div>
  );
}

function AccountMenu() {
  const router = useRouter();
  const { profile } = useApp();
  const signOut = async () => {
    destroyDevice();
    await supabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  };
  return (
    <div className="min-w-0 flex-1 max-[1100px]:flex-none">
      <Popover
        side="top"
        className="w-56"
        trigger={({ toggle }) => (
          <button onClick={toggle} aria-label="Account menu" className="flex h-8 w-full min-w-0 items-center gap-2 rounded-sm px-1.5 hover:bg-white-300">
            <Avatar name={profile.full_name || profile.email} src={profile.avatar_url} size={22} />
            <span className="truncate text-sm max-[1100px]:hidden">{profile.full_name || profile.email}</span>
          </button>
        )}
      >
        {(close) => (
          <>
            <p className="truncate px-2 py-1.5 text-sm text-black-700">{profile.email}</p>
            <Link href="/app/settings/profile" onClick={close} className="flex h-8 items-center gap-2 rounded-sm px-2 text-base hover:bg-white-300">
              <Settings size={16} strokeWidth={1.5} /> Settings
            </Link>
            <Link href="/app/settings/billing" onClick={close} className="flex h-8 items-center gap-2 rounded-sm px-2 text-base hover:bg-white-300">
              <Coins size={16} strokeWidth={1.5} /> Billing and credits
            </Link>
            <MenuItem onClick={signOut}>
              <LogOut size={16} strokeWidth={1.5} /> Log out
            </MenuItem>
          </>
        )}
      </Popover>
    </div>
  );
}

function Sidebar() {
  const pathname = usePathname();
  const { workspace, workspaces, profile, switchWorkspace, user } = useApp();
  const qc = useQueryClient();
  const prefetch = (href: string) => prefetchRoute(qc, href, workspace.id, user.id);
  // once the current page settles, warm the other tabs so switching shows real content
  useEffect(() => {
    const t = window.setTimeout(() => NAV.forEach(({ href }) => prefetch(href)), 2500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);
  return (
    <nav
      aria-label="Main"
      className="flex w-[var(--sidebar-width)] shrink-0 flex-col border-r border-white-800 bg-canvas transition-[width]"
    >
      <Link href="/app" aria-label="Decibel home" className="flex h-11 shrink-0 items-center gap-1.5 border-b border-white-800 px-4 max-[1100px]:justify-center max-[1100px]:px-0">
        <LogoMark size={20} />
        <span className="font-semibold tracking-[-0.02em] text-black-400 max-[1100px]:hidden">Decibel</span>
      </Link>
      <div className="p-2">
        <Popover
          className="w-60"
          trigger={({ toggle }) => (
            <button onClick={toggle} className="flex h-9 w-full items-center gap-2 rounded-sm px-2 hover:bg-white-300" aria-label="Switch workspace">
              <CompanyLogo name={workspace.name} src={workspace.logo_url} size={20} />
              <span className="min-w-0 flex-1 truncate text-left font-semibold max-[1100px]:hidden">{workspace.name}</span>
              <ChevronsUpDown size={14} strokeWidth={1.5} className="shrink-0 text-black-700 max-[1100px]:hidden" />
            </button>
          )}
        >
          {(close) => (
            <>
              <p className="t-caption px-2 py-1.5 text-black-700">Workspaces</p>
              {workspaces.map((w) => (
                <MenuItem
                  key={w.id}
                  onClick={() => {
                    close();
                    if (w.id !== workspace.id) void switchWorkspace(w.id);
                  }}
                >
                  <CompanyLogo name={w.name} src={w.logo_url} size={20} />
                  <span className="min-w-0 flex-1 truncate">{w.name}</span>
                  {w.id === workspace.id ? <Check size={14} strokeWidth={1.5} /> : null}
                </MenuItem>
              ))}
              <div className="my-1 border-t border-white-800" />
              <Link href="/onboarding/workspace?new=1" className="flex h-8 items-center gap-2 rounded-sm px-2 hover:bg-white-300">
                <Plus size={16} strokeWidth={1.5} /> New workspace
              </Link>
            </>
          )}
        </Popover>
      </div>

      <div className="px-2 pb-2">
        <SoftphoneToggle />
      </div>
      <ul className="flex flex-1 flex-col gap-0.5 px-2">
        {NAV.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
          return (
            <li key={href}>
              <Link
                href={href}
                title={label}
                onMouseEnter={() => prefetch(href)}
                onFocus={() => prefetch(href)}
                aria-current={active ? 'page' : undefined}
                className={cn('nav-item flex h-8 items-center gap-2 px-2 text-sm transition-colors', active ? 'text-black-400' : 'text-black-700 hover:bg-white-300 hover:text-black-400')}
              >
                {href === '/app/dialler' ? (
                  <>
                    <Icon size={16} strokeWidth={1.7} className="shrink-0" style={{ color: 'var(--dialler)' }} />
                    <span className="relative max-[1100px]:hidden">
                      {label}
                      {/* a light-orange underline marks the dialler */}
<span aria-hidden className="pointer-events-none absolute -bottom-[3px] left-0 h-[2px] w-full rounded-full" style={{ background: 'var(--dialler)', opacity: 0.7 }} />
                    </span>
                  </>
                ) : (
                  <>
                    <Icon size={16} strokeWidth={1.5} className="shrink-0" />
                    <span className="truncate max-[1100px]:hidden">{label}</span>
                  </>
                )}
              </Link>
            </li>
          );
        })}
      </ul>

      <SidebarCallWidget />
      <div className="flex items-center gap-1 border-t border-white-800 p-2 max-[1100px]:flex-col">
        <AccountMenu />
        <Link
          href="/app/settings/billing"
          title="Data credits"
          className="flex h-8 shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs text-black-700 tabular-nums hover:bg-white-300 hover:text-black-400"
        >
          <Coins size={14} strokeWidth={1.5} />
          <span className="min-w-[2ch] text-right max-[1100px]:hidden">{workspace.credit_balance}</span>
        </Link>
        <Link href="/app/settings" title="Settings" aria-label="Settings" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-black-700 hover:bg-white-300">
          <Settings size={16} strokeWidth={1.5} />
        </Link>
      </div>
    </nav>
  );
}


const SHORTCUTS: [string, string][] = [
  ['j / k', 'Move down / up a table'],
  ['Enter', 'Open the selected record'],
  ['c', 'Call the selected person'],
  ['n', 'Skip to the next person (Today)'],
  ['1 – 9', 'Pick a call outcome after hanging up'],
  ['Esc', 'Close or minimise drawers'],
  ['?', 'Show this list'],
];

function ShortcutsDialog() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (e.key === '?') setOpen(true);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  return (
    <Dialog open={open} onClose={() => setOpen(false)} title="Keyboard shortcuts">
      <ul className="divide-y divide-white-800">
        {SHORTCUTS.map(([keys, label]) => (
          <li key={keys} className="flex h-10 items-center justify-between">
            <span>{label}</span>
            <span className="kbd px-2">{keys}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

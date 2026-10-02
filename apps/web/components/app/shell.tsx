'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { prefetchRoute } from '@/lib/queries';
import {
  Building2, Check, ChevronsUpDown, Coins, Database, Kanban, List as ListIcon, LogOut, Phone, Plus, Search, Settings, Sun, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AppProvider, useApp, type AppContextValue } from '@/lib/app-context';
import { useDebounced } from '@/lib/hooks';
import { supabase } from '@/lib/supabase/client';
import { destroyDevice } from '@/lib/twilio/device';
import type { Person } from '@/lib/types';
import { cn } from '@/lib/utils';
import { QuickCallButton, SidebarCallWidget } from '@/components/app/quick-dial';
import { SoftphonePanel } from '@/components/softphone/drawer';
import { SoftphoneProvider } from '@/components/softphone/provider';
import { Avatar, CompanyLogo } from '@/components/ui/display';
import { Dialog, MenuItem, Popover } from '@/components/ui/overlay';

const NAV: { href: string; label: string; icon: LucideIcon; exact?: boolean }[] = [
  { href: '/app', label: 'Today', icon: Sun, exact: true },
  { href: '/app/leads', label: 'Leads', icon: Database },
  { href: '/app/people', label: 'People', icon: Users },
  { href: '/app/companies', label: 'Companies', icon: Building2 },
  { href: '/app/lists', label: 'Lists', icon: ListIcon },
  { href: '/app/pipeline', label: 'Pipeline', icon: Kanban },
  { href: '/app/calls', label: 'Calls', icon: Phone },
];

const TITLES: Record<string, string> = {
  '/app': 'Today',
  '/app/leads': 'Leads',
  '/app/people': 'People',
  '/app/companies': 'Companies',
  '/app/lists': 'Lists',
  '/app/pipeline': 'Pipeline',
  '/app/calls': 'Calls',
  '/app/dashboard': 'Dashboard',
  '/app/settings': 'Settings',
};

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

function ShellInner({ children }: { children: React.ReactNode }) {
  const { workspace, user } = useApp();
  return (
    <SoftphoneProvider workspaceId={workspace.id} userId={user.id} recordingPolicy={workspace.recording_policy} docked>
      <div className="app-shell flex h-dvh">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="min-h-0 flex-1 overflow-y-auto bg-canvas [scrollbar-gutter:stable]">{children}</main>
        </div>
        {/* permanent softphone column on wide screens: nothing reflows when a call starts */}
        <div className="hidden w-[var(--softphone-width)] shrink-0 border-l border-white-800 xl:block">
          <SoftphonePanel mode="docked" />
        </div>
      </div>
      <ShortcutsDialog />
    </SoftphoneProvider>
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
                className={cn(
                  't-small flex h-8 items-center gap-2 rounded-sm px-2 transition-colors',
                  active ? 'bg-white-100 text-black-400 shadow-[inset_0_0_0_1px_var(--color-white-800)]' : 'text-black-700 hover:bg-white-300',
                )}
              >
                <Icon size={16} strokeWidth={1.5} className="shrink-0" />
                <span className="truncate max-[1100px]:hidden">{label}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <SidebarCallWidget />
      <div className="flex items-center gap-2 border-t border-white-800 p-2">
        <Link href="/app/settings/profile" className="flex h-8 min-w-0 flex-1 items-center gap-2 rounded-sm px-2 hover:bg-white-300 max-[1100px]:hidden">
          <Avatar name={profile.full_name || profile.email} src={profile.avatar_url} size={20} />
          <span className="t-small truncate">{profile.full_name || profile.email}</span>
        </Link>
        <Link href="/app/settings" title="Settings" aria-label="Settings" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-sm text-black-700 hover:bg-white-300 max-[1100px]:mx-auto">
          <Settings size={16} strokeWidth={1.5} />
        </Link>
      </div>
    </nav>
  );
}

function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { workspace, profile } = useApp();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const base = '/' + pathname.split('/').slice(1, 3).join('/');
  const title = TITLES[pathname] ?? TITLES[base] ?? 'Decibels';
  const nested = pathname !== base && TITLES[base];

  const signOut = async () => {
    destroyDevice();
    await supabase().auth.signOut();
    router.replace('/login');
    router.refresh();
  };

  return (
    <header className="flex h-[var(--topbar-height)] shrink-0 items-center gap-3 border-b border-white-800 bg-white-100 px-4">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {nested ? (
          <>
            <Link href={base} className="text-black-700 hover:text-black-400">
              {title}
            </Link>
            <span className="text-white-900">/</span>
            <span className="truncate">Record</span>
          </>
        ) : (
          <span className="truncate font-semibold">{title}</span>
        )}
      </div>
      <button
        onClick={() => setSearchOpen(true)}
        className="flex h-8 w-56 items-center gap-2 rounded-sm border border-white-800 px-2 text-white-900 hover:border-black-700 max-md:w-8 max-md:justify-center"
        aria-label="Search"
      >
        <Search size={16} strokeWidth={1.5} />
        <span className="flex-1 text-left max-md:hidden">Search</span>
        <span className="kbd max-md:hidden">⌘K</span>
      </button>
      <div className="xl:hidden">
        <QuickCallButton />
      </div>
      <Link href="/app/settings/billing" className="flex h-8 items-center gap-1.5 border border-white-800 px-2.5 tabular-nums text-[12px] hover:border-white-900" title="Data credits">
        <Coins size={14} strokeWidth={1.5} />
        <span className="tabular min-w-[2ch] text-right">{workspace.credit_balance}</span>
        <span className="text-black-700 max-md:hidden">credits</span>
      </Link>
      <Popover
        align="right"
        trigger={({ toggle }) => (
          <button onClick={toggle} aria-label="Account menu" className="rounded-full">
            <Avatar name={profile.full_name || profile.email} src={profile.avatar_url} size={28} />
          </button>
        )}
      >
        {(close) => (
          <>
            <p className="truncate px-2 py-1.5 text-black-700">{profile.email}</p>
            <Link href="/app/settings/profile" onClick={close} className="flex h-8 items-center gap-2 rounded-sm px-2 hover:bg-white-300">
              <Settings size={16} strokeWidth={1.5} /> Settings
            </Link>
            <MenuItem onClick={signOut}>
              <LogOut size={16} strokeWidth={1.5} /> Log out
            </MenuItem>
          </>
        )}
      </Popover>
      <CommandSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </header>
  );
}

function CommandSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { workspace } = useApp();
  const router = useRouter();
  const [q, setQ] = useState('');
  const term = useDebounced(q, 200);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setQ('');
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const { data, isFetching } = useQuery({
    queryKey: ['people', 'search', workspace.id, term],
    enabled: open && term.trim().length > 1,
    queryFn: async () => {
      const { data } = await supabase()
        .from('people')
        .select('id,full_name,job_title,company:tenant_companies(name)')
        .eq('workspace_id', workspace.id)
        .ilike('full_name', `%${term.trim()}%`)
        .limit(8);
      return (data ?? []) as unknown as (Pick<Person, 'id' | 'full_name' | 'job_title'> & { company: { name: string } | null })[];
    },
  });

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <Dialog open={open} onClose={onClose}>
      <div className="-m-2">
        <div className="flex items-center gap-2 border-b border-white-800 px-2 pb-3">
          <Search size={16} strokeWidth={1.5} className="text-black-700" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && data?.[0]) go(`/app/people/${data[0].id}`);
            }}
            placeholder="Search people, or jump to a page"
            className="h-8 flex-1 bg-transparent outline-none"
            aria-label="Search"
          />
        </div>
        <div className="max-h-80 overflow-y-auto pt-2">
          {term.trim().length > 1 ? (
            data?.length ? (
              data.map((p) => (
                <button key={p.id} onClick={() => go(`/app/people/${p.id}`)} className="flex h-10 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-white-300">
                  <Avatar name={p.full_name} size={24} />
                  <span className="truncate">{p.full_name}</span>
                  <span className="truncate text-black-700">{[p.job_title, p.company?.name].filter(Boolean).join(' · ')}</span>
                </button>
              ))
            ) : (
              <p className="px-2 py-3 text-black-700">{isFetching ? 'Searching…' : 'No people match. Try the Leads database.'}</p>
            )
          ) : (
            NAV.map(({ href, label, icon: Icon }) => (
              <button key={href} onClick={() => go(href)} className="flex h-9 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-white-300">
                <Icon size={16} strokeWidth={1.5} className="text-black-700" /> {label}
              </button>
            ))
          )}
        </div>
      </div>
    </Dialog>
  );
}

const SHORTCUTS: [string, string][] = [
  ['j / k', 'Move down / up a table'],
  ['Enter', 'Open the selected record'],
  ['c', 'Call the selected person'],
  ['n', 'Skip to the next person (Today)'],
  ['1 – 9', 'Pick a call outcome after hanging up'],
  ['Esc', 'Close or minimise drawers'],
  ['⌘K', 'Search'],
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

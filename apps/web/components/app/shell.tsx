'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { PREFETCH_ROUTES, prefetchRoute } from '@/lib/queries';
import { Check, ChevronsUpDown, Coins, LogOut, Mail, Phone, Plus, Settings, RotateCcw, Sparkles } from 'lucide-react';
import { FOUNDER } from '@/lib/site';
import { AddressBook, Globe, Lightning, ListBullets, PhoneCall, PlugsConnected, ShieldCheck, SunDim } from '@phosphor-icons/react';
import { GoogleIcon } from '@/components/ui/google-icon';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppProvider, useApp, type AppContextValue } from '@/lib/app-context';
import { invoke, supabase } from '@/lib/supabase/client';
import { destroyDevice } from '@/lib/twilio/device';
import type { Person } from '@/lib/types';
import { cn } from '@/lib/utils';
import { CreditsMeter } from '@/components/app/credits-meter';
import { SoftphoneToggle } from '@/components/app/quick-dial';
import { SoftphoneProvider } from '@/components/softphone/provider';
import { SupportWidget } from '@/components/app/support-widget';
import { Avatar, CompanyLogo } from '@/components/ui/display';
import { LogoMark } from '@/components/marketing/logo';
import { Dialog, MenuItem, Popover, useToast } from '@/components/ui/overlay';

// Sidebar icons are Phosphor: regular outline at rest, duotone (blue outline with a soft
// blue fill) when selected.
type NavIcon = React.ComponentType<{ size?: number; weight?: 'regular' | 'duotone'; className?: string; style?: React.CSSProperties }>;
type NavItem = { href: string; label: string; icon: NavIcon; exact?: boolean };
// Google's own mark keeps its brand colours at all times, unlike the pack icons
const GoogleNavIcon: NavIcon = ({ size, className }) => <GoogleIcon size={size} className={className} />;
const NAV_HUE = '#5f86e0';
// sidebar sections: the workspace, then outbound calling in its own group
const NAV_GROUPS: { label: string | null; items: NavItem[] }[] = [
  {
    label: null,
    items: [
      { href: '/app', label: 'Today', icon: SunDim, exact: true },
      { href: '/app/ai', label: 'Search with AI', icon: Globe },
      { href: '/app/leads', label: 'Leads', icon: AddressBook },
      { href: '/app/local', label: 'Local businesses', icon: GoogleNavIcon },
      // Companies is hidden for now: the page still exists at /app/companies. To bring the tab back,
      // restore { href: '/app/companies', label: 'Companies', icon: Buildings } here and in PREFETCH_ROUTES.
      { href: '/app/lists', label: 'Lists', icon: ListBullets },
      { href: '/app/integrations', label: 'Integrations', icon: PlugsConnected },
    ],
  },
  {
    label: 'Outbound',
    items: [
      { href: '/app/calls', label: 'Calls', icon: PhoneCall },
      { href: '/app/dialler', label: 'Power dialler', icon: Lightning },
      { href: '/app/tps', label: 'TPS/CTPS checks', icon: ShieldCheck },
    ],
  },
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
  useWelcomeEmail(user.id);
  useLastSeen();
  useAppTitle();
  return (
    <div className={`app-shell`}>
      <SoftphoneProvider workspaceId={workspace.id} userId={user.id} recordingPolicy={workspace.recording_policy}>
        <div className="flex h-dvh">
          <Sidebar />
          <main className="min-h-0 min-w-0 flex-1 overflow-y-auto bg-canvas [scrollbar-gutter:stable]">{hydrated ? children : null}</main>
        </div>
        <ShortcutsDialog />
        {hydrated ? <SupportWidget /> : null}
      </SoftphoneProvider>
      <div id="app-portal" />
    </div>
  );
}

/** Records that this person is using Decibel (for the come-back email). The server
 *  ignores touches less than 10 minutes apart, so this costs almost nothing. */
function useLastSeen() {
  useEffect(() => {
    if (window.location.pathname.startsWith('/dev-preview')) return;
    const touch = () => document.visibilityState === 'visible' && void supabase().rpc('touch_last_seen').then(() => {});
    touch();
    const t = window.setInterval(touch, 15 * 60_000);
    document.addEventListener('visibilitychange', touch);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', touch);
    };
  }, []);
}

/** The browser tab title for signed-in pages, e.g. "Leads | Decibel". */
function useAppTitle() {
  const pathname = usePathname().replace(/^\/dev-preview(?=\/|$)/, '/app');
  useEffect(() => {
    const items = NAV_GROUPS.flatMap((g) => g.items);
    const hit = items.find((i) => (i.exact ? pathname === i.href : pathname === i.href || pathname.startsWith(`${i.href}/`)));
    const extra: [string, string][] = [
      ['/app/settings', 'Settings'],
      ['/app/people', 'Contact'],
      ['/app/companies', 'Companies'],
      ['/app/dashboard', 'Dashboard'],
    ];
    const label = hit?.label ?? extra.find(([p]) => pathname.startsWith(p))?.[1];
    document.title = label ? `${label} | Decibel` : 'Decibel';
  }, [pathname]);
}

/** Asks for the welcome email once per browser; the server sends it only once per account. */
function useWelcomeEmail(userId: string) {
  useEffect(() => {
    if (window.location.pathname.startsWith('/dev-preview')) return;
    const flag = `decibel.welcome-email.${userId}`;
    try {
      if (localStorage.getItem(flag)) return;
    } catch {
      /* storage blocked: the server still de-duplicates */
    }
    invoke('send-email', { type: 'welcome' })
      .then(() => {
        try {
          localStorage.setItem(flag, '1');
        } catch {
          /* ignore */
        }
      })
      .catch(() => {});
  }, [userId]);
}

// Dev only: rerun onboarding without a new account. Never shown in production builds.
const DEV = process.env.NODE_ENV !== 'production';

function AccountMenu() {
  const router = useRouter();
  const { profile, workspace, isOwner } = useApp();
  const toast = useToast();
  /** Puts this workspace back into onboarding at step 2 (step 1 always creates a workspace). */
  const restartOnboarding = async () => {
    const { error } = await supabase()
      .from('workspaces')
      .update({ onboarding_completed_at: null, onboarding_state: { step: 2, completed: [1], started_at: new Date().toISOString() } })
      .eq('id', workspace.id);
    if (error) return toast(`Could not restart onboarding: ${error.message}`);
    router.push('/onboarding/business');
    router.refresh();
  };
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
            <div className="mt-1 border-t border-white-800 pt-1">
              <p className="px-2 py-1.5 text-white-900">Talk to the founder</p>
              <a href={`tel:${FOUNDER.phone}`} onClick={close} className="flex h-8 items-center gap-2 rounded-sm px-2 text-base tabular-nums hover:bg-white-300">
                <Phone size={16} strokeWidth={1.5} /> {FOUNDER.phoneDisplay}
              </a>
              <a href={`mailto:${FOUNDER.email}`} onClick={close} className="flex h-8 items-center gap-2 rounded-sm px-2 text-base hover:bg-white-300">
                <Mail size={16} strokeWidth={1.5} /> {FOUNDER.email}
              </a>
            </div>
            <div className="mt-1 border-t border-white-800 pt-1">
              <MenuItem onClick={signOut}>
                <LogOut size={16} strokeWidth={1.5} /> Log out
              </MenuItem>
            </div>
            {DEV ? (
              <div className="mt-1 border-t border-white-800 pt-1">
                <p className="px-2 py-1.5 text-white-900">Developer · local only</p>
                <MenuItem
                  disabled={!isOwner}
                  onClick={() => {
                    close();
                    void restartOnboarding();
                  }}
                >
                  <RotateCcw size={16} strokeWidth={1.5} /> Restart onboarding here
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    close();
                    router.push('/onboarding/workspace?new=1');
                  }}
                >
                  <Sparkles size={16} strokeWidth={1.5} /> Onboard a new workspace
                </MenuItem>
              </div>
            ) : null}
          </>
        )}
      </Popover>
    </div>
  );
}

function Sidebar() {
  // the dev-only design preview mirrors /app routes under /dev-preview; treat them alike
  const pathname = usePathname().replace(/^\/dev-preview(?=\/|$)/, '/app');
  const { workspace, workspaces, profile, switchWorkspace, user } = useApp();
  const qc = useQueryClient();
  const prefetch = (href: string) => prefetchRoute(qc, href, workspace.id, user.id);
  // Warm every tab's data as soon as the browser is idle after the first page has loaded, so the
  // first click on any tab shows real content at once. Hovering a link re-warms it if stale.
  useEffect(() => {
    let idle: number | null = null;
    const run = () => PREFETCH_ROUTES.forEach((href) => prefetch(href));
    const t = window.setTimeout(() => {
      if (typeof window.requestIdleCallback === 'function') idle = window.requestIdleCallback(run, { timeout: 1500 });
      else run();
    }, 400);
    return () => {
      clearTimeout(t);
      if (idle !== null && typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(idle);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace.id]);
  return (
    <nav
      aria-label="Main"
      className="flex w-[var(--sidebar-width)] shrink-0 flex-col border-r border-white-800 bg-canvas transition-[width]"
    >
      <Link href="/app" aria-label="Decibel home" className="flex h-12 shrink-0 items-center gap-1.5 border-b border-white-800 px-4 max-[1100px]:justify-center max-[1100px]:px-0">
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

      <div className="flex flex-1 flex-col gap-4 px-2">
        {NAV_GROUPS.map((group) => (
          <div key={group.label ?? 'main'}>
            {group.label ? (
              <>
                <p className="flex h-7 items-center px-2 text-white-900 max-[1100px]:hidden">{group.label}</p>
                {/* collapsed sidebar: a hairline stands in for the section name */}
                <span aria-hidden className="mx-2 mb-2 hidden h-px bg-white-800 max-[1100px]:block" />
              </>
            ) : null}
            <ul className="flex flex-col gap-0.5">
              {group.items.map(({ href, label, icon: Icon, exact }) => {
                const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      prefetch
                      title={label}
                      onMouseEnter={() => prefetch(href)}
                      onFocus={() => prefetch(href)}
                      aria-current={active ? 'page' : undefined}
                      className={cn('nav-item flex h-8 items-center gap-2 px-2 text-sm transition-colors', active ? 'text-black-400' : 'text-black-700 hover:bg-white-300 hover:text-black-400')}
                    >
                      {/* selected: duotone pastel blue */}
                      <Icon
                        size={17}
                        weight={active ? 'duotone' : 'regular'}
                        className="shrink-0 transition-colors duration-150"
                        style={{ color: active ? NAV_HUE : undefined }}
                      />
                      <span className="truncate max-[1100px]:hidden">{label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>

      {/* the phone: opens the dial pad, and shows the live call status during a call */}
      <div className="px-2 pb-1.5">
        <SoftphoneToggle />
      </div>
      <CreditsMeter />
      <div className="flex items-center gap-1 border-t border-white-800 p-2 max-[1100px]:flex-col">
        <AccountMenu />
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

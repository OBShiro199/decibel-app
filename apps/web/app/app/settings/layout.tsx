'use client';
import {
  ArrowDownUp, Bell, Building2, ChevronLeft, Code2, CreditCard, Headphones, Layers, Lock, Mic, MonitorSmartphone, Palette, Phone, Search, ShieldCheck, User, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Select } from '@/components/ui/form';
import { cn } from '@/lib/utils';

interface NavItem {
  route: string;
  label: string;
  icon: LucideIcon;
}
const GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Personal',
    items: [
      { route: 'profile', label: 'Profile', icon: User },
      { route: 'appearance', label: 'Appearance', icon: Palette },
      { route: 'notifications', label: 'Notifications', icon: Bell },
      { route: 'audio', label: 'Audio devices', icon: Headphones },
      { route: 'sessions', label: 'Sessions', icon: MonitorSmartphone },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { route: 'general', label: 'General', icon: Building2 },
      { route: 'members', label: 'Members', icon: Users },
      { route: 'phone-numbers', label: 'Phone numbers', icon: Phone },
      { route: 'calling', label: 'Calling & recording', icon: Mic },
      { route: 'compliance', label: 'Compliance', icon: ShieldCheck },
      { route: 'plans', label: 'Plans', icon: Layers },
      { route: 'billing', label: 'Billing', icon: CreditCard },
      { route: 'security', label: 'Security', icon: Lock },
    ],
  },
  {
    label: 'Data',
    items: [
      { route: 'data', label: 'Imports & exports', icon: ArrowDownUp },
      { route: 'developers', label: 'Developers', icon: Code2 },
    ],
  },
];
const ALL = GROUPS.flatMap((g) => g.items);
const href = (route: string) => `/app/settings/${route}`;

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState('');
  const current = ALL.find((i) => pathname === href(i.route) || pathname.startsWith(href(i.route) + '/'));
  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return GROUPS;
    return GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => i.label.toLowerCase().includes(needle)) })).filter((g) => g.items.length);
  }, [q]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden md:flex-row">
      {/* Rail (md and up) */}
      <aside className="hidden h-full w-[248px] shrink-0 flex-col overflow-y-auto border-r border-white-800 bg-white-100 md:flex">
        <div className="px-3 pt-3">
          <p className="flex h-8 items-center px-1.5 text-md font-medium">Settings</p>
          <div className="relative mt-3">
            <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-2 text-black-700" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search settings"
              aria-label="Search settings"
              className="control h-8 pl-8"
            />
          </div>
        </div>
        <nav className="flex-1 px-3 pb-6 pt-2" aria-label="Settings">
          {groups.length === 0 ? <p className="t-small px-2 py-3 text-black-700">No settings match that search.</p> : null}
          {groups.map((g) => (
            <div key={g.label} className="mt-4">
              <p className="t-small px-2 pb-1 text-black-700">{g.label}</p>
              <ul>
                {g.items.map(({ route, label, icon: Icon }) => {
                  const active = current?.route === route;
                  return (
                    <li key={route}>
                      <Link
                        href={href(route)}
                        aria-current={active ? 'page' : undefined}
                        className={cn('flex h-8 items-center gap-2 rounded-sm px-2 transition-colors hover:bg-white-300', active && 'bg-white-300')}
                      >
                        <Icon size={16} strokeWidth={1.5} className="shrink-0 text-black-700" />
                        <span className="truncate">{label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      {/* Mobile: back link + page select */}
      <div className="flex shrink-0 items-center gap-2 border-b border-white-800 bg-white-100 px-4 py-2 md:hidden">
        <Link href="/app" aria-label="Back to app" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm hover:bg-white-300">
          <ChevronLeft size={16} strokeWidth={1.5} />
        </Link>
        <Select className="min-w-0 flex-1" aria-label="Settings page" value={current?.route ?? ''} onChange={(e) => router.push(href(e.target.value))}>
          {GROUPS.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((i) => (
                <option key={i.route} value={i.route}>
                  {i.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <main className="min-h-0 flex-1 overflow-y-auto bg-white-200 [scrollbar-gutter:stable]">
          <div className="mx-auto w-full max-w-[936px] px-4 pb-16 pt-8 md:px-6 md:pt-12">{children}</div>
        </main>
      </div>
    </div>
  );
}

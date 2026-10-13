'use client';
// Settings pages render full width; they're listed in the main sidebar under Settings
// (lib/settings-nav.ts). On small screens a page picker sits above the content.
import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Select } from '@/components/ui/form';
import { HOME } from '@/lib/constants';
import { SETTINGS_PAGES, settingsHref } from '@/lib/settings-nav';

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = SETTINGS_PAGES.find((p) => pathname === settingsHref(p.route) || pathname.startsWith(settingsHref(p.route) + '/'));

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center gap-2 border-b border-white-800 bg-white-100 px-4 py-2 md:hidden">
        <Link href={HOME} aria-label="Back to app" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-sm hover:bg-white-300">
          <ChevronLeft size={16} strokeWidth={1.5} />
        </Link>
        <Select className="min-w-0 flex-1" aria-label="Settings page" value={current?.route ?? ''} onChange={(e) => router.push(settingsHref(e.target.value))}>
          {(['Workspace', 'Data'] as const).map((g) => (
            <optgroup key={g} label={g}>
              {SETTINGS_PAGES.filter((p) => p.group === g).map((p) => (
                <option key={p.route} value={p.route}>
                  {p.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>
      <main className="min-h-0 flex-1 overflow-y-auto bg-white-200 [scrollbar-gutter:stable]">
        <div className="mx-auto w-full max-w-[936px] px-4 pb-16 pt-8 md:px-6 md:pt-12">{children}</div>
      </main>
    </div>
  );
}

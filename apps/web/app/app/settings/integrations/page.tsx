'use client';
// Integrations: the CRM tools Decibel will connect to, with their logos, and the other ways to
// get data out. Nothing here connects yet: the cards are placeholders by design. Moved here from
// the sidebar (/app/integrations redirects).
import { Code2, FileDown, Plus, Search, Webhook, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CRM_TOOLS } from '@/lib/integrations-data';
import { openSupport } from '@/components/app/support-widget';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { Section, SettingsPage } from '../_components';

export default function IntegrationsSettings() {
  const [text, setText] = useState('');
  const tools = useMemo(() => {
    const q = text.trim().toLowerCase();
    return CRM_TOOLS.filter((t) => !q || `${t.name} ${t.tagline}`.toLowerCase().includes(q));
  }, [text]);

  return (
    <SettingsPage
      title="Integrations"
      description="Connect Decibel to your CRM so calls, outcomes and contacts sync both ways. These are coming soon."
      actions={
        <div className="relative">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-2 text-white-900" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search integrations" className="h-8 w-60 pl-8" aria-label="Search integrations" />
        </div>
      }
    >
      <Section title="CRM" description={`${tools.length} ${tools.length === 1 ? 'tool' : 'tools'}`}>
        {tools.length ? (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {tools.map((t) => (
              // placeholders: nothing happens on click, for now
              <div key={t.id} className="card flex h-[112px] flex-col justify-between p-4">
                <span className="flex items-start justify-between gap-2">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-sm border border-white-800 bg-white-100">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/integrations/${t.id}.webp`} alt="" width={28} height={28} loading="lazy" decoding="async" className="h-7 w-7 object-contain" draggable={false} />
                  </span>
                  <Tag color={7}>Coming soon</Tag>
                </span>
                <span className="block min-w-0">
                  <span className="block truncate font-medium text-black-400">{t.name}</span>
                  <span className="block truncate text-black-700">{t.tagline}</span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-black-700">No CRM matches that search.</p>
        )}
      </Section>

      <Section title="Don't see your tool?" description="Tell us which CRM you use and we will build it next. Until then, you can move data in and out another way.">
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => openSupport()}>
            <Plus size={16} strokeWidth={1.5} /> Request an integration
          </Button>
          <Button>
            <Zap size={16} strokeWidth={1.5} /> Zapier
          </Button>
          <Button>
            <Webhook size={16} strokeWidth={1.5} /> Webhooks
          </Button>
          <Button>
            <Code2 size={16} strokeWidth={1.5} /> API
          </Button>
          <Button>
            <FileDown size={16} strokeWidth={1.5} /> CSV export
          </Button>
        </div>
      </Section>
    </SettingsPage>
  );
}

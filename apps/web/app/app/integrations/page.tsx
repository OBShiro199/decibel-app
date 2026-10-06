'use client';
// Integrations: the CRM tools Decibel will connect to, with their logos, and the other ways to
// get data out. Nothing here connects yet: the cards and buttons are placeholders by design.
import { Code2, FileDown, Plus, Search, Webhook, Zap } from 'lucide-react';
import { useMemo, useState } from 'react';
import { CRM_TOOLS } from '@/lib/integrations-data';
import { Button } from '@/components/ui/button';
import { Tag } from '@/components/ui/display';
import { Input } from '@/components/ui/form';
import { RevealOnce } from '@/components/ui/reveal';

export default function IntegrationsPage() {
  const [text, setText] = useState('');
  const tools = useMemo(() => {
    const q = text.trim().toLowerCase();
    return CRM_TOOLS.filter((t) => !q || `${t.name} ${t.tagline}`.toLowerCase().includes(q));
  }, [text]);

  return (
    <div className="flex h-full flex-col bg-white-100">
      <div className="flex h-12 shrink-0 items-center gap-2 overflow-x-auto border-b border-white-800 px-4 [scrollbar-width:none]">
        <div className="relative shrink-0">
          <Search size={16} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-2 text-white-900" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search integrations" className="h-8 w-72 pl-8 max-sm:w-44" aria-label="Search integrations" />
        </div>
        <h1 className="shrink-0 text-black-700">
          <span className="text-black-400">{tools.length}</span> {tools.length === 1 ? 'CRM' : 'CRMs'}
        </h1>
        <Tag color={7} className="shrink-0">
          Coming soon
        </Tag>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-8 p-4 md:p-6">
          <section aria-label="CRM tools">
            <p className="t-label mb-3">CRM</p>
            {tools.length ? (
              <RevealOnce id="integrations:grid">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {tools.map((t) => (
                    // placeholders: nothing happens on click, for now
                    <button key={t.id} type="button" className="card flex h-[112px] cursor-default flex-col justify-between p-4 text-left transition-colors hover:border-btnborder">
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
                    </button>
                  ))}
                </div>
              </RevealOnce>
            ) : (
              <p className="text-black-700">No CRM matches that search.</p>
            )}
          </section>

          <section aria-label="Other ways to connect" className="card p-5">
            <h2 className="t-h4">Don&apos;t see your tool?</h2>
            <p className="mt-1 max-w-[620px] text-black-700">Tell us which CRM you use and we will build it next. Until then, you can move data in and out another way.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary">
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
          </section>
        </div>
      </div>
    </div>
  );
}

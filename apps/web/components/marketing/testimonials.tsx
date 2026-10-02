'use client';
// Testimonials: portraits on the left (the active one large, the others small and
// faded between hairlines), the quote on the right. Click a portrait to switch;
// rotates on its own every 8 seconds until someone interacts.
import { BarChart3, Database, ListChecks, Mic, PhoneCall, ShieldCheck, Smartphone, Workflow } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { TESTIMONIALS } from './social-proof';

const ICONS: Record<string, LucideIcon> = {
  'Power dialler': PhoneCall,
  'Verified mobiles': Smartphone,
  'Call recording': Mic,
  'Lead database': Database,
  Pipeline: Workflow,
  Lists: ListChecks,
  'TPS screening': ShieldCheck,
  Analytics: BarChart3,
};

export function Testimonials() {
  const [active, setActive] = useState(0);
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (held || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => setActive((a) => (a + 1) % TESTIMONIALS.length), 8000);
    return () => clearInterval(t);
  }, [held]);
  const t = TESTIMONIALS[active];
  const others = TESTIMONIALS.map((x, i) => ({ x, i })).filter(({ i }) => i !== active);

  return (
    <div className="grid items-center gap-10 md:grid-cols-[1fr_1.15fr] md:gap-14">
      {/* portraits */}
      <div className="flex items-center justify-center">
        {others.map(({ x, i }) => (
          <button
            key={x.name}
            onClick={() => {
              setActive(i);
              setHeld(true);
            }}
            aria-label={`Show ${x.name}'s story`}
            className="group flex h-[220px] w-[110px] shrink-0 items-center justify-center border-r border-white-800 sm:w-[140px]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={x.photo} alt="" width={96} height={96} className="h-20 w-20 object-contain opacity-50 grayscale transition-opacity duration-300 group-hover:opacity-80 sm:h-24 sm:w-24" />
          </button>
        ))}
        <div className="flex h-[220px] w-[200px] shrink-0 items-center justify-center sm:w-[240px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={t.photo} src={t.photo} alt={t.name} width={200} height={200} className="t-fade h-[170px] w-[170px] object-contain sm:h-[200px] sm:w-[200px]" />
        </div>
      </div>

      {/* every quote is rendered in the same grid cell; only the active one is visible.
          The block is always as tall as the longest quote, so switching never jitters. */}
      <div>
        <div className="grid">
          {TESTIMONIALS.map((q, i) => (
            <figure
              key={q.name}
              aria-hidden={i !== active}
              className={cn('[grid-area:1/1] transition-opacity duration-500', i === active ? 'opacity-100' : 'pointer-events-none opacity-0')}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={q.logo} alt={q.brand} width={120} height={28} className="h-7 max-w-[140px] w-auto object-contain object-left" />
              <blockquote className="mt-3 text-xl leading-[1.45] tracking-[-0.02em] text-black-400 md:text-[26px] md:leading-[1.4]">“{q.quote}”</blockquote>
              <figcaption className="mt-5 text-md">
                <span className="font-medium text-black-400">{q.name},</span> <span className="text-black-700">{q.role}</span>
              </figcaption>
              <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-dashed border-white-800 pt-5 text-base">
                <span className="text-[#c2662d]">{q.brand}’s favourite features</span>
                {q.features.map((f) => {
                  const Icon = ICONS[f] ?? PhoneCall;
                  return (
                    <span key={f} className="flex items-center gap-1.5 border-l border-white-800 pl-3 text-black-700">
                      <Icon size={15} strokeWidth={1.5} className="text-white-900" /> {f}
                    </span>
                  );
                })}
              </div>
            </figure>
          ))}
        </div>
        <div className="mt-6 flex gap-1.5" role="tablist" aria-label="Customer stories">
          {TESTIMONIALS.map((x, i) => (
            <button
              key={x.name}
              role="tab"
              aria-selected={i === active}
              aria-label={x.brand}
              onClick={() => {
                setActive(i);
                setHeld(true);
              }}
              className={cn('h-1 rounded-full transition-all duration-300', i === active ? 'w-6 bg-black-400' : 'w-3 bg-white-800 hover:bg-white-900')}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

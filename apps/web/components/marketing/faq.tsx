'use client';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { trackMarketing } from './analytics';

export interface FaqItem {
  question: string;
  answer: string;
}

export function Faq({ items }: { items: FaqItem[] }) {
  const [open, setOpen] = useState<Record<number, boolean>>({});
  return (
    <div className="border-t border-white-800">
      {items.map((item, i) => {
        const on = !!open[i];
        return (
          <div key={item.question} className="border-b border-white-800">
            <h3>
              <button
                type="button"
                id={`faq-q-${i}`}
                aria-expanded={on}
                aria-controls={`faq-a-${i}`}
                onClick={() => {
                  setOpen((o) => ({ ...o, [i]: !on }));
                  if (!on) trackMarketing('faq_open', { question: item.question });
                }}
                className="flex w-full items-center justify-between gap-4 py-5 text-left text-[16.5px] font-medium tracking-[-0.02em] text-black-400"
              >
                {item.question}
                <span aria-hidden className="shrink-0 tabular-nums text-[16px] text-white-900">{on ? '–' : '+'}</span>
              </button>
            </h3>
            <div
              id={`faq-a-${i}`}
              role="region"
              aria-labelledby={`faq-q-${i}`}
              aria-hidden={!on}
              className={cn('overflow-hidden pr-8 transition-[max-height,opacity] duration-500', on ? 'max-h-[320px] opacity-100' : 'max-h-0 opacity-0')}
              style={{ transitionTimingFunction: 'var(--ease-settle)' }}
            >
              <p className="pb-6 text-[15.5px] leading-[25px] text-black-700">{item.answer}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

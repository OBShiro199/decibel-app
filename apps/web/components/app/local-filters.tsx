'use client';
// Local filters: the same stackable chip row as Leads. "Add filter" lists the filter types, each
// active filter is a chip that opens its editor and has its own remove button. Fixed height and
// sideways scroll, so adding filters never pushes the table down.
import { Check, ChevronDown, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { LOCAL_CATEGORIES, LOCAL_TOWNS, RATING_STEPS, REVIEW_STEPS, type LocalFilters } from '@/lib/local';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/form';
import { MenuItem, Popover } from '@/components/ui/overlay';

type Key = 'categories' | 'towns' | 'minRating' | 'minReviews' | 'website' | 'openNow';
const LABEL: Record<Key, string> = { categories: 'Category', towns: 'Town', minRating: 'Rating', minReviews: 'Reviews', website: 'Website', openNow: 'Open now' };
const ORDER: Key[] = ['categories', 'towns', 'minRating', 'minReviews', 'website', 'openNow'];

const isActive = (f: LocalFilters, k: Key) => (k === 'categories' || k === 'towns' ? !!f[k]?.length : f[k] != null && f[k] !== false);

function summary(f: LocalFilters, k: Key): string {
  if (k === 'openNow') return 'Open now';
  if (k === 'minRating') return `Rating: ${f.minRating}+ stars`;
  if (k === 'minReviews') return `Reviews: ${f.minReviews}+`;
  if (k === 'website') return `Website: ${f.website === 'has' ? 'has one' : 'none'}`;
  const v = f[k] ?? [];
  return v.length === 1 ? `${LABEL[k]}: ${v[0]}` : `${LABEL[k]}: ${v.length} selected`;
}

function Choice<T extends string | number>({ options, value, onPick }: { options: { value: T; label: string }[]; value: T | undefined; onPick: (v: T) => void }) {
  return (
    <div className="w-52 p-1">
      {options.map((o) => (
        <button key={String(o.value)} type="button" onClick={() => onPick(o.value)} className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left hover:bg-white-300">
          <span className="flex h-4 w-4 shrink-0 items-center justify-center">{value === o.value ? <Check size={14} strokeWidth={1.75} className="text-black-400" /> : null}</span>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Editor({ k, filters, onChange }: { k: Key; filters: LocalFilters; onChange: (p: Partial<LocalFilters>) => void }) {
  if (k === 'categories' || k === 'towns') {
    const options = k === 'categories' ? LOCAL_CATEGORIES : LOCAL_TOWNS;
    const value = filters[k] ?? [];
    return (
      <div className="max-h-[320px] w-64 overflow-y-auto p-2">
        <div className="flex flex-col gap-2">
          {options.map((o) => (
            <Checkbox key={o} checked={value.includes(o)} onChange={(on) => onChange({ [k]: on ? [...value, o] : value.filter((v) => v !== o) })} label={o} />
          ))}
        </div>
      </div>
    );
  }
  if (k === 'minRating') return <Choice value={filters.minRating} onPick={(v) => onChange({ minRating: v })} options={RATING_STEPS.map((n) => ({ value: n, label: `${n}+ stars` }))} />;
  if (k === 'minReviews') return <Choice value={filters.minReviews} onPick={(v) => onChange({ minReviews: v })} options={REVIEW_STEPS.map((n) => ({ value: n, label: `${n}+ reviews` }))} />;
  return (
    <Choice
      value={filters.website}
      onPick={(v) => onChange({ website: v })}
      options={[
        { value: 'has', label: 'Has a website' },
        { value: 'none', label: 'No website' },
      ]}
    />
  );
}

export function LocalFilterBar({ filters, onChange, onClear }: { filters: LocalFilters; onChange: (patch: Partial<LocalFilters>) => void; onClear: () => void }) {
  const active = ORDER.filter((k) => isActive(filters, k));
  const available = ORDER.filter((k) => !isActive(filters, k));
  const [picked, setPicked] = useState<Key | null>(null);
  const remove = (k: Key) => onChange({ [k]: k === 'categories' || k === 'towns' ? [] : undefined } as Partial<LocalFilters>);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-white-800 px-4 [scrollbar-width:none]" role="toolbar" aria-label="Filters">
      {active.map((k) =>
        k === 'openNow' ? (
          <span key={k} className="tag tag-7 shrink-0 gap-1.5 pr-1">
            {summary(filters, k)}
            <button onClick={() => remove(k)} aria-label="Remove Open now filter" className="flex h-4 w-4 items-center justify-center rounded-[3px] hover:bg-white-400">
              <X size={12} strokeWidth={1.5} />
            </button>
          </span>
        ) : (
          <span key={k} className="tag tag-1 shrink-0 gap-0 p-0">
            <Popover
              trigger={({ toggle }) => (
                <button onClick={toggle} className="flex h-[20px] max-w-[240px] items-center gap-1 truncate pl-1.5 pr-1">
                  <span className="truncate">{summary(filters, k)}</span>
                  <ChevronDown size={12} strokeWidth={1.5} className="shrink-0" />
                </button>
              )}
            >
              {() => <Editor k={k} filters={filters} onChange={onChange} />}
            </Popover>
            <button onClick={() => remove(k)} aria-label={`Remove ${LABEL[k]} filter`} className="mr-0.5 flex h-4 w-4 items-center justify-center rounded-[3px] hover:bg-accent-100">
              <X size={12} strokeWidth={1.5} />
            </button>
          </span>
        ),
      )}

      {available.length ? (
        <Popover
          trigger={({ toggle }) => (
            <button
              onClick={() => {
                setPicked(null);
                toggle();
              }}
              className="flex h-[22px] shrink-0 items-center gap-1 rounded-[4px] border border-dashed border-btnborder px-1.5 text-xs text-black-700 hover:border-white-900 hover:text-black-400"
            >
              <Plus size={12} strokeWidth={1.5} /> Add filter
            </button>
          )}
        >
          {(close) =>
            picked ? (
              <div>
                <p className="t-label px-2 pt-2">{LABEL[picked]}</p>
                <Editor k={picked} filters={filters} onChange={onChange} />
              </div>
            ) : (
              <div className="w-56">
                {available.map((k) => (
                  <MenuItem
                    key={k}
                    onClick={() => {
                      if (k === 'openNow') {
                        onChange({ openNow: true });
                        close();
                      } else setPicked(k);
                    }}
                  >
                    {LABEL[k]}
                  </MenuItem>
                ))}
              </div>
            )
          }
        </Popover>
      ) : null}

      <button onClick={onClear} className={cn('ml-auto shrink-0 text-xs text-black-700 hover:text-black-400', !active.length && 'invisible')}>
        Clear all
      </button>
    </div>
  );
}

'use client';
// Leads filters as a single row of stackable chips across the top of the table.
// "Add filter" lists the filter types; each active filter is a chip that opens its
// editor in a popover and has its own remove button. The row has a fixed height
// and scrolls sideways, so adding filters never pushes the table down.
import { ChevronDown, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { COUNTRIES, countryName, SENIORITIES, seniorityLabel, SIZE_BANDS } from '@/lib/constants';
import { DEPARTMENTS, type LeadFilters } from '@/lib/leads';
import type { Seniority } from '@/lib/types';
import { cn } from '@/lib/utils';
import { Checkbox, ChipsInput, Input } from '@/components/ui/form';
import { MenuItem, Popover } from '@/components/ui/overlay';

type ListKey = 'countries' | 'industries' | 'sizes' | 'titles' | 'seniorities' | 'departments';
type Key = ListKey | 'city' | 'hasMobile' | 'hasEmail' | 'tpsClear';

const LABEL: Record<Key, string> = {
  countries: 'Country',
  industries: 'Industry',
  sizes: 'Company size',
  titles: 'Job title',
  seniorities: 'Seniority',
  departments: 'Department',
  city: 'City or region',
  hasMobile: 'Has mobile',
  hasEmail: 'Has email',
  tpsClear: 'TPS clear only',
};
const ORDER: Key[] = ['countries', 'industries', 'sizes', 'titles', 'seniorities', 'departments', 'city', 'hasMobile', 'hasEmail', 'tpsClear'];
const BOOLEAN: Key[] = ['hasMobile', 'hasEmail', 'tpsClear'];

function isActive(f: LeadFilters, k: Key): boolean {
  const v = f[k as keyof LeadFilters];
  return Array.isArray(v) ? v.length > 0 : !!v;
}

function display(k: Key, value: string): string {
  if (k === 'countries') return countryName(value);
  if (k === 'seniorities') return seniorityLabel(value as Seniority);
  if (k === 'sizes') return `${value} employees`;
  return value;
}

function summary(f: LeadFilters, k: Key): string {
  if (BOOLEAN.includes(k)) return LABEL[k];
  if (k === 'city') return `${LABEL[k]}: ${f.city}`;
  const values = (f[k as ListKey] ?? []) as string[];
  return values.length === 1 ? `${LABEL[k]}: ${display(k, values[0])}` : `${LABEL[k]}: ${values.length} selected`;
}

function Editor({ k, filters, onChange, countries, industries }: { k: Key; filters: LeadFilters; onChange: (p: Partial<LeadFilters>) => void; countries: string[]; industries: string[] }) {
  if (k === 'titles') {
    return (
      <div className="w-72 p-2">
        <ChipsInput value={filters.titles ?? []} onChange={(v) => onChange({ titles: v })} placeholder="CEO, Head of Sales…" />
      </div>
    );
  }
  if (k === 'city') {
    return (
      <div className="w-64 p-2">
        <Input autoFocus value={filters.city ?? ''} onChange={(e) => onChange({ city: e.target.value })} placeholder="Manchester" aria-label="City or region" />
      </div>
    );
  }
  const options: { value: string; label: string }[] =
    k === 'countries'
      ? COUNTRIES.filter((c) => countries.includes(c.code)).map((c) => ({ value: c.code, label: c.name }))
      : k === 'industries'
        ? industries.map((i) => ({ value: i, label: i }))
        : k === 'sizes'
          ? SIZE_BANDS.map((s) => ({ value: s, label: `${s} employees` }))
          : k === 'seniorities'
            ? SENIORITIES
            : DEPARTMENTS.map((d) => ({ value: d, label: d }));
  const value = (filters[k as ListKey] ?? []) as string[];
  return (
    <div className="max-h-[320px] w-64 overflow-y-auto p-2">
      {options.length ? (
        <div className="flex flex-col gap-2">
          {options.map((o) => (
            <Checkbox
              key={o.value}
              checked={value.includes(o.value)}
              onChange={(on) => onChange({ [k]: on ? [...value, o.value] : value.filter((v) => v !== o.value) } as Partial<LeadFilters>)}
              label={o.label}
            />
          ))}
        </div>
      ) : (
        <p className="text-sm text-black-700">Loading options…</p>
      )}
    </div>
  );
}

export function LeadFilterBar({
  filters,
  onChange,
  onClear,
  countries,
  industries,
}: {
  filters: LeadFilters;
  onChange: (patch: Partial<LeadFilters>) => void;
  onClear: () => void;
  countries: string[];
  industries: string[];
}) {
  const active = ORDER.filter((k) => isActive(filters, k));
  const available = ORDER.filter((k) => !isActive(filters, k));
  const remove = (k: Key) => onChange({ [k]: BOOLEAN.includes(k) ? false : k === 'city' ? '' : [] } as Partial<LeadFilters>);
  const [picked, setPicked] = useState<Key | null>(null);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-white-800 px-4 [scrollbar-width:none]" role="toolbar" aria-label="Filters">
      {active.map((k) =>
        BOOLEAN.includes(k) ? (
          <span key={k} className="tag tag-7 shrink-0 gap-1.5 pr-1">
            {summary(filters, k)}
            <button onClick={() => remove(k)} aria-label={`Remove ${LABEL[k]} filter`} className="flex h-4 w-4 items-center justify-center rounded-[3px] hover:bg-white-400">
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
              {() => <Editor k={k} filters={filters} onChange={onChange} countries={countries} industries={industries} />}
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
                <Editor k={picked} filters={filters} onChange={onChange} countries={countries} industries={industries} />
              </div>
            ) : (
              <div className="w-56">
                {available.map((k) => (
                  <MenuItem
                    key={k}
                    onClick={() => {
                      if (BOOLEAN.includes(k)) {
                        onChange({ [k]: true } as Partial<LeadFilters>);
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


'use client';
// The most-used Leads filters, one click away next to "Add filter": country (with flags), company
// size, revenue, and mobile / email (any, with or without). They set the same filter keys as "Add filter"; while one
// is set its control shows the value, so it has no separate chip (QUICK_KEYS).
import { Check, ChevronDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { LEAD_FILTERS, type Facets, type Filters } from '@/lib/lead-search';
import { cn } from '@/lib/utils';
import { prettyValue } from '@/components/app/smart-filters';
import { Popover } from '@/components/ui/overlay';

// ---- flags: country name -> ISO code via the browser's own region names -----------------------------
const ALIASES: Record<string, string> = {
  'united kingdom': 'GB', uk: 'GB', 'great britain': 'GB', england: 'GB', scotland: 'GB', wales: 'GB', 'northern ireland': 'GB',
  germany: 'DE', 'united states': 'US', usa: 'US', 'czech republic': 'CZ', turkey: 'TR', russia: 'RU', 'south korea': 'KR', korea: 'KR',
  vietnam: 'VN', 'the netherlands': 'NL', holland: 'NL', 'hong kong sar': 'HK', macedonia: 'MK', 'ivory coast': 'CI', 'cote d’ivoire': 'CI',
};
// retired or special codes the browser still names (e.g. DD, East Germany, would steal "Germany")
const RETIRED = new Set(['DD', 'YU', 'CS', 'SU', 'ZR', 'BU', 'TP', 'NT', 'AN', 'QO', 'EU', 'EZ', 'UN', 'XA', 'XB', 'ZZ', 'QU']);
let CODES: Record<string, string> | null = null;
function codeFor(name: string): string | null {
  if (!CODES) {
    CODES = { ...ALIASES };
    try {
      const names = new Intl.DisplayNames(['en'], { type: 'region' });
      for (let a = 65; a <= 90; a++)
        for (let b = 65; b <= 90; b++) {
          const code = String.fromCharCode(a, b);
          if (RETIRED.has(code)) continue;
          const n = names.of(code);
          if (n && n !== code && !CODES[n.toLowerCase()]) CODES[n.toLowerCase()] = code;
        }
    } catch {
      /* older browsers: aliases only */
    }
  }
  const key = name.trim().toLowerCase();
  return CODES[key] ?? (/^[A-Z]{2}$/.test(name) ? name : null);
}
export function flag(name: string): string {
  const code = codeFor(name);
  return code ? String.fromCodePoint(...[...code].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)) : '🌐';
}

// ---- a multi-select dropdown ------------------------------------------------------------------------------
function MultiPicker({
  label,
  values,
  options,
  onChange,
  searchable,
  width = 'w-60',
}: {
  label: string;
  values: string[];
  options: { value: string; label: string; icon?: string; n?: number }[];
  onChange: (v: string[]) => void;
  searchable?: boolean;
  width?: string;
}) {
  const [q, setQ] = useState('');
  const shown = useMemo(() => (q.trim() ? options.filter((o) => o.label.toLowerCase().includes(q.trim().toLowerCase())) : options), [options, q]);
  const picked = options.filter((o) => values.includes(o.value));
  const toggle = (v: string) => onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  return (
    <Popover
      className={cn(width, 'p-1')}
      trigger={({ toggle: open, open: isOpen }) => (
        <button
          onClick={open}
          aria-expanded={isOpen}
          className={cn(
            'flex h-[22px] shrink-0 items-center gap-1 rounded-[4px] border px-1.5 text-xs transition-colors',
            picked.length ? 'border-[#c4d1f2] bg-[#f2f5fe] text-[#3653a3]' : 'border-white-800 text-black-700 hover:border-white-900 hover:text-black-400',
          )}
        >
          {picked.length ? (
            <>
              {picked[0].icon ? <span aria-hidden>{picked[0].icon}</span> : null}
              <span className="max-w-[130px] truncate">{picked[0].label}</span>
              {picked.length > 1 ? <span className="tabular-nums opacity-70">+{picked.length - 1}</span> : null}
            </>
          ) : (
            label
          )}
          <ChevronDown size={12} strokeWidth={1.5} className="shrink-0 opacity-60" />
        </button>
      )}
    >
      {() => (
        <div>
          {searchable ? (
            <div className="relative mb-1">
              <Search size={14} strokeWidth={1.5} className="pointer-events-none absolute left-2.5 top-[9px] text-white-900" />
              <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${label.toLowerCase()}`} aria-label={`Search ${label.toLowerCase()}`} className="control h-8 w-full pl-8" />
            </div>
          ) : null}
          <ul className="max-h-[300px] overflow-y-auto" role="listbox" aria-multiselectable aria-label={label}>
            {shown.map((o) => {
              const on = values.includes(o.value);
              return (
                <li key={o.value}>
                  <button role="option" aria-selected={on} onClick={() => toggle(o.value)} className={cn('flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-white-300', on && 'text-[#3653a3]')}>
                    {o.icon ? <span aria-hidden className="w-5 shrink-0 text-center">{o.icon}</span> : null}
                    <span className="min-w-0 flex-1 truncate">{o.label}</span>
                    {o.n !== undefined ? <span className="shrink-0 tabular-nums text-xs text-white-900">{o.n.toLocaleString('en-GB')}</span> : null}
                    <Check size={14} strokeWidth={2} className={cn('shrink-0', on ? 'opacity-100' : 'opacity-0')} />
                  </button>
                </li>
              );
            })}
            {!shown.length ? <li className="px-2 py-3 text-sm text-black-700">No matches.</li> : null}
          </ul>
          {values.length ? (
            <button onClick={() => onChange([])} className="mt-1 h-8 w-full rounded-sm border-t border-white-800 text-sm text-black-700 hover:text-black-400">
              Clear
            </button>
          ) : null}
        </div>
      )}
    </Popover>
  );
}

/** Any / with / without, for has mobile and has email. */
function HasPicker({ noun, value, onChange }: { noun: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void }) {
  const label = value === true ? `Has ${noun}` : value === false ? `No ${noun}` : noun.charAt(0).toUpperCase() + noun.slice(1);
  const options: { v: boolean | undefined; label: string }[] = [
    { v: undefined, label: 'Any' },
    { v: true, label: `With ${noun}` },
    { v: false, label: `Without ${noun}` },
  ];
  return (
    <Popover
      className="w-44 p-1"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-label={`${noun.charAt(0).toUpperCase() + noun.slice(1)}: ${value === true ? 'with' : value === false ? 'without' : 'any'}`}
          className={cn(
            'flex h-[22px] shrink-0 items-center gap-1 rounded-[4px] border px-1.5 text-xs transition-colors',
            value !== undefined ? 'border-[#c4d1f2] bg-[#f2f5fe] text-[#3653a3]' : 'border-white-800 text-black-700 hover:border-white-900 hover:text-black-400',
          )}
        >
          {label}
          <ChevronDown size={12} strokeWidth={1.5} className="shrink-0 opacity-60" />
        </button>
      )}
    >
      {(close) => (
        <ul role="listbox" aria-label={noun}>
          {options.map((o) => (
            <li key={o.label}>
              <button
                role="option"
                aria-selected={value === o.v}
                onClick={() => {
                  onChange(o.v);
                  close();
                }}
                className={cn('flex h-8 w-full items-center gap-2 rounded-sm px-2 text-left text-sm hover:bg-white-300', value === o.v && 'text-[#3653a3]')}
              >
                <span className="flex-1">{o.label}</span>
                <Check size={14} strokeWidth={2} className={cn('shrink-0', value === o.v ? 'opacity-100' : 'opacity-0')} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Popover>
  );
}

// ---- the bar ------------------------------------------------------------------------------------------------
const def = (key: string) => LEAD_FILTERS.find((d) => d.key === key)!;
function ordered(key: string, facets: Facets) {
  const d = def(key);
  const vals = (facets[d.facet ?? ''] ?? []).map((x) => x.value);
  const order = d.order ?? [];
  return [...vals].sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)));
}

/** The filter keys the quick filters own (they get no chip of their own). */
export const QUICK_KEYS = ['countries', 'sizes', 'revenues', 'hasMobile', 'hasEmail'];

export function QuickFilters({ filters, onChange, facets }: { filters: Filters; onChange: (f: Filters) => void; facets: Facets }) {
  const list = (k: string) => (Array.isArray(filters[k]) ? (filters[k] as string[]) : []);
  const set = (k: string, v: unknown) => {
    const next = { ...filters };
    if (v === undefined || (Array.isArray(v) && !v.length)) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  const countries = useMemo(
    () => (facets.country ?? []).map((c) => ({ value: c.value, label: prettyValue(def('countries'), c.value), icon: flag(prettyValue(def('countries'), c.value)) })),
    [facets.country],
  );
  const sizes = useMemo(() => ordered('sizes', facets).map((v) => ({ value: v, label: prettyValue(def('sizes'), v) })), [facets]);
  const revenues = useMemo(() => ordered('revenues', facets).map((v) => ({ value: v, label: v })), [facets]);

  return (
    <div className="flex shrink-0 items-center gap-1" aria-label="Quick filters">
      <MultiPicker label="Country" values={list('countries')} options={countries} onChange={(v) => set('countries', v)} searchable width="w-72" />
      <MultiPicker label="Company size" values={list('sizes')} options={sizes} onChange={(v) => set('sizes', v)} />
      <MultiPicker label="Revenue" values={list('revenues')} options={revenues} onChange={(v) => set('revenues', v)} width="w-52" />
      <HasPicker noun="mobile" value={typeof filters.hasMobile === 'boolean' ? filters.hasMobile : undefined} onChange={(v) => set('hasMobile', v)} />
      <HasPicker noun="email" value={typeof filters.hasEmail === 'boolean' ? filters.hasEmail : undefined} onChange={(v) => set('hasEmail', v)} />
    </div>
  );
}

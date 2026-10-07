'use client';
// Stackable filters for the lead tables. Active filters are chips in one row (each opens its
// editor; each has its own remove button); "Add filter" lists every filter by group with a
// search box. Four editor kinds: pills (type any value), multi (pick from real values, with
// counts), yes/no, and ranges with quick presets. Every filter combines with AND.
import { ArrowLeft, ChevronDown, Plus, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { clearFilter, isSet, type Facets, type FilterDef, type Filters } from '@/lib/lead-search';
import { cn } from '@/lib/utils';
import { Checkbox, ChipsInput, Input } from '@/components/ui/form';
import { Popover } from '@/components/ui/overlay';

const compact = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}m` : n >= 10_000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** Display names for raw database values. */
export function prettyValue(def: FilterDef, v: string): string {
  if (def.key === 'seniorities') return v === 'c-level' ? 'C-level' : v === 'vp' ? 'VP' : v.charAt(0).toUpperCase() + v.slice(1);
  if (def.key === 'sizes') return `${v.replace(' to ', '–')} employees`;
  if (def.key === 'emailStatus') return v === 'VALID' ? 'Valid' : v === 'CATCH_ALL' ? 'Accept-all domain' : v;
  if (def.key === 'tags') return v.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).toLowerCase().replace(/^./, (c) => c.toUpperCase());
  if (def.key === 'countries' && v === 'GB') return 'United Kingdom';
  if (def.key === 'countries' && v === 'US') return 'United States';
  return v;
}

function summary(def: FilterDef, f: Filters): string {
  if (def.kind === 'bool') return f[def.key] ? (def.yes ?? def.label) : (def.no ?? `Not ${def.label.toLowerCase()}`);
  if (def.kind === 'range') {
    const { min, max, unit } = def.range!;
    const lo = f[min] as number | undefined;
    const hi = f[max] as number | undefined;
    const u = unit ? ` ${unit}` : '';
    if (typeof lo === 'number' && typeof hi === 'number') return `${def.label}: ${lo}–${hi}${u}`;
    if (typeof lo === 'number') return `${def.label}: ${lo}+${u}`;
    return `${def.label}: up to ${hi}${u}`;
  }
  const values = (f[def.key] as string[]) ?? [];
  if (values.length === 1) return `${def.label}: ${prettyValue(def, values[0])}`;
  return `${def.label}: ${prettyValue(def, values[0])} +${values.length - 1}`;
}

function MultiEditor({ def, f, onChange, facets }: { def: FilterDef; f: Filters; onChange: (next: Filters) => void; facets: Facets }) {
  const [q, setQ] = useState('');
  const value = (f[def.key] as string[]) ?? [];
  const options = useMemo(() => {
    const raw = facets[def.facet ?? ''] ?? [];
    const rank = (v: string) => {
      const i = def.order?.indexOf(v) ?? -1;
      return i === -1 ? 999 : i;
    };
    const sorted = def.order ? [...raw].sort((a, b) => rank(a.value) - rank(b.value)) : raw;
    const needle = q.trim().toLowerCase();
    const shown = needle ? sorted.filter((o) => prettyValue(def, o.value).toLowerCase().includes(needle)) : sorted;
    // selected values stay visible even when the search hides them
    const extra = value.filter((v) => !shown.some((o) => o.value === v)).map((v) => ({ value: v, n: 0 }));
    return [...extra, ...shown].slice(0, 250);
  }, [facets, def, q, value]);
  const set = (v: string, on: boolean) => onChange({ ...f, [def.key]: on ? [...value, v] : value.filter((x) => x !== v) });
  const many = (facets[def.facet ?? '']?.length ?? 0) > 8;
  return (
    <div className="w-72">
      {many ? (
        <div className="relative border-b border-white-800 p-2">
          <Search size={14} strokeWidth={1.5} className="pointer-events-none absolute left-4 top-[17px] text-white-900" />
          <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${def.label.toLowerCase()}`} className="h-8 pl-7" aria-label={`Search ${def.label}`} />
        </div>
      ) : null}
      <div className="max-h-[300px] overflow-y-auto p-2">
        {options.length ? (
          <div className="flex flex-col gap-1.5">
            {options.map((o) => (
              <div key={o.value} className="flex items-center justify-between gap-3 rounded-sm px-1 py-0.5 hover:bg-white-300">
                <Checkbox checked={value.includes(o.value)} onChange={(on) => set(o.value, on)} label={<span className="text-black-400">{prettyValue(def, o.value)}</span>} />
                {o.n ? <span className="shrink-0 tabular-nums text-black-700">{compact(o.n)}</span> : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-1 text-black-700">{facets[def.facet ?? ''] ? 'No matches.' : 'Loading options…'}</p>
        )}
      </div>
      {value.length ? (
        <div className="flex items-center justify-between border-t border-white-800 px-3 py-2">
          <span className="text-black-700">{value.length} selected</span>
          <button className="text-black-700 hover:text-black-400" onClick={() => onChange(clearFilter(def, f))}>
            Clear
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PillsEditor({ def, f, onChange, facets }: { def: FilterDef; f: Filters; onChange: (next: Filters) => void; facets: Facets }) {
  const suggestions = (facets[def.facet ?? ''] ?? []).slice(0, 200).map((o) => o.value);
  return (
    <div className="w-80 p-2">
      <ChipsInput value={(f[def.key] as string[]) ?? []} onChange={(v) => onChange({ ...f, [def.key]: v })} placeholder={def.placeholder} suggestions={suggestions} />
      <p className="mt-2 px-0.5 text-black-700">Press Enter or comma after each one.{def.hint ? ` ${def.hint}` : ''}</p>
    </div>
  );
}

function BoolEditor({ def, f, onChange }: { def: FilterDef; f: Filters; onChange: (next: Filters) => void }) {
  const v = f[def.key];
  return (
    <div className="flex w-64 flex-col gap-1 p-2">
      {[true, false].map((on) => (
        <button
          key={String(on)}
          onClick={() => onChange({ ...f, [def.key]: on })}
          className={cn('flex h-8 items-center justify-between rounded-sm px-2 text-left transition-colors', v === on ? 'bg-white-300 text-black-400' : 'text-black-700 hover:bg-white-300')}
        >
          {on ? def.yes : def.no}
          {v === on ? <span aria-hidden>✓</span> : null}
        </button>
      ))}
      {def.hint ? <p className="px-2 pt-1 text-black-700">{def.hint}</p> : null}
    </div>
  );
}

function RangeEditor({ def, f, onChange }: { def: FilterDef; f: Filters; onChange: (next: Filters) => void }) {
  const r = def.range!;
  const [lo, setLo] = useState(typeof f[r.min] === 'number' ? String(f[r.min]) : '');
  const [hi, setHi] = useState(typeof f[r.max] === 'number' ? String(f[r.max]) : '');
  const apply = (min?: number, max?: number) => {
    const next = clearFilter(def, f);
    if (min !== undefined && !Number.isNaN(min)) next[r.min] = min;
    if (max !== undefined && !Number.isNaN(max)) next[r.max] = max;
    onChange(next);
  };
  const num = (s: string) => (s.trim() === '' ? undefined : Number(s));
  return (
    <div className="w-72 p-2">
      {r.presets?.length ? (
        <div className="mb-2 flex flex-col gap-0.5 border-b border-white-800 pb-2">
          {r.presets.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setLo(p.min !== undefined ? String(p.min) : '');
                setHi(p.max !== undefined ? String(p.max) : '');
                apply(p.min, p.max);
              }}
              className="flex h-8 items-center rounded-sm px-2 text-left text-black-700 hover:bg-white-300 hover:text-black-400"
            >
              {p.label}
            </button>
          ))}
        </div>
      ) : null}
      <form
        className="flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          apply(num(lo), num(hi));
        }}
      >
        <label className="flex-1">
          <span className="mb-1 block text-black-700">From</span>
          <Input type="number" step={r.step ?? 1} value={lo} onChange={(e) => setLo(e.target.value)} className="h-8" aria-label={`${def.label} from`} />
        </label>
        <label className="flex-1">
          <span className="mb-1 block text-black-700">To</span>
          <Input type="number" step={r.step ?? 1} value={hi} onChange={(e) => setHi(e.target.value)} className="h-8" aria-label={`${def.label} to`} />
        </label>
        <button type="submit" className="h-8 rounded-sm border border-btnborder bg-white-100 px-3 text-black-400 hover:border-white-900">
          Apply
        </button>
      </form>
      {def.hint ? <p className="mt-2 px-0.5 text-black-700">{def.hint}</p> : null}
    </div>
  );
}

function Editor(props: { def: FilterDef; f: Filters; onChange: (next: Filters) => void; facets: Facets }) {
  const k = props.def.kind;
  return k === 'multi' ? <MultiEditor {...props} /> : k === 'pills' ? <PillsEditor {...props} /> : k === 'bool' ? <BoolEditor {...props} /> : <RangeEditor {...props} />;
}

export function SmartFilterBar({
  defs,
  filters,
  onChange,
  facets,
  tone = 'tag-1',
}: {
  defs: FilterDef[];
  filters: Filters;
  onChange: (next: Filters) => void;
  facets: Facets;
  /** chip colour class, so each table has its own look */
  tone?: string;
}) {
  const active = defs.filter((d) => isSet(d, filters));
  const available = defs.filter((d) => !isSet(d, filters));
  const [picked, setPicked] = useState<FilterDef | null>(null);
  const [find, setFind] = useState('');
  const groups = useMemo(() => {
    const needle = find.trim().toLowerCase();
    const list = needle ? available.filter((d) => d.label.toLowerCase().includes(needle) || d.group.toLowerCase().includes(needle)) : available;
    const out: { group: string; items: FilterDef[] }[] = [];
    list.forEach((d) => {
      const g = out.find((x) => x.group === d.group);
      if (g) g.items.push(d);
      else out.push({ group: d.group, items: [d] });
    });
    return out;
  }, [available, find]);

  return (
    <div className="flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-b border-white-800 px-4 [scrollbar-width:none]" role="toolbar" aria-label="Filters">
      {active.map((d) => (
        <span key={d.key} className={cn('tag shrink-0 gap-0 p-0', tone)}>
          <Popover
            trigger={({ toggle }) => (
              <button onClick={toggle} className="flex h-[20px] max-w-[260px] items-center gap-1 truncate pl-1.5 pr-1">
                <span className="truncate">{summary(d, filters)}</span>
                <ChevronDown size={12} strokeWidth={1.5} className="shrink-0" />
              </button>
            )}
          >
            {() => (
              <div>
                <p className="t-label px-3 pt-2.5">{d.label}</p>
                <Editor def={d} f={filters} onChange={onChange} facets={facets} />
              </div>
            )}
          </Popover>
          <button onClick={() => onChange(clearFilter(d, filters))} aria-label={`Remove ${d.label} filter`} className="mr-0.5 flex h-4 w-4 items-center justify-center rounded-[3px] hover:bg-white-400">
            <X size={12} strokeWidth={1.5} />
          </button>
        </span>
      ))}

      <Popover
        trigger={({ toggle }) => (
          <button
            onClick={() => {
              setPicked(null);
              setFind('');
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
              <button onClick={() => setPicked(null)} className="flex items-center gap-1.5 px-3 pt-2.5 text-black-700 hover:text-black-400">
                <ArrowLeft size={13} strokeWidth={1.5} /> <span className="t-label">{picked.label}</span>
              </button>
              <Editor def={picked} f={filters} onChange={onChange} facets={facets} />
            </div>
          ) : (
            <div className="w-72">
              <div className="relative border-b border-white-800 p-2">
                <Search size={14} strokeWidth={1.5} className="pointer-events-none absolute left-4 top-[17px] text-white-900" />
                <Input autoFocus value={find} onChange={(e) => setFind(e.target.value)} placeholder="Find a filter" className="h-8 pl-7" aria-label="Find a filter" />
              </div>
              <div className="max-h-[380px] overflow-y-auto py-1">
                {groups.length ? (
                  groups.map((g) => (
                    <div key={g.group} className="py-1">
                      <p className="px-3 pb-1 pt-1.5 text-black-700">{g.group}</p>
                      {g.items.map((d) => (
                        <button
                          key={d.key}
                          onClick={() => {
                            // yes/no filters apply straight away; the others open their editor
                            if (d.kind === 'bool') {
                              onChange({ ...filters, [d.key]: true });
                              close();
                            } else setPicked(d);
                          }}
                          className="flex h-8 w-full items-center justify-between px-3 text-left text-black-400 hover:bg-white-300"
                        >
                          {d.label}
                          {d.kind === 'bool' ? <span className="text-black-700">Yes</span> : null}
                        </button>
                      ))}
                    </div>
                  ))
                ) : (
                  <p className="px-3 py-2 text-black-700">No filters match.</p>
                )}
              </div>
            </div>
          )
        }
      </Popover>

      <button onClick={() => onChange({})} className={cn('ml-auto shrink-0 text-xs text-black-700 hover:text-black-400', !active.length && 'invisible')}>
        Clear all
      </button>
    </div>
  );
}

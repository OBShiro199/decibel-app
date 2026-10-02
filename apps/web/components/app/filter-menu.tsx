'use client';
// A compact filter control: a chip-shaped button showing "Label: value" that opens a
// menu of options. Same height and look everywhere, no native selects or date inputs.
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MenuItem, Popover } from '@/components/ui/overlay';

export function FilterMenu<T extends string>({
  label,
  value,
  options,
  onChange,
  allLabel,
}: {
  label: string;
  value: T | '';
  options: { value: T; label: string }[];
  onChange: (v: T | '') => void;
  /** Label for the "no filter" choice, e.g. "All reps". */
  allLabel: string;
}) {
  const current = options.find((o) => o.value === value);
  return (
    <Popover
      className="max-h-[320px] w-56 overflow-y-auto"
      trigger={({ toggle, open }) => (
        <button
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            'flex h-8 max-w-[240px] items-center gap-1.5 rounded-sm border px-2.5 text-sm transition-colors',
            current ? 'border-accent-500/40 bg-accent-50 text-black-400' : 'border-white-800 text-black-700 hover:border-btnborder hover:text-black-400',
          )}
        >
          <span className="shrink-0 text-black-700">{label}</span>
          <span className="truncate font-medium text-black-400">{current?.label ?? allLabel}</span>
          <ChevronDown size={14} strokeWidth={1.5} className="shrink-0 text-white-900" />
        </button>
      )}
    >
      {(close) => (
        <>
          {[{ value: '' as T | '', label: allLabel }, ...options].map((o) => (
            <MenuItem
              key={o.value || 'all'}
              onClick={() => {
                onChange(o.value);
                close();
              }}
            >
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.value === value ? <Check size={14} strokeWidth={1.5} className="shrink-0" /> : null}
            </MenuItem>
          ))}
        </>
      )}
    </Popover>
  );
}

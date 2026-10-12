'use client';
// Shared upload pieces for list tools (TPS/CTPS checks, DNC list): a drop zone that reads CSV,
// TSV, TXT and XLSX files, and a column picker with a sample value from each column.
import { CaretDown, Check, Phone, TextAa, UploadSimple } from '@phosphor-icons/react';
import { useRef, useState } from 'react';
import { track } from '@/lib/analytics';
import { ACCEPT, MAX_ROWS, readFile, type ParsedFile } from '@/lib/tps';
import { cn } from '@/lib/utils';
import { Popover } from '@/components/ui/overlay';

const BLUE = '#5f86e0';
const n = (v: number) => v.toLocaleString('en-GB');

export function FileDropzone({
  onFile,
  maxRows = MAX_ROWS,
  maxBytes,
  ariaLabel = 'Upload a list',
  event,
}: {
  onFile: (f: ParsedFile) => void;
  maxRows?: number;
  maxBytes?: number;
  ariaLabel?: string;
  /** analytics event name for a file that was read */
  event?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const parsed = await readFile(file, { maxRows, maxBytes });
      if (event) track(event, { rows: parsed.rows.length, columns: parsed.headers.length, type: file.name.split('.').pop() });
      onFile(parsed);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void take(e.dataTransfer.files?.[0]);
        }}
        className={cn(
          'flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed px-6 py-12 text-center transition-colors duration-150',
          over ? 'border-[#9db4ec] bg-[#f5f8fe]' : 'border-white-900 hover:border-[#9db4ec] hover:bg-[#fafbfe]',
        )}
      >
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label={ariaLabel} onChange={(e) => void take(e.target.files?.[0])} />
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-md transition-transform duration-150', over && '-translate-y-0.5')} style={{ background: '#f1f5fd' }}>
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white-800" style={{ borderTopColor: BLUE }} /> : <UploadSimple size={18} weight="duotone" style={{ color: BLUE }} />}
        </span>
        <p className="mt-3 font-medium text-black-400">{busy ? 'Reading your file…' : 'Drop a CSV or Excel file here'}</p>
        <p className="mt-1 text-black-700">
          or <span className="text-[#3653a3] underline decoration-[#c4d1f2] underline-offset-2">choose a file</span>. Up to {n(maxRows)} rows, with a header row. CSV, XLSX, TSV or TXT.
        </p>
      </label>
      {error ? (
        <p role="alert" className="mt-2 text-[#94402f]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Which column holds something (the phone numbers by default): a quiet button and a menu with a sample from each column. */
export function ColumnPicker({
  file,
  value,
  onChange,
  ariaLabel = 'Phone number column',
  icon = 'phone',
  allowNone,
}: {
  file: ParsedFile;
  value: number;
  onChange: (i: number) => void;
  ariaLabel?: string;
  icon?: 'phone' | 'text';
  /** offer "None" (value -1), for optional columns */
  allowNone?: boolean;
}) {
  const sample = (i: number) => file.rows.find((r) => r[i]?.trim())?.[i]?.trim() ?? 'Empty';
  return (
    <Popover
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className={cn(
            'inline-flex h-8 max-w-[280px] items-center gap-2 rounded-sm border bg-white-100 pl-2.5 pr-2 text-black-400 transition-colors',
            open ? 'border-white-900' : 'border-btnborder hover:border-white-900',
          )}
        >
          {icon === 'phone' ? <Phone size={14} className="shrink-0 text-black-700" /> : <TextAa size={14} className="shrink-0 text-black-700" />}
          <span className="truncate font-medium">{value >= 0 ? file.headers[value] : allowNone ? 'None' : 'Choose a column'}</span>
          <CaretDown size={11} weight="bold" className={cn('shrink-0 text-black-700 transition-transform duration-150', open && 'rotate-180')} />
        </button>
      )}
    >
      {(close) => (
        <div role="listbox" aria-label="Columns" className="max-h-[320px] w-[300px] overflow-y-auto p-1">
          {allowNone ? (
            <button
              type="button"
              role="option"
              aria-selected={value < 0}
              onClick={() => {
                onChange(-1);
                close();
              }}
              className={cn('flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left text-black-700 hover:bg-white-300', value < 0 && 'bg-[#f5f8fe]')}
            >
              <span className="flex-1">None</span>
              {value < 0 ? <Check size={14} weight="bold" className="shrink-0" style={{ color: BLUE }} /> : null}
            </button>
          ) : null}
          {file.headers.map((h, i) => (
            <button
              key={i}
              type="button"
              role="option"
              aria-selected={i === value}
              onClick={() => {
                onChange(i);
                close();
              }}
              className={cn('flex w-full items-center gap-2.5 rounded-sm px-2 py-1.5 text-left hover:bg-white-300', i === value && 'bg-[#f5f8fe]')}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-black-400">{h}</span>
                <span className="block truncate tabular-nums text-black-700">{sample(i)}</span>
              </span>
              {i === value ? <Check size={14} weight="bold" className="shrink-0" style={{ color: BLUE }} /> : null}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}


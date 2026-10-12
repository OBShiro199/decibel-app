'use client';
// DNC list: the workspace's own do-not-call numbers. Upload a file (CSV, Excel, TSV, TXT), paste a
// list or add one number; search, export and (owners and admins) remove. The database enforces the
// list everywhere: these numbers can't be dialled, and nobody with one can be added (migration 0026).
import { CaretLeft, CaretRight, CheckCircle, ClockCounterClockwise, DownloadSimple, MagnifyingGlass, PhoneX, Trash } from '@phosphor-icons/react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { track } from '@/lib/analytics';
import { useApp } from '@/lib/app-context';
import {
  addToDnc,
  DNC_MAX_BYTES,
  DNC_MAX_ROWS,
  DNC_PAGE,
  dncEntriesQuery,
  dncImportsQuery,
  dncTotalQuery,
  removeFromDnc,
  SOURCE_LABEL,
  splitPasted,
  type AddResult,
  type DncEntry,
} from '@/lib/dnc';
import { useDebounced, useMemberNames } from '@/lib/hooks';
import { DEFAULT_DIAL_COUNTRY, toE164, type DialCountry } from '@/lib/phone';
import { supabase } from '@/lib/supabase/client';
import { detectPhoneColumn, type ParsedFile } from '@/lib/tps';
import { cn, exportCsv, formatPhone, timeAgo } from '@/lib/utils';
import { ColumnPicker, FileDropzone } from '@/components/app/file-upload';
import { Button } from '@/components/ui/button';
import { Checkbox, Input, Textarea } from '@/components/ui/form';
import { useToast } from '@/components/ui/overlay';
import { PhoneInput } from '@/components/ui/phone-input';

const BLUE = '#5f86e0';
const n = (v: number) => v.toLocaleString('en-GB');
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;
type Mode = 'file' | 'paste' | 'one';

/** A name or company column, if the file has one. */
function detectLabelColumn(f: ParsedFile, phone: number) {
  const pick = (re: RegExp) => f.headers.findIndex((h, i) => i !== phone && re.test(h));
  const full = pick(/^(full ?name|name|contact)$/i);
  if (full >= 0) return full;
  const company = pick(/company|business|organisation|organization/i);
  return company >= 0 ? company : pick(/name/i);
}

// ---- adding numbers --------------------------------------------------------------------------------
function Summary({ result, onAgain }: { result: AddResult; onAgain: () => void }) {
  return (
    <div className="ai-pop flex flex-wrap items-center gap-3 rounded-md border border-white-800 px-4 py-3.5" aria-live="polite">
      <CheckCircle size={20} weight="duotone" className="shrink-0 text-[#3f8f5e]" />
      <p className="flex-1 text-black-400">
        <span className="font-medium">{plural(result.added, 'number')} added</span>
        {result.duplicates ? <span className="text-black-700"> · {n(result.duplicates)} already on the list</span> : null}
        {result.invalid ? <span className="text-black-700"> · {n(result.invalid)} not phone numbers</span> : null}
      </p>
      <Button size="compact" onClick={onAgain}>
        Add more
      </Button>
    </div>
  );
}

function Progress({ done, total }: { done: number; total: number }) {
  const pct = total ? Math.max(4, Math.round((done / total) * 100)) : 100;
  return (
    <div className="rounded-md border border-white-800 px-4 py-4" aria-live="polite">
      <p className="flex items-baseline justify-between text-black-700">
        <span>
          Adding <span className="font-medium text-black-400">{n(done)}</span> of {plural(total, 'number')}…
        </span>
        <span className="tabular-nums">{pct}%</span>
      </p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-[#edf2fd]" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <div className="relative h-full overflow-hidden rounded-full transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }}>
          <span className="tps-stripes-fill" />
        </div>
      </div>
    </div>
  );
}

function FilePrepare({ file, onCancel, onAdd }: { file: ParsedFile; onCancel: () => void; onAdd: (numbers: string[], labels: (string | null)[], reason: string) => void }) {
  const [phone, setPhone] = useState(() => detectPhoneColumn(file));
  const [label, setLabel] = useState(() => detectLabelColumn(file, detectPhoneColumn(file)));
  const [reason, setReason] = useState('');
  const numbers = phone >= 0 ? file.rows.map((r) => r[phone] ?? '').filter((v) => v.trim()) : [];
  const preview = file.rows.slice(0, 5);

  const add = () => {
    const kept = file.rows.filter((r) => (r[phone] ?? '').trim());
    onAdd(
      kept.map((r) => r[phone]),
      kept.map((r) => (label >= 0 ? r[label] || null : null)),
      reason,
    );
  };

  return (
    <div className="ai-pop flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <p className="min-w-0 flex-1">
          <span className="font-medium text-black-400">{file.name}</span>
          <span className="text-black-700"> · {plural(file.rows.length, 'row')}</span>
        </p>
        <Button variant="ghost" size="compact" onClick={onCancel}>
          Choose another file
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <span className="flex items-center gap-2">
          <span className="text-black-700">Numbers are in</span>
          <ColumnPicker file={file} value={phone} onChange={setPhone} />
        </span>
        <span className="flex items-center gap-2">
          <span className="text-black-700">Name (optional)</span>
          <ColumnPicker file={file} value={label} onChange={setLabel} ariaLabel="Name column" icon="text" allowNone />
        </span>
      </div>
      {phone >= 0 ? (
        <div className="overflow-x-auto rounded-md border border-white-800">
          <table className="w-full min-w-[420px] table-fixed border-collapse">
            <thead>
              <tr className="border-b border-white-800 text-left text-black-700">
                <th className="w-[200px] bg-[#f7f9fe] px-3 py-2 font-medium text-[#3653a3]">{file.headers[phone]}</th>
                <th className="px-3 py-2 font-normal">{label >= 0 ? file.headers[label] : 'Name'}</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r, i) => (
                <tr key={i} className="border-b border-white-800 last:border-0">
                  <td className="truncate bg-[#f7f9fe] px-3 py-2 tabular-nums text-black-400">{r[phone] || <span className="text-white-900">Blank</span>}</td>
                  <td className="truncate px-3 py-2 text-black-700">{label >= 0 ? r[label] : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[240px] flex-1">
          <span className="mb-1 block text-black-700">Reason (optional, applies to every number)</span>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Customer opt-out list" maxLength={200} />
        </label>
        <Button variant="primary" disabled={!numbers.length} onClick={add}>
          <PhoneX size={15} weight="duotone" /> Add {plural(numbers.length, 'number')}
        </Button>
      </div>
    </div>
  );
}

function AddNumbers() {
  const { workspace } = useApp();
  const qc = useQueryClient();
  const [mode, setMode] = useState<Mode>('file');
  const [file, setFile] = useState<ParsedFile | null>(null);
  const [pasted, setPasted] = useState('');
  const [one, setOne] = useState('');
  const [oneCountry, setOneCountry] = useState<DialCountry>(DEFAULT_DIAL_COUNTRY);
  const [reason, setReason] = useState('');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<AddResult | null>(null);
  const [error, setError] = useState('');
  const pastedNumbers = useMemo(() => splitPasted(pasted), [pasted]);
  const oneE164 = toE164(one, oneCountry);

  const reset = () => {
    setFile(null);
    setPasted('');
    setOne('');
    setReason('');
    setResult(null);
    setError('');
  };
  const refresh = () => ['dnc', 'dnc-total', 'dnc-imports', 'lead-search', 'local-search', 'people'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));

  async function run(numbers: string[], opts: { labels?: (string | null)[]; reason: string; kind: 'file' | 'paste' | 'manual'; fileName?: string }) {
    setError('');
    setResult(null);
    setProgress({ done: 0, total: numbers.length });
    try {
      const r = await addToDnc(workspace.id, numbers, { ...opts, onProgress: (done) => setProgress({ done, total: numbers.length }) });
      track('dnc_added', { kind: opts.kind, added: r.added, rows: numbers.length });
      setResult(r);
      setFile(null);
      setPasted('');
      setOne('');
      refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  const modes: { id: Mode; label: string }[] = [
    { id: 'file', label: 'Upload a file' },
    { id: 'paste', label: 'Paste numbers' },
    { id: 'one', label: 'Add one number' },
  ];

  return (
    <section className="mt-6 rounded-md border border-white-800" aria-label="Add numbers">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-white-800 px-4 py-3" role="radiogroup" aria-label="How to add numbers">
        {modes.map((m) => (
          <button
            key={m.id}
            role="radio"
            aria-checked={mode === m.id}
            disabled={!!progress}
            onClick={() => {
              setMode(m.id);
              reset();
            }}
            className={cn(
              'flex h-7 items-center rounded-sm border px-2.5 transition-colors',
              mode === m.id ? 'border-[#c4d1f2] bg-[#f2f5fe] text-[#3653a3]' : 'border-white-800 text-black-700 hover:border-white-900 hover:text-black-400',
            )}
          >
            {m.label}
          </button>
        ))}
      </div>
      <div className="p-4">
        {progress ? (
          <Progress done={progress.done} total={progress.total} />
        ) : result ? (
          <Summary result={result} onAgain={reset} />
        ) : mode === 'file' ? (
          file ? (
            <FilePrepare file={file} onCancel={() => setFile(null)} onAdd={(numbers, labels, why) => void run(numbers, { labels, reason: why, kind: 'file', fileName: file.name })} />
          ) : (
            <FileDropzone onFile={setFile} maxRows={DNC_MAX_ROWS} maxBytes={DNC_MAX_BYTES} ariaLabel="Upload a DNC list" event="dnc_file_read" />
          )
        ) : mode === 'paste' ? (
          <div className="flex flex-col gap-3">
            <label>
              <span className="mb-1 block text-black-700">Numbers, one per line (commas and semicolons work too)</span>
              <Textarea value={pasted} onChange={(e) => setPasted(e.target.value)} rows={6} placeholder={'07700 900123\n+44 20 7946 0000\n0044 7700 900456'} aria-label="Numbers to add" className="tabular-nums" />
            </label>
            <div className="flex flex-wrap items-end gap-3">
              <label className="min-w-[240px] flex-1">
                <span className="mb-1 block text-black-700">Reason (optional)</span>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Asked not to be called" maxLength={200} />
              </label>
              <Button variant="primary" disabled={!pastedNumbers.length} onClick={() => void run(pastedNumbers, { reason, kind: 'paste' })}>
                <PhoneX size={15} weight="duotone" /> Add {pastedNumbers.length ? plural(pastedNumbers.length, 'number') : 'numbers'}
              </Button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (oneE164) void run([oneE164], { reason, kind: 'manual' });
            }}
          >
            <label className="min-w-[260px]">
              <span className="mb-1 block text-black-700">Number</span>
              <PhoneInput id="dnc-one" value={one} onChange={setOne} country={oneCountry} onCountryChange={setOneCountry} />
            </label>
            <label className="min-w-[220px] flex-1">
              <span className="mb-1 block text-black-700">Reason (optional)</span>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Asked not to be called" maxLength={200} />
            </label>
            <Button type="submit" variant="primary" disabled={!oneE164}>
              <PhoneX size={15} weight="duotone" /> Add to DNC list
            </Button>
          </form>
        )}
        {error ? (
          <p role="alert" className="mt-3 text-[#94402f]">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}

// ---- recent uploads ------------------------------------------------------------------------------------
function Uploads() {
  const { workspace } = useApp();
  const names = useMemberNames();
  const imports = useQuery(dncImportsQuery(workspace.id));
  const [open, setOpen] = useState(false);
  const rows = imports.data ?? [];
  return (
    <section className="mt-6 overflow-hidden rounded-md border border-white-800" aria-label="Recent uploads">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <ClockCounterClockwise size={16} weight="duotone" style={{ color: BLUE }} />
        <span className="font-medium text-black-400">Recent uploads</span>
        {rows.length ? <span className="tabular-nums text-black-700">{n(rows.length)}</span> : null}
        <CaretRight size={14} className={cn('ml-auto text-black-700 transition-transform duration-150', open && 'rotate-90')} />
      </button>
      {!open ? null : !rows.length ? (
        <p className="ai-pop border-t border-white-800 px-4 py-6 text-center text-black-700">Uploads and pasted lists appear here.</p>
      ) : (
        <div className="ai-pop overflow-x-auto border-t border-white-800">
          <table className="w-full min-w-[720px] table-fixed border-collapse" data-testid="dnc-uploads">
            <thead>
              <tr className="border-b border-white-800 text-left text-black-700">
                <th className="px-4 py-2 font-normal">List</th>
                <th className="w-[140px] px-3 py-2 font-normal">When</th>
                <th className="w-[300px] px-3 py-2 font-normal">Result</th>
                <th className="w-[150px] px-3 py-2 font-normal">By</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => (
                <tr key={u.id} className="border-b border-white-800 last:border-0">
                  <td className="px-4 py-2.5">
                    <p className="truncate text-black-400">{u.file_name}</p>
                    <p className="truncate text-black-700">{u.reason ?? plural(u.total_rows, 'row')}</p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-black-700">{timeAgo(u.created_at)}</td>
                  <td className="px-3 py-2.5 tabular-nums text-black-700">
                    {u.status === 'running' ? (
                      'Adding…'
                    ) : u.status === 'failed' ? (
                      <span className="text-[#94402f]">Stopped after {n(u.added)} added</span>
                    ) : (
                      <>
                        <span className="text-black-400">{n(u.added)} added</span>
                        {u.duplicates ? ` · ${n(u.duplicates)} already listed` : ''}
                        {u.invalid ? ` · ${n(u.invalid)} invalid` : ''}
                      </>
                    )}
                  </td>
                  <td className="truncate px-3 py-2.5 text-black-700">{u.user_id ? (names[u.user_id] ?? 'Teammate') : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---- the list ---------------------------------------------------------------------------------------------
function NumbersTable() {
  const { workspace, isAdmin } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const names = useMemberNames();
  const [search, setSearch] = useState('');
  const q = useDebounced(search, 250);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [removing, setRemoving] = useState(false);
  const list = useQuery({ ...dncEntriesQuery(workspace.id, q, page), placeholderData: (prev) => prev });
  const rows = list.data?.rows ?? [];
  const count = list.data?.count ?? 0;
  const pages = Math.max(1, Math.ceil(count / DNC_PAGE));
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));

  async function remove(ids: string[]) {
    setRemoving(true);
    try {
      const gone = await removeFromDnc(workspace.id, ids);
      track('dnc_removed', { count: gone });
      toast(`${plural(gone, 'number')} removed from the DNC list`);
      setSelected(new Set());
      ['dnc', 'dnc-total', 'lead-search', 'local-search', 'people'].forEach((k) => void qc.invalidateQueries({ queryKey: [k] }));
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <section className="mt-8" aria-label="Numbers on the DNC list">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="font-medium text-black-400">Numbers</h2>
        <div className="relative ml-auto">
          <MagnifyingGlass size={14} className="pointer-events-none absolute left-2.5 top-[9px] text-white-900" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
            placeholder="Search number or name"
            aria-label="Search the DNC list"
            className="h-8 w-64 pl-8"
          />
        </div>
        {isAdmin && selected.size ? (
          <Button size="compact" variant="danger" loading={removing} onClick={() => void remove([...selected])}>
            <Trash size={14} /> Remove {n(selected.size)}
          </Button>
        ) : null}
      </div>
      <div className="mt-2 overflow-x-auto rounded-md border border-white-800">
        <table className={cn('w-full min-w-[860px] table-fixed border-collapse transition-opacity', list.isPlaceholderData && 'opacity-60')} data-testid="dnc-table">
          <thead>
            <tr className="border-b border-white-800 text-left text-black-700">
              {isAdmin ? (
                <th className="w-10 px-3 py-2">
                  <Checkbox aria-label="Select this page" checked={allOnPage} onChange={(v) => setSelected(v ? new Set(rows.map((r) => r.id)) : new Set())} />
                </th>
              ) : null}
              <th className="w-[170px] px-3 py-2 font-normal">Number</th>
              <th className="px-3 py-2 font-normal">Name</th>
              <th className="w-[120px] px-3 py-2 font-normal">Source</th>
              <th className="px-3 py-2 font-normal">Reason</th>
              <th className="w-[140px] px-3 py-2 font-normal">Added by</th>
              <th className="w-[110px] px-3 py-2 font-normal">Added</th>
              {isAdmin ? <th className="w-12 px-2 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {list.isLoading
              ? Array.from({ length: 5 }, (_, i) => (
                  <tr key={i} className="border-b border-white-800">
                    <td colSpan={isAdmin ? 8 : 6} className="px-3 py-2.5">
                      <span className="skeleton block h-3.5 w-2/3" />
                    </td>
                  </tr>
                ))
              : rows.map((r: DncEntry) => {
                  const src = SOURCE_LABEL[r.source] ?? SOURCE_LABEL.manual;
                  return (
                    <tr key={r.id} className="border-b border-white-800 last:border-0">
                      {isAdmin ? (
                        <td className="px-3 py-2">
                          <Checkbox
                            aria-label={`Select ${r.e164}`}
                            checked={selected.has(r.id)}
                            onChange={(v) =>
                              setSelected((s) => {
                                const next = new Set(s);
                                if (v) next.add(r.id);
                                else next.delete(r.id);
                                return next;
                              })
                            }
                          />
                        </td>
                      ) : null}
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-black-400">{formatPhone(r.e164)}</td>
                      <td className="truncate px-3 py-2 text-black-700" title={r.label ?? undefined}>
                        {r.label ?? ''}
                      </td>
                      <td className="px-3 py-2">
                        <span className={`tag tag-${src.tag}`}>{src.label}</span>
                      </td>
                      <td className="truncate px-3 py-2 text-black-700" title={r.reason ?? undefined}>
                        {r.reason ?? ''}
                      </td>
                      <td className="truncate px-3 py-2 text-black-700">{r.added_by ? (names[r.added_by] ?? 'Teammate') : ''}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-black-700">{timeAgo(r.created_at)}</td>
                      {isAdmin ? (
                        <td className="px-2 py-2">
                          <button
                            onClick={() => void remove([r.id])}
                            disabled={removing}
                            aria-label={`Remove ${r.e164} from the DNC list`}
                            className="flex h-7 w-7 items-center justify-center rounded-sm text-black-700 hover:bg-white-300 hover:text-[#94402f]"
                          >
                            <Trash size={14} />
                          </button>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
            {!list.isLoading && !rows.length ? (
              <tr>
                <td colSpan={isAdmin ? 8 : 6} className="px-4 py-8 text-center text-black-700">
                  {q.trim() ? 'No numbers match that search.' : 'No numbers yet. Upload a list, paste numbers or add one above.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
      {count > DNC_PAGE ? (
        <div className="mt-2 flex items-center justify-end gap-2 text-black-700">
          <span className="tabular-nums">
            {n(page * DNC_PAGE + 1)}–{n(Math.min((page + 1) * DNC_PAGE, count))} of {n(count)}
          </span>
          <Button variant="ghost" size="icon-compact" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <CaretLeft size={14} />
          </Button>
          <Button variant="ghost" size="icon-compact" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            <CaretRight size={14} />
          </Button>
        </div>
      ) : null}
      {!isAdmin ? <p className="mt-2 text-black-700">Anyone can add numbers. Only owners and admins can remove them.</p> : null}
    </section>
  );
}

// ---- page -------------------------------------------------------------------------------------------------------
export function DncList() {
  const { workspace } = useApp();
  const toast = useToast();
  const names = useMemberNames();
  const total = useQuery(dncTotalQuery(workspace.id));
  const [exporting, setExporting] = useState(false);

  async function exportAll() {
    setExporting(true);
    try {
      const all: DncEntry[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase()
          .from('dnc_entries')
          .select('id,e164,label,reason,source,added_by,created_at')
          .eq('workspace_id', workspace.id)
          .order('created_at')
          .order('id')
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        all.push(...((data ?? []) as DncEntry[]));
        if ((data ?? []).length < 1000) break;
      }
      if (!all.length) return void toast('The DNC list is empty.');
      exportCsv(
        workspace.id,
        'dnc',
        `decibel-dnc-list-${new Date().toISOString().slice(0, 10)}.csv`,
        all.map((r) => ({ number: r.e164, name: r.label ?? '', source: SOURCE_LABEL[r.source]?.label ?? r.source, reason: r.reason ?? '', added_by: r.added_by ? (names[r.added_by] ?? '') : '', added_at: r.created_at })),
      );
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto bg-white-100">
      <div className="mx-auto w-full max-w-[1040px] px-6 pb-20 pt-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md" style={{ background: '#f1f5fd' }}>
                <PhoneX size={17} weight="duotone" style={{ color: BLUE }} />
              </span>
              <h1 className="t-h2">DNC list</h1>
            </div>
            <p className="mt-2 max-w-[600px] text-black-700">Numbers your team must never call. Anyone on this list can’t be dialled, and leads, businesses or people with these numbers can’t be added.</p>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <p className="text-right text-black-700" data-testid="dnc-total">
              <span className="font-medium tabular-nums text-black-400">{total.data === undefined ? '…' : n(total.data)}</span> {total.data === 1 ? 'number' : 'numbers'}
            </p>
            <Button size="compact" loading={exporting} disabled={!total.data} onClick={() => void exportAll()}>
              <DownloadSimple size={14} /> Export CSV
            </Button>
          </div>
        </div>
        <AddNumbers />
        <Uploads />
        <NumbersTable />
      </div>
    </div>
  );
}

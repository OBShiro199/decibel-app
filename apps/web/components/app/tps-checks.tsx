'use client';
// TPS/CTPS checks: upload a list (up to 1,000 rows), Decibel checks every UK number against the
// TPS and CTPS registers and gives the file back with a status column. Credits, outcomes and the
// checking itself live in the database and the tps-check worker (migration 0023); this page
// parses the file, shows the exact cost, follows the check live and offers the downloads.
import {
  ArrowCounterClockwise,
  BracketsCurly,
  CaretDown,
  CaretLeft,
  CaretRight,
  Check,
  ClockCounterClockwise,
  Coins,
  DotsThree,
  DownloadSimple,
  FileCsv,
  FileText,
  FileXls,
  Phone,
  ShieldCheck,
  Trash,
  UploadSimple,
  X,
} from '@phosphor-icons/react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '@/lib/app-context';
import { track } from '@/lib/analytics';
import { supabase } from '@/lib/supabase/client';
import {
  ACCEPT,
  creditsUsed,
  detectPhoneColumn,
  downloadChecked,
  explainError,
  fetchQuote,
  isLive,
  numberOutcome,
  matchesFilter,
  MAX_ROWS,
  OUTCOMES,
  readFile,
  rowCounts,
  TOP_UP_MESSAGE,
  tpsCreditsQuery,
  tpsJobQuery,
  tpsJobsQuery,
  tpsLiveQuery,
  tpsResultsQuery,
  WELCOME_TPS_CREDITS,
  type ExportFormat,
  type Outcome,
  type ParsedFile,
  type RowFilter,
  type TpsJob,
} from '@/lib/tps';
import { cn, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MenuItem, Popover, useToast } from '@/components/ui/overlay';
import { openSupport } from '@/components/app/support-widget';
import { confetti } from '@/components/ui/confetti';

const BLUE = '#5f86e0';
const n = (v: number) => v.toLocaleString('en-GB');
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

function topUp() {
  track('tps_topup_clicked');
  openSupport(TOP_UP_MESSAGE);
}

// ---- small pieces --------------------------------------------------------------------
function OutcomeTag({ outcome }: { outcome: Outcome }) {
  return <span className={`tag tag-${OUTCOMES[outcome].tag}`}>{OUTCOMES[outcome].label}</span>;
}

function Dot({ outcome }: { outcome: Outcome }) {
  return <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: OUTCOMES[outcome].bar }} aria-hidden />;
}

function StatusTag({ job }: { job: TpsJob }) {
  if (isLive(job)) {
    const pct = job.numbers_total ? Math.round((job.numbers_done / job.numbers_total) * 100) : 0;
    return (
      <span className="tag tag-1">
        <span className="tps-pulse h-1.5 w-1.5 rounded-full" style={{ background: BLUE }} />
        {job.status === 'cancelled' ? 'Stopping' : `Checking ${pct}%`}
      </span>
    );
  }
  if (job.status === 'done')
    return (
      <span role="img" aria-label="Done" title="Done" className="inline-flex text-[#3f8f5e]">
        <Check size={15} weight="bold" />
      </span>
    );
  if (job.status === 'cancelled') return <span className="tag tag-7">Cancelled</span>;
  return <span className="tag tag-3">Stopped</span>;
}

// ---- credits ----------------------------------------------------------------------------
/** Compact, top right: what's left, a short pastel bar, and Top up. */
function CreditsBadge() {
  const { workspace } = useApp();
  const credits = useQuery(tpsCreditsQuery(workspace.id));
  const left = credits.data?.balance ?? 0;
  const total = Math.max(credits.data?.granted ?? WELCOME_TPS_CREDITS, left, 1);
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const tone = left <= 0 || pct < 5 ? { fill: '#e8a593', track: '#fbeee9' } : pct < 20 ? { fill: '#e2bf6f', track: '#faf3e3' } : { fill: '#8fb0ee', track: '#edf2fd' };
  const label = `${n(left)} of ${n(total)} check credits left. 1 credit per unique UK number; duplicates, blanks, invalid and non-UK numbers are free.`;
  return (
    <div className="flex shrink-0 items-center gap-3" aria-label="Check credits" title={label}>
      <div className="text-right">
        <p className="tabular-nums text-black-700" data-testid="tps-credits">
          {credits.isLoading ? '…' : (
            <>
              <span className="font-medium text-black-400">{n(left)}</span> of {n(total)} left
            </>
          )}
        </p>
        <span className="mt-1 ml-auto block h-1 w-[120px] overflow-hidden rounded-full" style={{ background: tone.track }}>
          <span className="block h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.2,0,0,1)]" style={{ width: `${pct}%`, background: tone.fill }} />
        </span>
      </div>
      <Button size="compact" onClick={topUp}>
        <Coins size={14} /> Top up
      </Button>
    </div>
  );
}

// ---- upload ----------------------------------------------------------------------------
function Dropzone({ onFile }: { onFile: (f: ParsedFile) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function take(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const parsed = await readFile(file);
      track('tps_file_read', { rows: parsed.rows.length, columns: parsed.headers.length, type: file.name.split('.').pop() });
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
        <input ref={input} type="file" accept={ACCEPT} className="sr-only" aria-label="Upload a list to check" onChange={(e) => void take(e.target.files?.[0])} />
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-md transition-transform duration-150', over && '-translate-y-0.5')} style={{ background: '#f1f5fd' }}>
          {busy ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white-800" style={{ borderTopColor: BLUE }} /> : <UploadSimple size={18} weight="duotone" style={{ color: BLUE }} />}
        </span>
        <p className="mt-3 font-medium text-black-400">{busy ? 'Reading your file…' : 'Drop a CSV or Excel file here'}</p>
        <p className="mt-1 text-black-700">
          or <span className="text-[#3653a3] underline decoration-[#c4d1f2] underline-offset-2">choose a file</span>. Up to {n(MAX_ROWS)} rows, with a header row. CSV, XLSX, TSV or TXT.
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

function Prepare({ file, onCancel, onStarted }: { file: ParsedFile; onCancel: () => void; onStarted: (id: string) => void }) {
  const { workspace } = useApp();
  const qc = useQueryClient();
  const [column, setColumn] = useState(() => detectPhoneColumn(file));
  const [error, setError] = useState<{ text: string; topUp?: boolean } | null>(null);
  const values = useMemo(() => (column >= 0 ? file.rows.map((r) => r[column] ?? '') : []), [file, column]);
  const quote = useQuery({
    queryKey: ['tps-quote', workspace.id, file.name, file.rows.length, column],
    queryFn: () => fetchQuote(workspace.id, values),
    enabled: column >= 0,
    staleTime: 30_000,
  });
  const q = quote.data;
  const short = q ? q.cost > q.balance : false;

  const start = useMutation({
    mutationFn: async () => {
      const { data, error: e } = await supabase().rpc('tps_create_job', {
        p_workspace_id: workspace.id,
        p_file_name: file.name,
        p_headers: file.headers,
        p_phone_column: column,
        p_rows: file.rows,
      });
      if (e) throw new Error(e.message);
      return data as string;
    },
    onSuccess: (id) => {
      track('tps_check_started', { rows: file.rows.length, cost: q?.cost ?? null });
      void qc.invalidateQueries({ queryKey: ['tps-credits', workspace.id] });
      void qc.invalidateQueries({ queryKey: ['tps-jobs', workspace.id] });
      onStarted(id);
    },
    onError: (e) => setError(explainError((e as Error).message)),
  });

  const preview = file.rows.slice(0, 5);

  return (
    <section className="ai-pop rounded-md border border-white-800" aria-label="Check this file">
      <header className="flex items-center gap-3 border-b border-white-800 px-4 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-white-200">
          {file.name.toLowerCase().endsWith('.xlsx') ? <FileXls size={17} weight="duotone" className="text-[#2f6b47]" /> : <FileCsv size={17} weight="duotone" className="text-black-700" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-black-400">{file.name}</p>
          <p className="text-black-700">
            {plural(file.rows.length, 'row')} · {plural(file.headers.length, 'column')}
          </p>
        </div>
        <Button variant="ghost" size="compact" onClick={onCancel}>
          Choose another file
        </Button>
      </header>

      <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 border-white-800 p-4 md:border-r">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-black-700">Phone numbers are in</span>
            <ColumnPicker
              file={file}
              value={column}
              onChange={(i) => {
                setColumn(i);
                setError(null);
              }}
            />
          </div>

          {/* every column of the file, scrolling sideways, so nothing looks left out of the export;
              # and the phone column stay pinned on the left */}
          <div className="mt-4 overflow-x-auto rounded-md border border-white-800" data-testid="tps-preview">
            <table className="table-fixed border-separate border-spacing-0" style={{ width: 40 + file.headers.length * 160, minWidth: '100%' }}>
              <colgroup>
                <col style={{ width: 40 }} />
                {file.headers.map((_, i) => (
                  <col key={i} style={{ width: 160 }} />
                ))}
              </colgroup>
              <thead>
                <tr className="text-left text-black-700 [&>th]:border-b [&>th]:border-white-800 [&>th]:py-2">
                  <th className="sticky left-0 z-[1] bg-white-100 px-3 font-normal">#</th>
                  {column >= 0 ? (
                    <th title={file.headers[column]} className="sticky left-[40px] z-[1] truncate border-r bg-[#f7f9fe] px-3 font-medium text-[#3653a3]">
                      {file.headers[column]}
                    </th>
                  ) : null}
                  {file.headers.map((h, i) =>
                    i === column ? null : (
                      <th key={i} title={h} className="truncate px-3 font-normal">
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-white-800">
                {preview.map((r, ri) => (
                  <tr key={ri}>
                    <td className="sticky left-0 z-[1] bg-white-100 px-3 py-2 tabular-nums text-black-700">{ri + 1}</td>
                    {column >= 0 ? (
                      <td title={r[column]} className="sticky left-[40px] z-[1] truncate border-r bg-[#f7f9fe] px-3 py-2 tabular-nums text-black-400">
                        {r[column] || <span className="text-white-900">Blank</span>}
                      </td>
                    ) : null}
                    {file.headers.map((_, i) =>
                      i === column ? null : (
                        <td key={i} title={r[i]} className="truncate px-3 py-2 text-black-700">
                          {r[i]}
                        </td>
                      ),
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-black-700">
            {file.rows.length > preview.length ? `First 5 of ${plural(file.rows.length, 'row')}. ` : ''}All {plural(file.headers.length, 'column')} are kept{file.headers.length > 5 ? ', scroll sideways to see them' : ''}.
          </p>
        </div>

        <aside className="flex flex-col p-4" aria-label="What this check costs">
          {column < 0 ? (
            <p className="text-black-700">Choose the column with the phone numbers to see what the check costs.</p>
          ) : !q ? (
            <div className="space-y-2.5" aria-busy>
              {[70, 55, 62, 48].map((w) => (
                <span key={w} className="skeleton block h-4" style={{ width: `${w}%` }} />
              ))}
            </div>
          ) : (
            <>
              <ul className="space-y-2">
                <QuoteLine dot={BLUE} label="UK numbers to check" value={q.cost} strong />
                {q.numbers_reused ? <QuoteLine dot={OUTCOMES.valid.bar} label="Checked in the last 28 days (free)" value={q.numbers_reused} /> : null}
                {q.rows_total - q.rows_not_uk - q.rows_invalid - q.rows_missing - q.numbers_total > 0 ? (
                  <QuoteLine dot="#dcdcd7" label="Duplicate rows (checked once)" value={q.rows_total - q.rows_not_uk - q.rows_invalid - q.rows_missing - q.numbers_total} />
                ) : null}
                {q.rows_not_uk ? <QuoteLine dot={OUTCOMES.not_uk.bar} label="Not UK (skipped, free)" value={q.rows_not_uk} /> : null}
                {q.rows_invalid ? <QuoteLine dot={OUTCOMES.invalid.bar} label="Invalid (free)" value={q.rows_invalid} /> : null}
                {q.rows_missing ? <QuoteLine dot={OUTCOMES.missing.bar} label="Blank (free)" value={q.rows_missing} /> : null}
              </ul>
              <div className="mt-4 border-t border-white-800 pt-3">
                <p className="flex items-baseline justify-between">
                  <span className="text-black-700">Uses</span>
                  <span className="tabular-nums font-medium text-black-400">{plural(q.cost, 'credit')}</span>
                </p>
                <p className="mt-1 flex items-baseline justify-between text-black-700">
                  <span>You have</span>
                  <span className="tabular-nums">{n(q.balance)}</span>
                </p>
                {short ? <p className="mt-2 text-[#94402f]">You need {plural(q.cost - q.balance, 'more credit')} for this file. Top up, or upload fewer rows.</p> : null}
              </div>
              {error ? (
                <p role="alert" className="mt-3 text-[#94402f]">
                  {error.text}
                </p>
              ) : null}
              <div className="mt-auto flex flex-col gap-2 pt-4">
                {short || error?.topUp ? (
                  <Button variant="primary" onClick={topUp}>
                    <Coins size={14} /> Top up check credits
                  </Button>
                ) : (
                  <Button variant="primary" loading={start.isPending} disabled={q.numbers_total + q.rows_not_uk + q.rows_invalid + q.rows_missing === 0} onClick={() => start.mutate()}>
                    <ShieldCheck size={15} weight="duotone" />
                    {q.cost ? `Check ${plural(q.cost, 'number')}` : 'Get results (free)'}
                  </Button>
                )}
              </div>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

/** Which column holds the phone numbers: a quiet button and a menu with a sample from each column. */
function ColumnPicker({ file, value, onChange }: { file: ParsedFile; value: number; onChange: (i: number) => void }) {
  const sample = (i: number) => file.rows.find((r) => r[i]?.trim())?.[i]?.trim() ?? 'Empty';
  return (
    <Popover
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Phone number column"
          className={cn(
            'inline-flex h-8 max-w-[280px] items-center gap-2 rounded-sm border bg-white-100 pl-2.5 pr-2 text-black-400 transition-colors',
            open ? 'border-white-900' : 'border-btnborder hover:border-white-900',
          )}
        >
          <Phone size={14} className="shrink-0 text-black-700" />
          <span className="truncate font-medium">{value >= 0 ? file.headers[value] : 'Choose a column'}</span>
          <CaretDown size={11} weight="bold" className={cn('shrink-0 text-black-700 transition-transform duration-150', open && 'rotate-180')} />
        </button>
      )}
    >
      {(close) => (
        <div role="listbox" aria-label="Columns" className="max-h-[320px] w-[300px] overflow-y-auto p-1">
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

function QuoteLine({ dot, label, value, strong }: { dot: string; label: string; value: number; strong?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
      <span className={cn('flex-1', strong ? 'text-black-400' : 'text-black-700')}>{label}</span>
      <span className={cn('tabular-nums', strong ? 'font-medium text-black-400' : 'text-black-700')}>{n(value)}</span>
    </li>
  );
}

// ---- export ------------------------------------------------------------------------------------
const FORMATS: { ext: ExportFormat; label: string; icon: typeof FileCsv }[] = [
  { ext: 'csv', label: 'Export as CSV', icon: FileCsv },
  { ext: 'xlsx', label: 'Export as XLSX', icon: FileXls },
  { ext: 'md', label: 'Export as Markdown', icon: FileText },
  { ext: 'json', label: 'Export as JSON', icon: BracketsCurly },
];

function ExportMenu({ note, disabled, onExport }: { note: string; disabled?: boolean; onExport: (ext: ExportFormat) => void }) {
  return (
    <Popover
      align="right"
      trigger={({ open, toggle }) => (
        <Button size="compact" onClick={toggle} disabled={disabled} aria-haspopup="menu" aria-expanded={open}>
          <DownloadSimple size={14} /> Export
          <CaretDown size={11} weight="bold" className={cn('text-black-700 transition-transform duration-150', open && 'rotate-180')} />
        </Button>
      )}
    >
      {(close) => (
        <div className="w-[220px] p-1">
          <p className="truncate px-2 pb-1 pt-1.5 text-black-700">{note}</p>
          {FORMATS.map((f) => (
            <MenuItem key={f.ext} onClick={() => (close(), onExport(f.ext))}>
              <f.icon size={15} className="text-black-700" /> {f.label}
            </MenuItem>
          ))}
        </div>
      )}
    </Popover>
  );
}

// ---- a check, live and finished -----------------------------------------------------------
function failureText(job: TpsJob) {
  if (job.error?.startsWith('provider')) return 'The TPS registers could not be reached, so this check stopped early. Every number it did not check was refunded. Try again a little later.';
  return 'This check stopped early. Every number it did not check was refunded.';
}

function eta(job: TpsJob): string {
  const left = job.numbers_total - job.numbers_done;
  const elapsed = (Date.now() - new Date(job.created_at).getTime()) / 1000;
  const live = Math.max(job.numbers_done - job.numbers_reused, 0);
  if (!left) return 'finishing';
  if (live < 3 || elapsed < 2) return 'working out the time left';
  const secs = Math.ceil((left / live) * elapsed);
  return secs < 60 ? `about ${secs}s left` : `about ${Math.ceil(secs / 60)} min left`;
}

const FILTER_NOTE: Record<RowFilter, string> = { all: 'All rows', callable: 'Valid rows', dnc: 'Do-not-call rows', other: 'Other rows' };

function JobPanel({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { workspace } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const job = useQuery({ ...tpsJobQuery(jobId), refetchInterval: (q) => (q.state.data && !q.state.data.finished_at ? 700 : false) });
  const j = job.data;
  const live = isLive(j);
  // the uploaded rows load once; while the check runs, only each number's state is polled and merged in
  const results = useQuery({ ...tpsResultsQuery(jobId), enabled: !!j });
  const numbers = useQuery({ ...tpsLiveQuery(jobId), enabled: live, refetchInterval: live ? 800 : false });
  const [filter, setFilter] = useState<RowFilter>('all');
  const [page, setPage] = useState(0);
  const [, tick] = useState(0);
  const tableRef = useRef<HTMLDivElement>(null);

  // the moment a check finishes: reload the final rows, credits and history
  const wasLive = useRef<boolean | null>(null);
  useEffect(() => {
    if (!j) return;
    if (wasLive.current === true && j.finished_at) {
      void qc.invalidateQueries({ queryKey: ['tps-results', jobId] });
      void qc.invalidateQueries({ queryKey: ['tps-credits', workspace.id] });
      void qc.invalidateQueries({ queryKey: ['tps-jobs', workspace.id] });
      track('tps_check_finished', { status: j.status, rows: j.total_rows });
    }
    wasLive.current = !j.finished_at;
  }, [j, jobId, qc, workspace.id]);
  // keep the time-left estimate moving between polls
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => tick((x) => x + 1), 1000);
    return () => window.clearInterval(t);
  }, [live]);

  const cancel = useMutation({
    mutationFn: async () => {
      const { error } = await supabase().rpc('tps_cancel_job', { p_job_id: jobId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tps-job', jobId] }),
    onError: () => toast('That check could not be cancelled. Try again.'),
  });

  const rows = useMemo(() => {
    const base = results.data ?? [];
    if (!numbers.data) return base;
    const state = new Map(numbers.data.map((x) => [x.e164, x]));
    return base.map((r) => {
      const s = r.e164 ? state.get(r.e164) : undefined;
      return s && r.outcome === 'pending' ? { ...r, outcome: numberOutcome(s), checked_at: s.checked_at } : r;
    });
  }, [results.data, numbers.data, live]);

  // results show once the check has finished and every row has its final answer
  const ready = !!j?.finished_at && !!results.data && !results.isFetching && !rows.some((r) => r.outcome === 'pending');

  const wasReady = useRef<boolean | null>(null);
  useEffect(() => {
    const fresh = wasReady.current === false || (wasReady.current === null && !!j?.finished_at && Date.now() - new Date(j.finished_at).getTime() < 4000);
    if (ready && fresh && j?.status === 'done') {
      const r = tableRef.current?.getBoundingClientRect();
      confetti(r ? { x: r.left + r.width / 2, y: r.top + 24 } : undefined);
      const w = window as unknown as { __tpsConfetti?: number };
      w.__tpsConfetti = (w.__tpsConfetti ?? 0) + 1;
    }
    if (j) wasReady.current = ready;
  }, [ready, j]);

  if (job.isLoading) {
    return (
      <section className="rounded-md border border-white-800 p-5" aria-busy>
        <span className="skeleton block h-4 w-48" />
        <span className="skeleton mt-4 block h-2.5 w-full" />
      </section>
    );
  }
  if (!j) {
    return (
      <section className="rounded-md border border-white-800 p-5">
        <p className="text-black-700">That check is no longer available.</p>
        <Button className="mt-3" size="compact" onClick={onClose}>
          Check a file
        </Button>
      </section>
    );
  }

  const counts = rowCounts(j);
  const dnc = counts.tps + counts.ctps + counts.both;
  const shown = ready ? rows.filter((r) => matchesFilter(r.outcome, filter)) : rows;
  const PAGE = 50;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const slice = shown.slice(page * PAGE, page * PAGE + PAGE);
  const others = j.headers.map((h, i) => ({ h, i })).filter((c) => c.i !== j.phone_column);
  const COL = 170;
  const tableWidth = 56 + 160 + 170 + others.length * COL + 130 + 130 + 120;
  const span = 6 + others.length;
  const pin = 'sticky z-[1] bg-white-100';
  const filters: { id: RowFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All rows', count: j.total_rows },
    { id: 'callable', label: 'Valid', count: counts.valid },
    { id: 'dnc', label: 'Do not call', count: dnc },
    { id: 'other', label: 'Other', count: j.total_rows - counts.valid - dnc },
  ];
  const pct = j.numbers_total ? Math.max(4, Math.round((j.numbers_done / j.numbers_total) * 100)) : 100;

  async function exportAs(ext: ExportFormat) {
    if (!j) return;
    const data = results.data?.length ? rows : await qc.fetchQuery(tpsResultsQuery(j.id));
    if (!data.filter((r) => matchesFilter(r.outcome, filter)).length) return toast('No rows to export with this filter.');
    await downloadChecked(j, data, filter, ext);
    track('tps_download', { ext, filter });
  }

  return (
    <section className="ai-pop overflow-hidden rounded-md border border-white-800" aria-label={live ? 'Check in progress' : 'Check results'} data-testid="tps-job">
      <header className="flex flex-wrap items-center gap-3 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate font-medium text-black-400">{j.file_name}</span>
            <StatusTag job={j} />
          </p>
          <p className="mt-0.5 text-black-700" aria-live="polite">
            {live
              ? j.status === 'cancelled'
                ? 'Stopping after the numbers already in progress…'
                : `Checking ${n(j.numbers_done)} of ${plural(j.numbers_total, 'number')}, ${eta(j)}`
              : j.status === 'failed'
                ? failureText(j)
                : `${plural(j.total_rows, 'row')} · ${plural(j.headers.length, 'column')} · ${plural(j.numbers_total, 'unique UK number')} · ${plural(creditsUsed(j), 'credit')} used${j.numbers_reused ? ` · ${n(j.numbers_reused)} reused free` : ''}${j.credits_refunded ? ` · ${n(j.credits_refunded)} refunded` : ''}`}
          </p>
        </div>
        {live && j.status === 'running' ? (
          <Button variant="ghost" size="compact" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            <X size={14} /> Cancel
          </Button>
        ) : ready ? (
          <div className="ai-pop flex items-center gap-2">
            <ExportMenu note={`${FILTER_NOTE[filter]} · ${plural(filters.find((f) => f.id === filter)?.count ?? 0, 'row')}`} disabled={!results.data} onExport={(ext) => void exportAs(ext)} />
            <Button size="compact" onClick={onClose}>
              <UploadSimple size={14} /> Check another file
            </Button>
          </div>
        ) : null}
      </header>

      {ready ? (
        <div className="ai-pop flex flex-wrap gap-1.5 px-5 pb-3" role="radiogroup" aria-label="Show rows">
          {filters.map((f) => (
            <button
              key={f.id}
              role="radio"
              aria-checked={filter === f.id}
              onClick={() => {
                setFilter(f.id);
                setPage(0);
              }}
              className={cn(
                'flex h-7 items-center gap-1.5 rounded-sm border px-2.5 transition-colors',
                filter === f.id ? 'border-[#c4d1f2] bg-[#f2f5fe] text-[#3653a3]' : 'border-white-800 text-black-700 hover:border-white-900 hover:text-black-400',
              )}
            >
              {f.label} <span className="tabular-nums opacity-70">{n(f.count)}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div ref={tableRef} className="relative border-t border-white-800">
        {/* the one progress bar, along the top of the table */}
        <div
          className={cn('absolute inset-x-0 top-0 z-[1] h-[3px] overflow-hidden bg-[#edf2fd] transition-opacity duration-500', !ready ? 'opacity-100' : 'pointer-events-none opacity-0')}
          role="progressbar"
          aria-label="Check progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={live ? pct : 100}
        >
          <div className="relative h-full overflow-hidden rounded-r-full transition-[width] duration-500 ease-[cubic-bezier(0.2,0,0,1)]" style={{ width: `${live ? pct : 100}%` }}>
            <span className="tps-stripes-fill" />
          </div>
        </div>
        <div className="overflow-x-auto">
          {/* every column of the file scrolls sideways; row, phone and status stay pinned on the left */}
          <table className="table-fixed border-separate border-spacing-0" style={{ width: tableWidth, minWidth: '100%' }} data-testid="tps-results">
            <colgroup>
              <col style={{ width: 56 }} />
              <col style={{ width: 160 }} />
              <col style={{ width: 170 }} />
              {others.map((c) => (
                <col key={c.i} style={{ width: COL }} />
              ))}
              <col style={{ width: 130 }} />
              <col style={{ width: 130 }} />
              <col style={{ width: 120 }} />
            </colgroup>
            <thead>
              <tr className="text-left text-black-700 [&>th]:border-b [&>th]:border-white-800 [&>th]:py-2 [&>th]:font-normal">
                <th className={cn(pin, 'left-0 pl-5 pr-2')}>Row</th>
                <th className={cn(pin, 'left-[56px] truncate px-3')} title={j.headers[j.phone_column]}>
                  {j.headers[j.phone_column]}
                </th>
                <th className={cn(pin, 'left-[216px] border-r px-3')}>TPS status</th>
                {others.map((c) => (
                  <th key={c.i} title={c.h} className="truncate px-3">
                    {c.h}
                  </th>
                ))}
                <th className="px-3">TPS registered</th>
                <th className="px-3">CTPS registered</th>
                <th className="px-3">Checked on</th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0 [&>tr>td]:border-b [&>tr>td]:border-white-800">
              {results.isLoading
                ? Array.from({ length: 5 }, (_, i) => (
                    <tr key={i}>
                      <td colSpan={span} className="px-5 py-2.5">
                        <span className="skeleton block h-3.5 w-[420px]" />
                      </td>
                    </tr>
                  ))
                : slice.map((r) => (
                    <tr key={r.row_no}>
                      <td className={cn(pin, 'left-0 py-2 pl-5 pr-2 tabular-nums text-black-700')}>{r.row_no + 2}</td>
                      <td className={cn(pin, 'left-[56px] truncate px-3 py-2 tabular-nums text-black-400')} title={r.phone_raw}>
                        {r.phone_raw || <span className="text-white-900">Blank</span>}
                      </td>
                      <td className={cn(pin, 'left-[216px] border-r px-3 py-2')}>
                        {r.outcome === 'pending' ? (
                          <span className="tag tag-1">
                            <span className="tps-pulse h-1.5 w-1.5 rounded-full" style={{ background: BLUE }} /> Checking
                          </span>
                        ) : (
                          <span key={r.outcome} className="tps-in inline-flex">
                            <OutcomeTag outcome={r.outcome} />
                          </span>
                        )}
                      </td>
                      {others.map((c) => (
                        <td key={c.i} title={r.cells[c.i] ?? ''} className="truncate px-3 py-2 text-black-700">
                          {r.cells[c.i]}
                        </td>
                      ))}
                      <td className="px-3 py-2 tabular-nums text-black-700">{r.tps_since ? new Date(r.tps_since).toLocaleDateString('en-GB') : ''}</td>
                      <td className="px-3 py-2 tabular-nums text-black-700">{r.ctps_since ? new Date(r.ctps_since).toLocaleDateString('en-GB') : ''}</td>
                      <td className="px-3 py-2 tabular-nums text-black-700">{r.checked_at ? new Date(r.checked_at).toLocaleDateString('en-GB') : ''}</td>
                    </tr>
                  ))}
              {results.data && !shown.length ? (
                <tr>
                  <td colSpan={span} className="px-5 py-6 text-black-700">
                    {rows.length ? 'No rows match this filter.' : 'The uploaded rows for this check have been deleted (files are kept for 90 days).'}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
      {pages > 1 ? (
        <div className="flex items-center justify-end gap-2 border-t border-white-800 px-5 py-2 text-black-700">
          <span className="tabular-nums">
            {n(page * PAGE + 1)}–{n(Math.min((page + 1) * PAGE, shown.length))} of {n(shown.length)}
          </span>
          <Button variant="ghost" size="icon-compact" aria-label="Previous page" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            <CaretLeft size={14} />
          </Button>
          <Button variant="ghost" size="icon-compact" aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}>
            <CaretRight size={14} />
          </Button>
        </div>
      ) : null}
    </section>
  );
}

// ---- history ---------------------------------------------------------------------------------
function History({ jobs, activeId, onOpen }: { jobs: TpsJob[]; activeId: string | null; onOpen: (id: string) => void }) {
  const { workspace } = useApp();
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const toast = useToast();

  async function quick(job: TpsJob, filter: RowFilter, ext: ExportFormat) {
    try {
      const rows = await qc.fetchQuery(tpsResultsQuery(job.id));
      if (!rows.length) return toast('The rows for this check have been deleted.');
      await downloadChecked(job, rows, filter, ext);
    } catch {
      toast('That download did not work. Try again.');
    }
  }
  async function remove(job: TpsJob) {
    const { error } = await supabase().rpc('tps_delete_job', { p_job_id: job.id });
    if (error) return toast('That check could not be deleted.');
    qc.setQueryData<TpsJob[]>(['tps-jobs', workspace.id], (list) => (list ?? []).filter((x) => x.id !== job.id));
    toast('Check deleted, including the uploaded rows.');
  }

  return (
    <section className="mt-10 overflow-hidden rounded-md border border-white-800" aria-label="Recent checks">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <ClockCounterClockwise size={16} weight="duotone" style={{ color: BLUE }} />
        <span className="font-medium text-black-400">Recent checks</span>
        {jobs.length ? <span className="tabular-nums text-black-700">{n(jobs.length)}</span> : null}
        {jobs.some(isLive) ? (
          <span className="tag tag-1">
            <span className="tps-pulse h-1.5 w-1.5 rounded-full" style={{ background: BLUE }} /> Checking
          </span>
        ) : null}
        <CaretRight size={14} className={cn('ml-auto text-black-700 transition-transform duration-150', open && 'rotate-90')} />
      </button>
      {!open ? null : jobs.length === 0 ? (
        <p className="ai-pop border-t border-white-800 px-4 py-6 text-center text-black-700">Your checked files will appear here, ready to download again.</p>
      ) : (
        <div className="ai-pop overflow-x-auto border-t border-white-800">
          <table className="w-full min-w-[820px] table-fixed border-collapse" data-testid="tps-history">
            <thead>
              <tr className="border-b border-white-800 text-left text-black-700">
                <th className="px-4 py-2 font-normal">File</th>
                <th className="w-[140px] px-3 py-2 font-normal">Checked</th>
                <th className="w-[300px] px-3 py-2 font-normal">Result</th>
                <th className="w-[80px] px-3 py-2 text-right font-normal">Credits</th>
                <th className="w-[120px] px-3 py-2 font-normal">Status</th>
                <th className="w-12 px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const c = rowCounts(job);
                const dnc = c.tps + c.ctps + c.both;
                return (
                  <tr
                    key={job.id}
                    onClick={() => onOpen(job.id)}
                    className={cn('cursor-pointer border-b border-white-800 transition-colors last:border-0 hover:bg-white-200', activeId === job.id && 'bg-[#f7f9fe]')}
                  >
                    <td className="px-4 py-2.5">
                      <p className="truncate text-black-400">{job.file_name}</p>
                      <p className="tabular-nums text-black-700">{plural(job.total_rows, 'row')}</p>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-black-700">{timeAgo(job.created_at)}</td>
                    <td className="px-3 py-2.5">
                      {isLive(job) ? (
                        <span className="text-black-700">Checking…</span>
                      ) : (
                        <p className="flex items-center gap-3 truncate tabular-nums text-black-700">
                          <span className="flex items-center gap-1.5">
                            <Dot outcome="valid" /> {n(c.valid)} valid
                          </span>
                          <span className="flex items-center gap-1.5">
                            <Dot outcome="tps" /> {n(dnc)} do not call
                          </span>
                          {c.not_uk + c.invalid + c.missing + c.unchecked ? (
                            <span className="flex items-center gap-1.5">
                              <Dot outcome="invalid" /> {n(c.not_uk + c.invalid + c.missing + c.unchecked)} other
                            </span>
                          ) : null}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-black-700">{n(isLive(job) ? job.credits_reserved : creditsUsed(job))}</td>
                    <td className="px-3 py-2.5">
                      <StatusTag job={job} />
                    </td>
                    <td className="px-2 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Popover
                        align="right"
                        trigger={({ toggle }) => (
                          <button onClick={toggle} aria-label={`Actions for ${job.file_name}`} className="flex h-7 w-7 items-center justify-center rounded-sm text-black-700 hover:bg-white-300 hover:text-black-400">
                            <DotsThree size={18} weight="bold" />
                          </button>
                        )}
                      >
                        {(close) => (
                          <div className="w-[230px] p-1">
                            {job.finished_at ? (
                              <>
                                {FORMATS.map((f) => (
                                  <MenuItem key={f.ext} onClick={() => (close(), void quick(job, 'all', f.ext))}>
                                    <f.icon size={15} className="text-black-700" /> {f.label}
                                  </MenuItem>
                                ))}
                                <div className="my-1 border-t border-white-800" />
                                <MenuItem onClick={() => (close(), void quick(job, 'callable', 'csv'))}>
                                  <DownloadSimple size={15} className="text-black-700" /> Valid rows only (CSV)
                                </MenuItem>
                                <MenuItem onClick={() => (close(), void quick(job, 'dnc', 'csv'))}>
                                  <DownloadSimple size={15} className="text-black-700" /> Do-not-call rows only (CSV)
                                </MenuItem>
                                <div className="my-1 border-t border-white-800" />
                                <MenuItem danger onClick={() => (close(), void remove(job))}>
                                  <Trash size={15} /> Delete check and rows
                                </MenuItem>
                              </>
                            ) : (
                              <MenuItem onClick={() => (close(), onOpen(job.id))}>
                                <ArrowCounterClockwise size={15} /> Watch progress
                              </MenuItem>
                            )}
                          </div>
                        )}
                      </Popover>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ---- page -----------------------------------------------------------------------------------------
export function TpsChecks() {
  const { workspace } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const jobs = useQuery({ ...tpsJobsQuery(workspace.id), refetchInterval: (q) => (q.state.data?.some(isLive) ? 1500 : false) });
  const [file, setFile] = useState<ParsedFile | null>(null);
  const activeId = search.get('job');

  const open = (id: string | null) => {
    setFile(null);
    router.replace(id ? `${pathname}?job=${id}` : pathname, { scroll: false });
  };

  return (
    <div className="h-full overflow-y-auto bg-white-100">
      <div className="mx-auto w-full max-w-[1040px] px-6 pb-20 pt-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-md" style={{ background: '#f1f5fd' }}>
                <ShieldCheck size={17} weight="duotone" style={{ color: BLUE }} />
              </span>
              <h1 className="t-h2">TPS/CTPS checks</h1>
            </div>
            <p className="mt-2 max-w-[600px] text-black-700">Upload a list and Decibel checks every UK number against the TPS and CTPS registers, then gives you the file back with a status for each row: valid, or do not call.</p>
          </div>
          <CreditsBadge />
        </div>

        <div className="mt-6">
          {activeId ? (
            <JobPanel key={activeId} jobId={activeId} onClose={() => open(null)} />
          ) : file ? (
            <Prepare file={file} onCancel={() => setFile(null)} onStarted={(id) => open(id)} />
          ) : (
            <Dropzone onFile={setFile} />
          )}
        </div>

        <History jobs={jobs.data ?? []} activeId={activeId} onOpen={(id) => open(id)} />
      </div>
    </div>
  );
}


'use client';
// TPS/CTPS checks: upload a list (up to 1,000 rows), Decibel checks every UK number against the
// TPS and CTPS registers and gives the file back with a status column. Credits, outcomes and the
// checking itself live in the database and the tps-check worker (migration 0023); this page
// parses the file, shows the exact cost, follows the check live and offers the downloads.
import {
  ArrowCounterClockwise,
  CaretLeft,
  CaretRight,
  Coins,
  DotsThree,
  DownloadSimple,
  FileCsv,
  FileXls,
  Info,
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
  BAR_ORDER,
  creditsUsed,
  detectPhoneColumn,
  downloadChecked,
  explainError,
  fetchQuote,
  isLive,
  latestOutcome,
  matchesFilter,
  MAX_ROWS,
  OUTCOMES,
  prettyUk,
  readFile,
  rowCounts,
  TOP_UP_MESSAGE,
  tpsCreditsQuery,
  tpsJobQuery,
  tpsJobsQuery,
  tpsLatestQuery,
  tpsResultsQuery,
  WELCOME_TPS_CREDITS,
  type Outcome,
  type ParsedFile,
  type RowFilter,
  type TpsJob,
} from '@/lib/tps';
import { cn, timeAgo } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MenuItem, Popover, useToast } from '@/components/ui/overlay';
import { openSupport } from '@/components/app/support-widget';

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

/** The pastel segmented bar: one segment per outcome, with the unchecked part striped and moving. */
function ResultBar({ job, height = 10 }: { job: TpsJob; height?: number }) {
  const counts = rowCounts(job);
  const live = isLive(job);
  return (
    <div
      className="flex w-full gap-[2px] overflow-hidden rounded-full bg-white-300"
      style={{ height }}
      role="progressbar"
      aria-label="Check progress"
      aria-valuemin={0}
      aria-valuemax={job.total_rows}
      aria-valuenow={job.total_rows - counts.pending}
    >
      {BAR_ORDER.map((o) =>
        counts[o] ? (
          <span key={o} title={`${OUTCOMES[o].label}: ${n(counts[o])}`} className="h-full transition-[flex-grow] duration-500 ease-[cubic-bezier(0.2,0,0,1)]" style={{ flexGrow: counts[o], flexBasis: 0, background: OUTCOMES[o].bar }} />
        ) : null,
      )}
      {counts.pending ? (
        <span className="relative h-full overflow-hidden transition-[flex-grow] duration-500" style={{ flexGrow: counts.pending, flexBasis: 0 }}>
          {live ? <span className="tps-stripes" /> : <span className="absolute inset-0 bg-white-300" />}
        </span>
      ) : null}
    </div>
  );
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
  if (job.status === 'done') return <span className="tag tag-0">Done</span>;
  if (job.status === 'cancelled') return <span className="tag tag-7">Cancelled</span>;
  return <span className="tag tag-3">Stopped</span>;
}

// ---- credits -------------------------------------------------------------------------
function CreditsCard() {
  const { workspace } = useApp();
  const credits = useQuery(tpsCreditsQuery(workspace.id));
  const left = credits.data?.balance ?? 0;
  const total = Math.max(credits.data?.granted ?? WELCOME_TPS_CREDITS, left, 1);
  const pct = Math.max(0, Math.min(100, (left / total) * 100));
  const tone = left <= 0 || pct < 5 ? { fill: '#e8a593', track: '#fbeee9' } : pct < 20 ? { fill: '#e2bf6f', track: '#faf3e3' } : { fill: '#8fb0ee', track: '#edf2fd' };
  return (
    <section className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-md border border-white-800 px-4 py-3.5" aria-label="Check credits">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md" style={{ background: '#f1f5fd' }}>
        <Coins size={16} weight="duotone" style={{ color: BLUE }} />
      </span>
      <div className="min-w-[220px] flex-1">
        <p className="flex items-baseline justify-between gap-3">
          <span className="font-medium text-black-400">Check credits</span>
          <span className="tabular-nums text-black-700" data-testid="tps-credits">
            {credits.isLoading ? '…' : (
              <>
                <span className="font-medium text-black-400">{n(left)}</span> of {n(total)} left
              </>
            )}
          </span>
        </p>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full" style={{ background: tone.track }}>
          <span className="block h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.2,0,0,1)]" style={{ width: `${pct}%`, background: tone.fill }} />
        </span>
        <p className="mt-1.5 text-black-700">1 credit per unique UK number. Duplicates, blanks, invalid and non-UK numbers are free, and a number you checked in the last 28 days is free to check again.</p>
      </div>
      <Button size="compact" onClick={topUp}>
        <Coins size={14} /> Top up
      </Button>
    </section>
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

  const others = file.headers.map((h, i) => ({ h, i })).filter((c) => c.i !== column).slice(0, 3);
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
          <label className="flex flex-wrap items-center gap-2">
            <span className="text-black-700">Phone numbers are in</span>
            <select
              value={column}
              onChange={(e) => {
                setColumn(Number(e.target.value));
                setError(null);
              }}
              aria-label="Phone number column"
              className="h-8 max-w-[260px] rounded-sm border border-btnborder bg-white-100 px-2 font-medium text-black-400 hover:border-white-900 focus:border-[#9db4ec] focus:outline-none"
            >
              {column < 0 ? <option value={-1}>Choose a column</option> : null}
              {file.headers.map((h, i) => (
                <option key={i} value={i}>
                  {h}
                </option>
              ))}
            </select>
          </label>

          <div className="mt-4 overflow-x-auto rounded-md border border-white-800">
            <table className="w-full min-w-[480px] table-fixed border-collapse">
              <thead>
                <tr className="border-b border-white-800 text-left text-black-700">
                  <th className="w-10 px-3 py-2 font-normal">#</th>
                  {column >= 0 ? <th className="w-[170px] bg-[#f7f9fe] px-3 py-2 font-medium text-[#3653a3]">{file.headers[column]}</th> : null}
                  {others.map((c) => (
                    <th key={c.i} className="truncate px-3 py-2 font-normal">
                      {c.h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((r, ri) => (
                  <tr key={ri} className="border-b border-white-800 last:border-0">
                    <td className="px-3 py-2 tabular-nums text-black-700">{ri + 1}</td>
                    {column >= 0 ? <td className="truncate bg-[#f7f9fe] px-3 py-2 tabular-nums text-black-400">{r[column] || <span className="text-white-900">Blank</span>}</td> : null}
                    {others.map((c) => (
                      <td key={c.i} className="truncate px-3 py-2 text-black-700">
                        {r[c.i]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {file.rows.length > preview.length ? <p className="mt-2 text-black-700">Showing the first 5 of {plural(file.rows.length, 'row')}.</p> : null}
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

function QuoteLine({ dot, label, value, strong }: { dot: string; label: string; value: number; strong?: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: dot }} aria-hidden />
      <span className={cn('flex-1', strong ? 'text-black-400' : 'text-black-700')}>{label}</span>
      <span className={cn('tabular-nums', strong ? 'font-medium text-black-400' : 'text-black-700')}>{n(value)}</span>
    </li>
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
  if (!left) return 'Finishing…';
  if (live < 3 || elapsed < 2) return 'Working out the time left…';
  const secs = Math.ceil((left / live) * elapsed);
  return secs < 60 ? `About ${secs}s left` : `About ${Math.ceil(secs / 60)} min left`;
}

function JobPanel({ jobId, onClose }: { jobId: string; onClose: () => void }) {
  const { workspace } = useApp();
  const qc = useQueryClient();
  const toast = useToast();
  const job = useQuery({ ...tpsJobQuery(jobId), refetchInterval: (q) => (q.state.data && !q.state.data.finished_at ? 700 : false) });
  const j = job.data;
  const live = isLive(j);
  const latest = useQuery({ ...tpsLatestQuery(jobId), enabled: live, refetchInterval: live ? 900 : false });
  const results = useQuery({ ...tpsResultsQuery(jobId), enabled: !!j?.finished_at });
  const [filter, setFilter] = useState<RowFilter>('all');
  const [page, setPage] = useState(0);
  const [, tick] = useState(0);

  // settle: refresh credits and history the moment a check finishes
  const wasLive = useRef(live);
  useEffect(() => {
    if (wasLive.current && j?.finished_at) {
      void qc.invalidateQueries({ queryKey: ['tps-credits', workspace.id] });
      void qc.invalidateQueries({ queryKey: ['tps-jobs', workspace.id] });
      track('tps_check_finished', { status: j.status, rows: j.total_rows });
    }
    wasLive.current = live;
  }, [live, j?.finished_at, j?.status, j?.total_rows, qc, workspace.id]);
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
  const rows = results.data ?? [];
  const shown = rows.filter((r) => matchesFilter(r.outcome, filter));
  const PAGE = 50;
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const slice = shown.slice(page * PAGE, page * PAGE + PAGE);
  const others = j.headers.map((h, i) => ({ h, i })).filter((c) => c.i !== j.phone_column).slice(0, 4);
  const filters: { id: RowFilter; label: string; count: number }[] = [
    { id: 'all', label: 'All rows', count: j.total_rows },
    { id: 'callable', label: 'Valid', count: counts.valid },
    { id: 'dnc', label: 'Do not call', count: dnc },
    { id: 'other', label: 'Other', count: j.total_rows - counts.valid - dnc },
  ];
  const tiles: { o: Outcome; count: number; label?: string }[] = [
    { o: 'valid', count: counts.valid },
    { o: 'tps', count: counts.tps },
    { o: 'ctps', count: counts.ctps },
    { o: 'both', count: counts.both },
    { o: 'not_uk', count: counts.not_uk },
    { o: 'invalid', count: counts.invalid + counts.missing + counts.unchecked, label: 'Invalid or blank' },
  ];

  async function download(ext: 'csv' | 'xlsx') {
    if (!j) return;
    const data = rows.length ? rows : await qc.fetchQuery(tpsResultsQuery(j.id));
    await downloadChecked(j, data, filter, ext);
    track('tps_download', { ext, filter });
  }

  return (
    <section className="ai-pop overflow-hidden rounded-md border border-white-800" aria-label={live ? 'Check in progress' : 'Check results'} data-testid="tps-job">
      <header className="flex flex-wrap items-center gap-3 px-5 pb-1 pt-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2">
            <span className="truncate font-medium text-black-400">{j.file_name}</span>
            <StatusTag job={j} />
          </p>
          <p className="mt-0.5 text-black-700" aria-live="polite">
            {live
              ? j.status === 'cancelled'
                ? 'Stopping after the numbers already in progress…'
                : `Checked ${n(j.numbers_done)} of ${plural(j.numbers_total, 'number')} · ${eta(j)}`
              : j.status === 'failed'
                ? failureText(j)
                : `${plural(j.total_rows, 'row')} · ${plural(j.numbers_total, 'unique UK number')} · ${plural(creditsUsed(j), 'credit')} used${j.numbers_reused ? ` · ${n(j.numbers_reused)} reused free` : ''}${j.credits_refunded ? ` · ${n(j.credits_refunded)} refunded` : ''} · ${timeAgo(j.finished_at)}`}
          </p>
        </div>
        {live && j.status === 'running' ? (
          <Button variant="ghost" size="compact" loading={cancel.isPending} onClick={() => cancel.mutate()}>
            <X size={14} /> Cancel
          </Button>
        ) : !live ? (
          <Button size="compact" onClick={onClose}>
            <UploadSimple size={14} /> Check another file
          </Button>
        ) : null}
      </header>

      <div className="px-5 pb-5 pt-3">
        <ResultBar job={j} height={12} />
        <div className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-white-800 bg-white-800 sm:grid-cols-3 lg:grid-cols-6">
          {tiles.map((t) => (
            <div key={t.o} className="bg-white-100 px-3.5 py-3" title={OUTCOMES[t.o].hint}>
              <p className="flex items-center gap-1.5 text-black-700">
                <Dot outcome={t.o} />
                <span className="truncate">{t.label ?? OUTCOMES[t.o].label}</span>
              </p>
              <p className="t-h3 mt-1 tabular-nums">{n(t.count)}</p>
              <p className="tabular-nums text-black-700">{j.total_rows ? `${Math.round((t.count / j.total_rows) * 100)}%` : '0%'}</p>
            </div>
          ))}
        </div>

        {live ? (
          <div className="mt-4">
            <p className="text-black-700">Latest answers</p>
            <ul className="mt-2 divide-y divide-white-800 rounded-md border border-white-800" aria-live="polite">
              {(latest.data ?? []).length === 0 ? (
                <li className="flex h-9 items-center gap-2 px-3 text-black-700">
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white-800" style={{ borderTopColor: BLUE }} /> Asking the TPS and CTPS registers…
                </li>
              ) : (
                (latest.data ?? []).map((x) => (
                  <li key={x.e164} className="tps-in flex h-9 items-center gap-3 px-3">
                    <span className="w-[130px] tabular-nums text-black-400">{prettyUk(x.e164)}</span>
                    <OutcomeTag outcome={latestOutcome(x)} />
                    {x.reused ? <span className="text-black-700">checked recently, free</span> : null}
                    <span className="ml-auto tabular-nums text-black-700">{x.checked_at ? new Date(x.checked_at).toLocaleTimeString('en-GB') : ''}</span>
                  </li>
                ))
              )}
            </ul>
          </div>
        ) : (
          <div className="mt-5">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Show rows">
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
              <div className="ml-auto flex gap-2">
                <Button size="compact" onClick={() => void download('csv')} disabled={!shown.length && !!results.data}>
                  <DownloadSimple size={14} /> CSV
                </Button>
                <Button size="compact" onClick={() => void download('xlsx')} disabled={!shown.length && !!results.data}>
                  <DownloadSimple size={14} /> Excel
                </Button>
              </div>
            </div>

            <div className="mt-3 overflow-x-auto rounded-md border border-white-800">
              <table className="w-full min-w-[760px] table-fixed border-collapse" data-testid="tps-results">
                <thead>
                  <tr className="border-b border-white-800 text-left text-black-700">
                    <th className="w-12 px-3 py-2 font-normal">Row</th>
                    <th className="w-[150px] px-3 py-2 font-normal">{j.headers[j.phone_column]}</th>
                    <th className="w-[150px] px-3 py-2 font-normal">TPS status</th>
                    <th className="w-[110px] px-3 py-2 font-normal">Checked on</th>
                    {others.map((c) => (
                      <th key={c.i} className="truncate px-3 py-2 font-normal">
                        {c.h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.isLoading
                    ? Array.from({ length: 5 }, (_, i) => (
                        <tr key={i} className="border-b border-white-800">
                          <td colSpan={4 + others.length} className="px-3 py-2.5">
                            <span className="skeleton block h-3.5 w-2/3" />
                          </td>
                        </tr>
                      ))
                    : slice.map((r) => (
                        <tr key={r.row_no} className="border-b border-white-800 last:border-0">
                          <td className="px-3 py-2 tabular-nums text-black-700">{r.row_no + 2}</td>
                          <td className="truncate px-3 py-2 tabular-nums text-black-400">{r.phone_raw || <span className="text-white-900">Blank</span>}</td>
                          <td className="px-3 py-2">
                            <OutcomeTag outcome={r.outcome} />
                          </td>
                          <td className="px-3 py-2 tabular-nums text-black-700">{r.checked_at ? new Date(r.checked_at).toLocaleDateString('en-GB') : ''}</td>
                          {others.map((c) => (
                            <td key={c.i} className="truncate px-3 py-2 text-black-700">
                              {r.cells[c.i]}
                            </td>
                          ))}
                        </tr>
                      ))}
                  {results.data && !shown.length ? (
                    <tr>
                      <td colSpan={4 + others.length} className="px-3 py-6 text-center text-black-700">
                        {rows.length ? 'No rows match this filter.' : 'The uploaded rows for this check have been deleted (files are kept for 90 days).'}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
            {pages > 1 ? (
              <div className="mt-2 flex items-center justify-end gap-2 text-black-700">
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
            <p className="mt-2 text-black-700">Row numbers match your spreadsheet (row 1 is the header). Downloads add TPS status, TPS registered, CTPS registered and Checked on columns to your original file.</p>
          </div>
        )}
      </div>
    </section>
  );
}

// ---- history ---------------------------------------------------------------------------------
function History({ jobs, activeId, onOpen }: { jobs: TpsJob[]; activeId: string | null; onOpen: (id: string) => void }) {
  const { workspace } = useApp();
  const qc = useQueryClient();
  const toast = useToast();

  async function quick(job: TpsJob, filter: RowFilter, ext: 'csv' | 'xlsx') {
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
    <section className="mt-10" aria-label="Recent checks">
      <h2 className="font-medium text-black-400">Recent checks</h2>
      {jobs.length === 0 ? (
        <p className="mt-2 rounded-md border border-dashed border-white-800 px-4 py-6 text-center text-black-700">Your checked files will appear here, ready to download again.</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-md border border-white-800">
          <table className="w-full min-w-[820px] table-fixed border-collapse" data-testid="tps-history">
            <thead>
              <tr className="border-b border-white-800 text-left text-black-700">
                <th className="px-4 py-2 font-normal">File</th>
                <th className="w-[110px] px-3 py-2 font-normal">Checked</th>
                <th className="w-[260px] px-3 py-2 font-normal">Result</th>
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
                    <td className="px-3 py-2.5 text-black-700">{timeAgo(job.created_at)}</td>
                    <td className="px-3 py-2.5">
                      <ResultBar job={job} height={6} />
                      <p className="mt-1 truncate tabular-nums text-black-700">
                        {n(c.valid)} valid · {n(dnc)} do not call
                        {c.not_uk + c.invalid + c.missing + c.unchecked ? ` · ${n(c.not_uk + c.invalid + c.missing + c.unchecked)} other` : ''}
                      </p>
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
                                <MenuItem onClick={() => (close(), void quick(job, 'all', 'csv'))}>
                                  <FileCsv size={15} /> Checked file (CSV)
                                </MenuItem>
                                <MenuItem onClick={() => (close(), void quick(job, 'all', 'xlsx'))}>
                                  <FileXls size={15} /> Checked file (Excel)
                                </MenuItem>
                                <MenuItem onClick={() => (close(), void quick(job, 'callable', 'csv'))}>
                                  <DownloadSimple size={15} /> Valid numbers only
                                </MenuItem>
                                <MenuItem onClick={() => (close(), void quick(job, 'dnc', 'csv'))}>
                                  <DownloadSimple size={15} /> Do-not-call numbers only
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

// ---- how it works -----------------------------------------------------------------------------
function HowItWorks() {
  const [open, setOpen] = useState(false);
  return (
    <section className="mt-10 rounded-md border border-white-800" aria-label="How TPS/CTPS checks work">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-2.5 px-4 py-3 text-left">
        <Info size={16} weight="duotone" style={{ color: BLUE }} />
        <span className="flex-1 font-medium text-black-400">How TPS/CTPS checks work</span>
        <CaretRight size={14} className={cn('text-black-700 transition-transform duration-150', open && 'rotate-90')} />
      </button>
      {open ? (
        <div className="ai-pop grid gap-6 border-t border-white-800 px-4 py-4 md:grid-cols-2">
          <div className="space-y-3 text-black-700">
            <p>
              <span className="font-medium text-black-400">What it checks.</span> The Telephone Preference Service (TPS) lists people and sole traders who have opted out of sales calls. The Corporate TPS (CTPS) lists companies that have. UK law (PECR) says you must not make unsolicited sales calls to numbers on either register, so screen your lists before you call.
            </p>
            <p>
              <span className="font-medium text-black-400">Keep it fresh.</span> The registers change daily, and a check is generally treated as good for 28 days. Each result shows the date it was checked; check a list again before you call it after that.
            </p>
            <p>
              <span className="font-medium text-black-400">Your file.</span> Upload a CSV, XLSX, TSV or TXT file with a header row and up to 1,000 rows, choose the column with the phone numbers, and you get the same file back with TPS status, TPS registered, CTPS registered and Checked on columns. Numbers can be written any common way: 07…, +44 7…, 0044…, with spaces or brackets.
            </p>
            <p>
              <span className="font-medium text-black-400">Credits.</span> Every account starts with 2,500 check credits, separate from your data credits. A check uses 1 credit per unique UK number. Duplicates are checked once, numbers you checked in the last 28 days are free and keep their original date, and anything that could not be checked is refunded automatically. Need more? Use Top up.
            </p>
            <p>
              <span className="font-medium text-black-400">Privacy.</span> Uploaded files are only visible to your workspace and are deleted after 90 days. You can delete any check sooner from its menu in Recent checks.
            </p>
          </div>
          <ul className="space-y-2.5">
            {(['valid', 'tps', 'ctps', 'both', 'invalid', 'not_uk', 'missing', 'unchecked'] as Outcome[]).map((o) => (
              <li key={o} className="flex items-start gap-3">
                <span className="w-[136px] shrink-0">
                  <OutcomeTag outcome={o} />
                </span>
                <span className="text-black-700">
                  {OUTCOMES[o].hint} <span className="text-white-900">In the file: {OUTCOMES[o].file}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
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
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-md" style={{ background: '#f1f5fd' }}>
            <ShieldCheck size={17} weight="duotone" style={{ color: BLUE }} />
          </span>
          <h1 className="t-h2">TPS/CTPS checks</h1>
        </div>
        <p className="mt-2 max-w-[640px] text-black-700">Upload a list and Decibel checks every UK number against the TPS and CTPS registers, then gives you the file back with a status for each row: valid, or do not call.</p>

        <CreditsCard />

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
        <HowItWorks />
      </div>
    </div>
  );
}


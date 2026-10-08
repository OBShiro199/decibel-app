// TPS/CTPS checks: reading uploaded files, the queries behind /app/tps, and the checked file
// downloads. Everything that costs credits or decides an outcome happens in the database
// (migration 0023) and the tps-check worker; this file only parses, displays and exports.
import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export const MAX_ROWS = 1000;
export const MAX_COLUMNS = 200;
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const WELCOME_TPS_CREDITS = 2500;
export const TOP_UP_MESSAGE = "Hi, I'd like to top-up my TPS/CTPS number check credits.";
export const ACCEPT = '.csv,.tsv,.txt,.xlsx,text/csv,text/tab-separated-values,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// ---- outcomes ----------------------------------------------------------------
export type Outcome = 'valid' | 'tps' | 'ctps' | 'both' | 'invalid' | 'not_uk' | 'missing' | 'unchecked' | 'pending';

/** Label in the app, value written to the file, tag colour (globals .tag-N) and bar colour. */
export const OUTCOMES: Record<Outcome, { label: string; file: string; tag: number; bar: string; hint: string }> = {
  valid: { label: 'Valid', file: 'VALID', tag: 0, bar: '#a9d8b8', hint: 'Not on TPS or CTPS. OK to call.' },
  tps: { label: 'DNC (TPS)', file: 'DNC (TPS)', tag: 3, bar: '#f1b9a9', hint: 'On the TPS register (individuals and sole traders). Do not make sales calls.' },
  ctps: { label: 'DNC (CTPS)', file: 'DNC (CTPS)', tag: 2, bar: '#ecd194', hint: 'On the Corporate TPS register. Do not make unsolicited sales calls.' },
  both: { label: 'DNC (TPS + CTPS)', file: 'DNC (TPS + CTPS)', tag: 6, bar: '#e6b6d1', hint: 'On both registers. Do not make sales calls.' },
  invalid: { label: 'Invalid number', file: 'INVALID NUMBER', tag: 7, bar: '#d9d9d3', hint: 'Not a valid UK phone number. Not charged.' },
  not_uk: { label: 'Not UK', file: 'NOT UK (NOT CHECKED)', tag: 4, bar: '#cdc2ef', hint: 'Outside the UK, so the UK registers do not apply. Not charged.' },
  missing: { label: 'No number', file: 'NO NUMBER', tag: 7, bar: '#ebebe6', hint: 'The phone cell was empty. Not charged.' },
  unchecked: { label: 'Not checked', file: 'NOT CHECKED', tag: 7, bar: '#e2e2dc', hint: 'The check was cancelled or the registers could not be reached. Refunded.' },
  pending: { label: 'Checking', file: 'PENDING', tag: 1, bar: '#c9d6f4', hint: 'Still being checked.' },
};
export const DNC: Outcome[] = ['tps', 'ctps', 'both'];
/** Order of the segments in progress bars and stat tiles. */
export const BAR_ORDER: Outcome[] = ['valid', 'tps', 'ctps', 'both', 'invalid', 'not_uk', 'missing', 'unchecked'];

// ---- jobs ------------------------------------------------------------------------
export interface TpsJob {
  id: string;
  workspace_id: string;
  user_id: string | null;
  file_name: string;
  headers: string[];
  phone_column: number;
  status: 'running' | 'done' | 'cancelled' | 'failed';
  total_rows: number;
  numbers_total: number;
  numbers_reused: number;
  numbers_done: number;
  rows_valid: number;
  rows_tps: number;
  rows_ctps: number;
  rows_both: number;
  rows_invalid: number;
  rows_not_uk: number;
  rows_missing: number;
  rows_unchecked: number;
  credits_reserved: number;
  credits_refunded: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

export const rowCounts = (j: TpsJob): Record<Outcome, number> => {
  const counted = j.rows_valid + j.rows_tps + j.rows_ctps + j.rows_both + j.rows_invalid + j.rows_not_uk + j.rows_missing + j.rows_unchecked;
  return {
    valid: j.rows_valid,
    tps: j.rows_tps,
    ctps: j.rows_ctps,
    both: j.rows_both,
    invalid: j.rows_invalid,
    not_uk: j.rows_not_uk,
    missing: j.rows_missing,
    unchecked: j.rows_unchecked,
    pending: Math.max(j.total_rows - counted, 0),
  };
};
export const creditsUsed = (j: TpsJob) => Math.max(j.credits_reserved - j.credits_refunded, 0);
export const isLive = (j: TpsJob | null | undefined) => !!j && !j.finished_at;

const JOB_COLUMNS =
  'id,workspace_id,user_id,file_name,headers,phone_column,status,total_rows,numbers_total,numbers_reused,numbers_done,rows_valid,rows_tps,rows_ctps,rows_both,rows_invalid,rows_not_uk,rows_missing,rows_unchecked,credits_reserved,credits_refunded,error,created_at,finished_at';

export const tpsJobsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['tps-jobs', workspaceId],
    staleTime: 10_000,
    queryFn: async () => {
      const { data, error } = await supabase().from('tps_jobs').select(JOB_COLUMNS).eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(25);
      if (error) throw new Error(error.message);
      return (data ?? []) as TpsJob[];
    },
  });

export const tpsJobQuery = (jobId: string) =>
  queryOptions({
    queryKey: ['tps-job', jobId],
    queryFn: async () => {
      const { data, error } = await supabase().from('tps_jobs').select(JOB_COLUMNS).eq('id', jobId).maybeSingle();
      if (error) throw new Error(error.message);
      return (data as TpsJob | null) ?? null;
    },
  });

export interface LatestCheck {
  e164: string;
  status: string;
  on_tps: boolean | null;
  on_ctps: boolean | null;
  reused: boolean;
  checked_at: string | null;
}
/** The most recent answers on a running check, for the live feed. */
export const tpsLatestQuery = (jobId: string) =>
  queryOptions({
    queryKey: ['tps-latest', jobId],
    queryFn: async () => {
      const { data, error } = await supabase()
        .from('tps_job_numbers')
        .select('e164,status,on_tps,on_ctps,reused,checked_at')
        .eq('job_id', jobId)
        .in('status', ['done', 'invalid'])
        .order('checked_at', { ascending: false })
        .limit(6);
      if (error) throw new Error(error.message);
      return (data ?? []) as LatestCheck[];
    },
  });
export const latestOutcome = (n: LatestCheck): Outcome =>
  n.status === 'invalid' ? 'invalid' : n.on_tps && n.on_ctps ? 'both' : n.on_tps ? 'tps' : n.on_ctps ? 'ctps' : 'valid';

export interface ResultRow {
  row_no: number;
  cells: (string | null)[];
  phone_raw: string;
  e164: string | null;
  outcome: Outcome;
  tps_since: string | null;
  ctps_since: string | null;
  checked_at: string | null;
}
export const tpsResultsQuery = (jobId: string) =>
  queryOptions({
    queryKey: ['tps-results', jobId],
    staleTime: Infinity,
    queryFn: async () => {
      const { data, error } = await supabase().rpc('tps_job_results', { p_job_id: jobId });
      if (error) throw new Error(error.message);
      return (data ?? []) as ResultRow[];
    },
  });

export interface TpsCredits {
  balance: number;
  granted: number;
}
export const tpsCreditsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['tps-credits', workspaceId],
    staleTime: 15_000,
    queryFn: async (): Promise<TpsCredits> => {
      const [ws, grants] = await Promise.all([
        supabase().from('workspaces').select('tps_credit_balance').eq('id', workspaceId).single(),
        supabase().from('tps_credit_transactions').select('delta').eq('workspace_id', workspaceId).in('reason', ['welcome', 'topup']),
      ]);
      if (ws.error) throw new Error(ws.error.message);
      const granted = (grants.data ?? []).reduce((s, r) => s + (r.delta as number), 0);
      return { balance: ws.data.tps_credit_balance as number, granted };
    },
  });

export interface Quote {
  rows_total: number;
  numbers_total: number;
  numbers_reused: number;
  cost: number;
  rows_not_uk: number;
  rows_invalid: number;
  rows_missing: number;
  balance: number;
}
export async function fetchQuote(workspaceId: string, values: string[]): Promise<Quote> {
  const { data, error } = await supabase().rpc('tps_quote', { p_workspace_id: workspaceId, p_values: values });
  if (error) throw new Error(error.message);
  return (data as Quote[])[0];
}

/** Turns a database refusal into a sentence for the person. */
export function explainError(message: string): { text: string; topUp?: boolean } {
  const tail = message.replace(/^[a-z_]+:\s*/, '');
  if (message.startsWith('insufficient_tps_credits')) return { text: `Not enough check credits: ${tail}.`, topUp: true };
  if (message.startsWith('too_many_running')) return { text: 'You already have 3 checks running. Wait for one to finish, then try again.' };
  if (message.startsWith('slow_down')) return { text: 'You have uploaded a lot of files this hour. Try again shortly.' };
  if (message.startsWith('too_many_rows')) return { text: `${tail.charAt(0).toUpperCase()}${tail.slice(1)}.` };
  if (message.startsWith('file_too_large')) return { text: 'This file is too large. Remove columns you do not need and try again.' };
  if (message.startsWith('invalid_file')) return { text: `${tail.charAt(0).toUpperCase()}${tail.slice(1)}.` };
  return { text: 'Something went wrong. Try again in a moment.' };
}

// ---- reading files -----------------------------------------------------------------
export interface ParsedFile {
  name: string;
  headers: string[];
  rows: string[][];
}

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
  return String(v).replace(/\u0000/g, '').slice(0, 1000);
};

/** Reads a CSV, TSV, TXT or XLSX file into a header row and text cells. Throws a readable Error. */
export async function readFile(file: File): Promise<ParsedFile> {
  const lower = file.name.toLowerCase();
  if (file.size > MAX_FILE_BYTES) throw new Error('Files can be up to 5 MB.');
  if (lower.endsWith('.xls') || lower.endsWith('.numbers') || lower.endsWith('.ods')) {
    throw new Error('Save the file as .xlsx or .csv first, then upload it.');
  }
  let grid: string[][];
  if (lower.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser');
    const data = await readSheet(file).catch(() => {
      throw new Error('That Excel file could not be read. Save it again as .xlsx or .csv.');
    });
    grid = data.map((r) => r.map(cell));
  } else {
    const Papa = (await import('papaparse')).default;
    const text = (await file.text()).replace(/^﻿/, '');
    const parsed = Papa.parse<string[]>(text, { skipEmptyLines: 'greedy', delimiter: lower.endsWith('.tsv') ? '\t' : '' });
    grid = parsed.data.map((r) => r.map(cell));
  }
  // drop rows with nothing in them
  grid = grid.filter((r) => r.some((c) => c.trim() !== ''));
  if (grid.length < 2) throw new Error('The file needs a header row and at least one row of data.');
  const width = Math.max(...grid.map((r) => r.length));
  if (width > MAX_COLUMNS) throw new Error(`Files can have up to ${MAX_COLUMNS} columns.`);
  const headers = Array.from({ length: width }, (_, i) => (grid[0][i] ?? '').trim() || `Column ${i + 1}`);
  const rows = grid.slice(1).map((r) => Array.from({ length: width }, (_, i) => r[i] ?? ''));
  if (rows.length > MAX_ROWS) throw new Error(`Files can have up to ${MAX_ROWS.toLocaleString('en-GB')} rows. This one has ${rows.length.toLocaleString('en-GB')}. Split it and upload each part.`);
  return { name: file.name, headers, rows };
}

const PHONE_HEADER = /(mobile|phone|tel\b|telephone|cell|landline|contact.?no|number|dial)/i;
const looksLikePhone = (v: string) => {
  const d = v.replace(/\D/g, '');
  return /^[+\d(][\d\s()+.\-/]{6,}$/.test(v.trim()) && d.length >= 9 && d.length <= 15;
};

/** The column most likely to hold the phone numbers: name first, then how phone-like the values are. */
export function detectPhoneColumn(f: ParsedFile): number {
  const sample = f.rows.slice(0, 200);
  let best = -1;
  let bestScore = 0;
  f.headers.forEach((h, i) => {
    const filled = sample.filter((r) => r[i]?.trim());
    const phoney = filled.length ? filled.filter((r) => looksLikePhone(r[i])).length / filled.length : 0;
    let score = phoney * 5;
    if (PHONE_HEADER.test(h)) score += 3;
    if (/mobile|cell/i.test(h)) score += 1;
    if (/email|id\b|date|postcode|zip/i.test(h)) score -= 4;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

// ---- downloads -------------------------------------------------------------------------
export type RowFilter = 'all' | 'callable' | 'dnc' | 'other';
export const matchesFilter = (o: Outcome, f: RowFilter) =>
  f === 'all' || (f === 'callable' ? o === 'valid' : f === 'dnc' ? DNC.includes(o) : !DNC.includes(o) && o !== 'valid');

const ADDED = ['TPS status', 'TPS registered', 'CTPS registered', 'Checked on'];
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '');

function table(job: TpsJob, rows: ResultRow[], filter: RowFilter): string[][] {
  const headers = [...job.headers, ...ADDED];
  const body = rows
    .filter((r) => matchesFilter(r.outcome, filter))
    .map((r) => [...job.headers.map((_, i) => r.cells[i] ?? ''), OUTCOMES[r.outcome].file, day(r.tps_since), day(r.ctps_since), day(r.checked_at)]);
  return [headers, ...body];
}

export function outputName(job: TpsJob, filter: RowFilter, ext: 'csv' | 'xlsx') {
  const base = job.file_name.replace(/\.(csv|tsv|txt|xlsx)$/i, '');
  const tag = filter === 'all' ? 'checked' : filter === 'callable' ? 'callable' : filter === 'dnc' ? 'do-not-call' : 'other';
  return `${base}-tps-${tag}.${ext}`;
}

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadChecked(job: TpsJob, rows: ResultRow[], filter: RowFilter, ext: 'csv' | 'xlsx') {
  const t = table(job, rows, filter);
  if (ext === 'csv') {
    const Papa = (await import('papaparse')).default;
    // BOM so Excel opens UTF-8 names correctly
    save(new Blob(['﻿' + Papa.unparse(t)], { type: 'text/csv;charset=utf-8' }), outputName(job, filter, 'csv'));
    return;
  }
  const writeXlsxFile = (await import('write-excel-file/browser')).default;
  const statusCol = job.headers.length;
  const tint: Record<string, string> = { VALID: '#EAF6EE', 'DNC (TPS)': '#FCEDE8', 'DNC (CTPS)': '#FBF3E1', 'DNC (TPS + CTPS)': '#F9ECF4' };
  const data = t.map((r, ri) =>
    r.map((v, ci) =>
      ri === 0
        ? { value: v, fontWeight: 'bold' as const }
        : ci === statusCol && tint[v]
          ? { value: v, fontWeight: 'bold' as const, backgroundColor: tint[v] }
          : { value: v },
    ),
  );
  const blob = await writeXlsxFile(data, { sheet: 'TPS checked', stickyRowsCount: 1, columns: t[0].map((h, i) => ({ width: i === statusCol ? 20 : Math.min(Math.max(h.length + 2, 12), 40) })) }).toBlob();
  save(blob, outputName(job, filter, 'xlsx'));
}

export const prettyUk = (e164: string | null) => {
  if (!e164) return '';
  if (!e164.startsWith('+44')) return e164;
  const n = '0' + e164.slice(3);
  if (n.startsWith('02')) return `${n.slice(0, 3)} ${n.slice(3, 7)} ${n.slice(7)}`;
  if (n.startsWith('03') || n.startsWith('08')) return `${n.slice(0, 4)} ${n.slice(4, 7)} ${n.slice(7)}`;
  return `${n.slice(0, 5)} ${n.slice(5)}`;
};

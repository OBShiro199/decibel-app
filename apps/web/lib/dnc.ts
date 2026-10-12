// The DNC list: a workspace's own do-not-call numbers (migration 0026). Numbers on it can never
// be dialled, and no person, lead or local business with one of them can be added. The database
// enforces all of that; this file holds the queries, the chunked upload and the wording.
import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export const DNC_PAGE = 50;
export const DNC_MAX_ROWS = 200_000;
export const DNC_MAX_BYTES = 20 * 1024 * 1024;
const CHUNK = 5000;

export type DncSource = 'manual' | 'import' | 'paste' | 'call' | 'tps_check';
export const SOURCE_LABEL: Record<DncSource, { label: string; tag: number }> = {
  import: { label: 'Upload', tag: 1 },
  paste: { label: 'Pasted', tag: 4 },
  manual: { label: 'Added', tag: 7 },
  call: { label: 'From a call', tag: 2 },
  tps_check: { label: 'TPS check', tag: 6 },
};

export interface DncEntry {
  id: string;
  e164: string;
  label: string | null;
  reason: string | null;
  source: DncSource;
  added_by: string | null;
  created_at: string;
}

export interface DncImport {
  id: string;
  file_name: string;
  kind: 'file' | 'paste' | 'tps_check';
  reason: string | null;
  total_rows: number;
  added: number;
  duplicates: number;
  invalid: number;
  status: 'running' | 'done' | 'failed';
  user_id: string | null;
  created_at: string;
}

/** One page of the list, newest first; `search` matches the number (any digits) or the label. */
export const dncEntriesQuery = (workspaceId: string, search: string, page: number) =>
  queryOptions({
    queryKey: ['dnc', workspaceId, search, page],
    staleTime: 15_000,
    queryFn: async () => {
      let q = supabase()
        .from('dnc_entries')
        .select('id,e164,label,reason,source,added_by,created_at', { count: 'exact' })
        .eq('workspace_id', workspaceId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(page * DNC_PAGE, page * DNC_PAGE + DNC_PAGE - 1);
      const term = search.trim();
      if (term) {
        const digits = term.replace(/\D/g, '');
        // 07… matches +447…: search on the national significant number
        const core = digits.startsWith('0') ? digits.slice(1) : digits.startsWith('44') ? digits.slice(2) : digits;
        q = core.length >= 3 ? q.ilike('e164', `%${core}%`) : q.ilike('label', `%${term.replace(/[%_]/g, '')}%`);
      }
      const { data, error, count } = await q;
      if (error) throw new Error(error.message);
      return { rows: (data ?? []) as DncEntry[], count: count ?? 0 };
    },
  });

export const dncTotalQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['dnc-total', workspaceId],
    staleTime: 15_000,
    queryFn: async () => {
      const { count, error } = await supabase().from('dnc_entries').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },
  });

export const dncImportsQuery = (workspaceId: string) =>
  queryOptions({
    queryKey: ['dnc-imports', workspaceId],
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase().from('dnc_imports').select('*').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(20);
      if (error) throw new Error(error.message);
      return (data ?? []) as DncImport[];
    },
  });

export interface AddResult {
  added: number;
  duplicates: number;
  invalid: number;
}

/**
 * Adds numbers in chunks of 5,000 under one upload record (or, for a single number, directly).
 * `onProgress` reports rows done so far.
 */
export async function addToDnc(
  workspaceId: string,
  numbers: string[],
  opts: { labels?: (string | null)[]; reason?: string; kind: 'file' | 'paste' | 'tps_check' | 'manual'; fileName?: string; onProgress?: (done: number) => void },
): Promise<AddResult> {
  const db = supabase();
  const total: AddResult = { added: 0, duplicates: 0, invalid: 0 };
  if (opts.kind === 'manual') {
    const { data, error } = await db.rpc('dnc_add', { p_workspace_id: workspaceId, p_numbers: numbers, p_reason: opts.reason || null, p_source: 'manual' });
    if (error) throw new Error(explainDnc(error.message));
    return data as AddResult;
  }
  const { data: importId, error: beginErr } = await db.rpc('dnc_import_begin', {
    p_workspace_id: workspaceId,
    p_file_name: opts.fileName ?? (opts.kind === 'paste' ? 'Pasted numbers' : 'TPS check'),
    p_kind: opts.kind,
    p_total: numbers.length,
    p_reason: opts.reason || null,
  });
  if (beginErr) throw new Error(explainDnc(beginErr.message));
  const source = opts.kind === 'file' ? 'import' : opts.kind;
  try {
    for (let i = 0; i < numbers.length; i += CHUNK) {
      const { data, error } = await db.rpc('dnc_add', {
        p_workspace_id: workspaceId,
        p_numbers: numbers.slice(i, i + CHUNK),
        p_labels: opts.labels ? opts.labels.slice(i, i + CHUNK) : null,
        p_source: source,
        p_import_id: importId,
      });
      if (error) throw new Error(explainDnc(error.message));
      const r = data as AddResult;
      total.added += r.added;
      total.duplicates += r.duplicates;
      total.invalid += r.invalid;
      opts.onProgress?.(Math.min(i + CHUNK, numbers.length));
    }
    await db.rpc('dnc_import_finish', { p_import_id: importId });
    return total;
  } catch (e) {
    await db.rpc('dnc_import_finish', { p_import_id: importId, p_failed: true });
    throw e;
  }
}

export async function removeFromDnc(workspaceId: string, ids: string[]): Promise<number> {
  const { data, error } = await supabase().rpc('dnc_remove', { p_workspace_id: workspaceId, p_ids: ids });
  if (error) throw new Error(explainDnc(error.message));
  return data as number;
}

/** Pasted text → one candidate per line, comma or semicolon (the server decides what is a number). */
export function splitPasted(text: string): string[] {
  return text
    .split(/[\n;,\t]+/)
    .map((x) => x.trim())
    .filter((x) => /\d{6,}/.test(x.replace(/\D/g, '')));
}

/** Database refusals in plain words. */
export function explainDnc(message: string): string {
  if (/dnc_listed/.test(message)) {
    const n = message.match(/dnc_listed: (\+\d+)/)?.[1];
    return `${n ?? 'That number'} is on your DNC list, so it can’t be added or called. Remove it from the DNC list first if you really need to.`;
  }
  if (/admins_only/.test(message)) return 'Only owners and admins can remove numbers from the DNC list.';
  if (/too_many_rows/.test(message)) return 'A DNC upload can have up to 200,000 numbers. Split the file and upload each part.';
  if (/slow_down/.test(message)) return 'You have uploaded a lot of lists this hour. Try again shortly.';
  if (/forbidden/.test(message)) return 'You no longer have access to this workspace.';
  return message.replace(/^[a-z_]+: /, '');
}

export const isDncError = (message: string) => /dnc_listed/.test(message);

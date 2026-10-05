// How many rows fit a full-height table, remembered per table and window height. A table that
// knows its size on mount can fetch straight away (no measure, fetch, re-measure, fetch again),
// and the prefetcher can load its first page before the tab is opened.
const mem = new Map<string, number>();
const keyFor = (table: string) => `fit:${table}:${typeof window === 'undefined' ? 0 : window.innerHeight}`;

export function knownFitRows(table: string): number {
  if (typeof window === 'undefined') return 0;
  const k = keyFor(table);
  const cached = mem.get(k);
  if (cached) return cached;
  try {
    const stored = Number(window.localStorage.getItem(k));
    if (stored > 0) {
      mem.set(k, stored);
      return stored;
    }
  } catch {}
  return 0;
}

export function rememberFitRows(table: string, rows: number) {
  if (typeof window === 'undefined' || rows <= 0) return;
  const k = keyFor(table);
  if (mem.get(k) === rows) return;
  mem.set(k, rows);
  try {
    window.localStorage.setItem(k, String(rows));
  } catch {}
}

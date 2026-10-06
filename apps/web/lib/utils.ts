import clsx, { type ClassValue } from 'clsx';

export const cn = (...inputs: ClassValue[]) => clsx(inputs);

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export const firstName = (name: string | null | undefined) => (name ?? '').trim().split(/\s+/)[0] || 'there';

/** +447700900101 -> +44 7700 900101 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  if (e164.startsWith('+44') && e164.length === 13) return `+44 ${e164.slice(3, 7)} ${e164.slice(7)}`;
  return e164.replace(/^(\+\d{2})(\d{3,4})(\d+)$/, '$1 $2 $3');
}

/** Mirrors public.normalize_phone() */
export function normalizePhone(p: string | null | undefined, cc = '44'): string | null {
  if (!p) return null;
  let s = p.replace(/[^0-9+]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (s.startsWith('0')) s = '+' + cc + s.slice(1);
  if (!s.startsWith('+')) s = '+' + s;
  return /^\+[1-9][0-9]{6,14}$/.test(s) ? s : null;
}

/** 150 -> 2:30 */
export function formatDuration(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`;
}

/** 5400 -> 1h 30m */
export function formatTalkTime(seconds: number | null | undefined): string {
  const s = Math.max(0, Math.round(seconds ?? 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return 'never';
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 45) return 'just now';
  if (diff < 3600) return `${Math.max(1, Math.round(diff / 60))} minute${Math.round(diff / 60) === 1 ? '' : 's'} ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)} hour${Math.round(diff / 3600) === 1 ? '' : 's'} ago`;
  if (diff < 86400 * 30) return `${Math.round(diff / 86400)} day${Math.round(diff / 86400) === 1 ? '' : 's'} ago`;
  return formatDate(iso);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

/** "2 Oct 2026", or "2 Oct 2026, 14:05" with time. Three-letter months always (no "Sept"). */
export function formatDate(iso: string | null | undefined, withTime = false): string {
  if (!iso) return '';
  const d = new Date(iso);
  const date = `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  return withTime ? `${date}, ${hhmm(d)}` : date;
}

/** Compact timestamp for tables: "Today 14:05", "Yesterday 09:12", "30 Sep 21:40", "3 Jan 2025". */
export function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === now.toDateString()) return `Today ${hhmm(d)}`;
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday ${hhmm(d)}`;
  if (d.getFullYear() === now.getFullYear()) return `${d.getDate()} ${MONTHS[d.getMonth()]} ${hhmm(d)}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

export function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function slugify(input: string): string {
  const s = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34);
  return s.length >= 3 ? s : `team-${s}`.replace(/-$/, '');
}

export const daysLeft = (iso: string) => Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const FREE_MAIL = ['gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'live.co.uk', 'yahoo.com', 'yahoo.co.uk', 'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'gmx.com', 'btinternet.com', 'sky.com'];
export const isFreeMail = (email: string) => FREE_MAIL.includes(email.split('@')[1]?.toLowerCase() ?? '');

/** Downloads a CSV and records the export in the workspace audit log. */
export function exportCsv(workspaceId: string, kind: 'people' | 'calls' | 'leads' | 'local' | 'dnc', filename: string, rows: Record<string, unknown>[]) {
  downloadCsv(filename, rows);
  void import('@/lib/supabase/client').then(({ supabase }) =>
    supabase()
      .rpc('log_audit', { p_workspace_id: workspaceId, p_action: `export.${kind}`, p_payload: { rows: rows.length, filename } })
      .then(({ error }) => error && console.warn('[audit] export not logged:', error.message)),
  );
  // the first export earns a congratulations email (sent once per account, server side)
  let asked = false;
  try {
    asked = !!localStorage.getItem('decibel.first-export-email');
    localStorage.setItem('decibel.first-export-email', '1');
  } catch {
    /* storage blocked: the server still de-duplicates */
  }
  if (!asked && !window.location.pathname.startsWith('/dev-preview')) {
    void import('@/lib/supabase/client').then(({ invoke }) => invoke('send-email', { type: 'first_export', rows: rows.length }).catch(() => {}));
  }
}

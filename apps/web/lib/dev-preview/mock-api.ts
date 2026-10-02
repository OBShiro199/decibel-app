// Local design preview only: answers Supabase REST, RPC and function calls from
// sample data so the real app pages render without signing in. Installed by the
// /dev-preview layout, which refuses to render in production.
import { RPC, TABLES } from './data';

let installed = false;

function filterRows(rows: Record<string, unknown>[], params: URLSearchParams) {
  let out = rows;
  params.forEach((value, key) => {
    if (['select', 'order', 'limit', 'offset', 'or', 'and', 'columns'].includes(key)) return;
    if (!out.length || !(key in out[0])) return;
    if (value.startsWith('eq.')) out = out.filter((r) => String(r[key]) === value.slice(3));
    else if (value.startsWith('in.(')) {
      const set = value.slice(4, -1).split(',').map((v) => v.replace(/^"|"$/g, ''));
      out = out.filter((r) => set.includes(String(r[key])));
    }
  });
  return out;
}

export function installMockApi() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const realFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!url.href.startsWith(base)) return realFetch(input, init);
    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
    const json = (body: unknown, extra: Record<string, string> = {}) =>
      new Response(method === 'HEAD' ? null : JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', ...extra } });

    if (url.pathname.startsWith('/functions/v1/')) {
      const fn = url.pathname.split('/').pop();
      if (fn === 'billing') return json({ invoices: [] });
      return new Response(JSON.stringify({ error: 'preview_only' }), { status: 503, headers: { 'content-type': 'application/json' } });
    }
    if (url.pathname.startsWith('/auth/v1/')) return json({});
    if (url.pathname.startsWith('/storage/v1/')) return new Response(JSON.stringify({ error: 'preview_only' }), { status: 400 });
    if (!url.pathname.startsWith('/rest/v1/')) return realFetch(input, init);

    const path = url.pathname.slice('/rest/v1/'.length);
    const single = (headers.get('accept') ?? '').includes('vnd.pgrst.object');
    if (method !== 'GET' && method !== 'HEAD' && !path.startsWith('rpc/')) return json(single ? {} : []); // writes are no-ops

    let rows = (path.startsWith('rpc/') ? RPC[path.slice(4)] : TABLES[path]) ?? [];
    if (!Array.isArray(rows)) rows = [rows];
    let out = filterRows(rows as Record<string, unknown>[], url.searchParams);
    const total = out.length;
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = url.searchParams.get('limit');
    out = out.slice(offset, limit ? offset + Number(limit) : undefined);
    const range = { 'content-range': `${out.length ? offset : '*'}-${out.length ? offset + out.length - 1 : ''}/${total}`.replace('*-/', '*/') };
    if (single) return json(out[0] ?? null, range);
    return json(out, range);
  };
}

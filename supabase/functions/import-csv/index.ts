// Imports a CSV that the browser uploaded to the private `imports` bucket.
// POST { import_id } with the user's JWT. The imports row carries storage_path,
// column_map ({ "CSV header": "field" }) and an optional list_id.
// Dedupes on email / mobile, normalises phones, and TPS-checks every row
// against tps_cache (V1 seeded flags).
import { admin, corsHeaders, fail, getRole, getUser, isAdmin, json } from '../_shared/http.ts';
import { normalizePhone } from '../_shared/twilio.ts';

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const user = await getUser(req);
  if (!user) return fail('unauthorized', 401);
  const { import_id } = await req.json().catch(() => ({}));
  if (!import_id) return fail('import_id required');
  const db = admin();

  const { data: imp } = await db.from('imports').select('*').eq('id', import_id).maybeSingle();
  if (!imp) return fail('not_found', 404);
  if (!isAdmin(await getRole(user.id, imp.workspace_id))) return fail('forbidden', 403);
  if (imp.status === 'completed') return json({ imported: imp.imported_count, skipped: imp.skipped_count });

  const finish = async (patch: Record<string, unknown>) =>
    db.from('imports').update({ ...patch, completed_at: new Date().toISOString() }).eq('id', imp.id);

  try {
    await db.from('imports').update({ status: 'processing' }).eq('id', imp.id);
    const { data: file, error: dlErr } = await db.storage.from('imports').download(imp.storage_path);
    if (dlErr || !file) throw new Error('could not read the uploaded file');
    const rows = parseCsv(await file.text());
    if (rows.length < 2) throw new Error('the file has no data rows');
    if (rows.length > 10001) throw new Error('files are limited to 10,000 rows');

    const headers = rows[0].map((h) => h.trim());
    const map = imp.column_map as Record<string, string>;
    const idx: Record<string, number> = {};
    headers.forEach((h, i) => {
      if (map[h]) idx[map[h]] = i;
    });
    const get = (r: string[], f: string) => (idx[f] === undefined ? '' : (r[idx[f]] ?? '').trim());

    const ws = imp.workspace_id as string;
    const [{ data: existing }, { data: stage }, { data: companies }] = await Promise.all([
      db.from('people').select('email,mobile_e164').eq('workspace_id', ws),
      db.from('pipeline_stages').select('id').eq('workspace_id', ws).order('position').limit(1).maybeSingle(),
      db.from('tenant_companies').select('id,name').eq('workspace_id', ws),
    ]);
    const emails = new Set((existing ?? []).map((p) => p.email?.toLowerCase()).filter(Boolean));
    const mobiles = new Set((existing ?? []).map((p) => p.mobile_e164).filter(Boolean));
    const companyIds = new Map((companies ?? []).map((c) => [c.name.toLowerCase(), c.id as string]));

    const candidates: Record<string, unknown>[] = [];
    const companyNames: string[] = [];
    let skipped = 0;
    for (const r of rows.slice(1)) {
      let first = get(r, 'first_name');
      let last = get(r, 'last_name');
      const full = get(r, 'full_name');
      if (!first && full) {
        const parts = full.split(/\s+/);
        first = parts.shift() ?? '';
        last = parts.join(' ');
      }
      const emailRaw = get(r, 'email').toLowerCase();
      const email = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailRaw) ? emailRaw : null;
      const mobile = normalizePhone(get(r, 'mobile'));
      if (!first || (!email && !mobile)) {
        skipped++;
        continue;
      }
      if ((email && emails.has(email)) || (mobile && mobiles.has(mobile))) {
        skipped++;
        continue;
      }
      if (email) emails.add(email);
      if (mobile) mobiles.add(mobile);
      const company = get(r, 'company');
      if (company) companyNames.push(company);
      const cc = get(r, 'country_code').toUpperCase();
      candidates.push({
        workspace_id: ws,
        first_name: first,
        last_name: last,
        job_title: get(r, 'job_title') || null,
        email,
        mobile_e164: mobile,
        direct_dial_e164: normalizePhone(get(r, 'direct_dial')),
        linkedin_url: get(r, 'linkedin_url') || null,
        city: get(r, 'city') || null,
        country_code: /^[A-Z]{2}$/.test(cc) ? cc : 'GB',
        source: 'import',
        created_by: user.id,
        stage_id: stage?.id ?? null,
        _company: company.toLowerCase(),
      });
    }

    // companies: create any that are new
    const newCompanies = [...new Set(companyNames.map((c) => c.trim()))].filter((c) => !companyIds.has(c.toLowerCase()));
    for (let i = 0; i < newCompanies.length; i += 500) {
      const { data } = await db
        .from('tenant_companies')
        .insert(newCompanies.slice(i, i + 500).map((name) => ({ workspace_id: ws, name, owner_id: user.id })))
        .select('id,name');
      (data ?? []).forEach((c) => companyIds.set(c.name.toLowerCase(), c.id));
    }

    // TPS check from the cache
    const allMobiles = candidates.map((c) => c.mobile_e164).filter(Boolean) as string[];
    const tps = new Map<string, string>();
    for (let i = 0; i < allMobiles.length; i += 500) {
      const { data } = await db.from('tps_cache').select('e164,status').in('e164', allMobiles.slice(i, i + 500));
      (data ?? []).forEach((t) => tps.set(t.e164, t.status));
    }
    const now = new Date().toISOString();

    let imported = 0;
    const insertedIds: string[] = [];
    for (let i = 0; i < candidates.length; i += 500) {
      const batch = candidates.slice(i, i + 500).map(({ _company, ...c }) => ({
        ...c,
        tenant_company_id: _company ? (companyIds.get(_company as string) ?? null) : null,
        tps_status: c.mobile_e164 ? (tps.get(c.mobile_e164 as string) ?? 'clear') : 'unchecked',
        tps_checked_at: c.mobile_e164 ? now : null,
      }));
      const { data, error } = await db.from('people').insert(batch).select('id');
      if (error) throw new Error(error.message);
      imported += data?.length ?? 0;
      insertedIds.push(...(data ?? []).map((p) => p.id));
    }

    if (insertedIds.length) {
      for (let i = 0; i < insertedIds.length; i += 500) {
        const chunk = insertedIds.slice(i, i + 500);
        await db.from('activities').insert(
          chunk.map((id) => ({ workspace_id: ws, person_id: id, actor_id: user.id, kind: 'imported', payload: { import_id: imp.id, filename: imp.filename } })),
        );
        if (imp.list_id) {
          await db.from('list_members').insert(
            chunk.map((id, j) => ({ list_id: imp.list_id, person_id: id, workspace_id: ws, position: i + j, added_by: user.id })),
          );
        }
      }
    }

    await finish({ status: 'completed', row_count: rows.length - 1, imported_count: imported, skipped_count: skipped });
    return json({ imported, skipped });
  } catch (e) {
    await finish({ status: 'failed', error: (e as Error).message });
    return fail((e as Error).message, 422);
  }
});

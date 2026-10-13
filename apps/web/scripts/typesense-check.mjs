#!/usr/bin/env node
// Lead search on Typesense against the full data: ~30 filter combinations through the lead-search
// function as a signed-in user. For each: total, timing, and that every returned lead really matches
// (re-checked on the raw data_list rows). Creates a throwaway user and workspace.
//
//   SUPABASE_SERVICE_ROLE_KEY=... node scripts/typesense-check.mjs
import { createClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
for (const line of existsSync(join(here, '..', '.env.local')) ? readFileSync(join(here, '..', '.env.local'), 'utf8').split('\n') : []) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
}
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, A = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(U, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const words = (s) => (s ?? '').toLowerCase().split(/[^a-z0-9+]+/).filter(Boolean);
const hasWord = (s, w) => { const ws = words(s); const parts = words(w); return parts.length > 1 ? parts.every((p) => ws.includes(p)) : ws.some((t) => t.startsWith(parts[0])); };
const company = (r) => r.company_name || r.current_employer;
const months = (d) => (d ? (Date.now() - new Date(d).getTime()) / (30.44 * 86400000) : null);

const email = `tscheck-${randomBytes(4).toString('hex')}@example.test`, password = randomBytes(16).toString('base64url') + '1A';
const { data: c } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const db = createClient(U, A, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email, password });
const { data: ws } = await db.rpc('create_workspace', { p_name: 'TS check', p_slug: `tsc-${randomBytes(3).toString('hex')}` });

// real values from the data
const { data: facetRows } = await db.rpc('search_facets_for', { p_source: 'leads' });
const top = (f, n = 1) => (facetRows ?? []).filter((r) => r.facet === f).sort((a, b) => b.n - a.n).slice(0, n).map((r) => r.value);
const [ind1, ind2] = top('industry', 2), [sen1] = top('seniority'), [dep1] = top('department'), [size1] = top('size'), [rev1] = top('revenue');
const UK = 'United Kingdom';

const CASES = [
  ['Everything', {}, () => true],
  ['UK', { countries: [UK] }, (r) => r.contact_country === UK],
  ['UK + no mobile', { countries: [UK], hasMobile: false }, (r) => r.contact_country === UK && !r.mobile_phone],
  ['UK + has mobile', { countries: [UK], hasMobile: true }, (r) => r.contact_country === UK && !!r.mobile_phone],
  ['UK or Ireland', { countries: [UK, 'Ireland'] }, (r) => [UK, 'Ireland'].includes(r.contact_country)],
  ['UK mobiles (+44)', { mobileCodes: ['+44'] }, (r) => (r.mobile_phone ?? '').replace(/[^0-9+]/g, '').startsWith('+44')],
  ['Title: CEO', { titles: ['ceo'] }, (r) => hasWord(r.current_title, 'ceo')],
  ['Title: CEO or Chief Executive', { titles: ['ceo', 'chief executive'] }, (r) => hasWord(r.current_title, 'ceo') || hasWord(r.current_title, 'chief executive')],
  ['UK CEOs with mobile', { titles: ['ceo'], countries: [UK], hasMobile: true }, (r) => hasWord(r.current_title, 'ceo') && r.contact_country === UK && !!r.mobile_phone],
  ['Head of Sales', { titles: ['head of sales'] }, (r) => hasWord(r.current_title, 'head of sales')],
  ['Directors, not managers', { titles: ['director'], titlesNot: ['manager'] }, (r) => hasWord(r.current_title, 'director') && !hasWord(r.current_title, 'manager')],
  [`Seniority: ${sen1}`, { seniorities: [sen1] }, (r) => r.seniority_level === sen1],
  [`Department: ${dep1}`, { departments: [dep1] }, (r) => r.department === dep1],
  [`Industry: ${ind1}`, { industries: [ind1] }, (r) => r.main_industry === ind1 || r.company_industry === ind1],
  [`Industry ${ind1} or ${ind2}`, { industries: [ind1, ind2] }, (r) => [ind1, ind2].includes(r.main_industry) || [ind1, ind2].includes(r.company_industry)],
  [`Not ${ind1}`, { industriesNot: [ind1] }, (r) => r.main_industry !== ind1 && r.company_industry !== ind1],
  [`Size ${size1}`, { sizes: [size1] }, (r) => r.employee_count_range === size1],
  ['50–200 employees', { employeesMin: 50, employeesMax: 200 }, (r) => r.linkedin_employee_count_exact >= 50 && r.linkedin_employee_count_exact <= 200],
  [`Revenue ${rev1}`, { revenues: [rev1] }, (r) => r.revenue_range === rev1],
  ['HQ in UK', { hqCountries: [UK] }, (r) => r.company_hq_country === UK],
  ['City: London', { cities: ['london'] }, (r) => hasWord(r.contact_location, 'london')],
  ['Company: Barclays', { companies: ['barclays'] }, (r) => hasWord(company(r), 'barclays')],
  ['Not Barclays, in banking', { industries: ['Banking'], companiesNot: ['barclays'] }, (r) => (r.main_industry === 'Banking' || r.company_industry === 'Banking') && !hasWord(company(r), 'barclays')],
  ['Has work email', { hasEmail: true }, (r) => !!r.work_email],
  ['Has personal email', { hasPersonalEmail: true }, (r) => !!r.personal_emails],
  ['Has LinkedIn', { hasLinkedin: true }, (r) => !!r.linkedin_url],
  ['Open to work', { openToWork: true }, (r) => r.open_to_work === true],
  ['Company hiring', { isHiring: true }, (r) => r.is_hiring === true],
  ['Has raised funding', { hasFunding: true }, (r) => !!r.last_funding_type],
  ['Founded since 2015', { foundedMin: 2015 }, (r) => r.company_founded_year && new Date(r.company_founded_year).getUTCFullYear() >= 2015],
  ['Over 2 years in role', { tenureMin: 24 }, (r) => months(r.role_start_date) >= 23.5],
  ['Search box: "marketing"', { q: 'marketing' }, (r) => [r.full_name, r.current_title, company(r)].some((s) => hasWord(s, 'marketing'))],
  ['Kitchen sink: UK IT directors 50–500 staff with mobile', { countries: [UK], industries: [ind1], seniorities: ['director'], employeesMin: 50, employeesMax: 500, hasMobile: true }, (r) => r.contact_country === UK && (r.main_industry === ind1 || r.company_industry === ind1) && r.seniority_level === 'director' && r.linkedin_employee_count_exact >= 50 && r.linkedin_employee_count_exact <= 500 && !!r.mobile_phone],
];

const COLS = 'contact_id,full_name,current_title,company_name,current_employer,contact_country,contact_location,mobile_phone,work_email,personal_emails,linkedin_url,seniority_level,department,main_industry,company_industry,employee_count_range,linkedin_employee_count_exact,revenue_range,company_hq_country,open_to_work,is_hiring,last_funding_type,company_founded_year,role_start_date';
const out = [];
try {
  for (const [name, filters, match] of CASES) {
    const t = Date.now();
    const { data, error } = await db.functions.invoke('lead-search', { body: { workspace_id: ws.id, filters, offset: 0, limit: 100 } });
    const ms = Date.now() - t;
    if (error) { out.push({ name, ok: false, note: error.message }); continue; }
    const ids = data.rows.map((r) => r.lead_id);
    const { data: raw } = ids.length ? await admin.from('data_list').select(COLS).in('contact_id', ids) : { data: [] };
    const wrong = (raw ?? []).filter((r) => !match(r));
    const masked = data.rows.every((r) => !r.mobile || r.mobile.includes('•'));
    out.push({ name, ok: !wrong.length && masked && data.count.exact, found: data.count.n, rows: data.rows.length, ms, server: data.took_ms, wrong: wrong.length, example: wrong[0] ? `${wrong[0].current_title ?? ''} | ${company(wrong[0]) ?? ''} | ${wrong[0].contact_country ?? ''}` : '' });
  }
  // deep paging and count-only
  const t1 = Date.now();
  const deep = await db.functions.invoke('lead-search', { body: { workspace_id: ws.id, filters: { countries: [UK] }, offset: 300000, limit: 100 } });
  out.push({ name: 'Page 3,001 of UK (offset 300,000)', ok: !deep.error && deep.data.rows.length === 100, found: deep.data?.count.n, rows: deep.data?.rows.length, ms: Date.now() - t1, server: deep.data?.took_ms, wrong: 0 });
  const t2 = Date.now();
  const cnt = await db.functions.invoke('lead-search', { body: { workspace_id: ws.id, filters: { countries: [UK], hasMobile: false }, limit: 0 } });
  out.push({ name: 'Count only: UK + no mobile', ok: !cnt.error && cnt.data.count.n > 0, found: cnt.data?.count.n, rows: 0, ms: Date.now() - t2, server: cnt.data?.took_ms, wrong: 0 });
} finally {
  await admin.from('workspaces').delete().eq('id', ws.id);
  await admin.auth.admin.deleteUser(c.user.id);
}
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(pad('', 4) + pad('search', 52) + pad('found', 11) + pad('rows', 6) + pad('page', 8) + pad('srv', 7) + 'wrong');
for (const r of out) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${pad(r.name, 51)} ${pad((r.found ?? '-').toLocaleString(), 10)} ${pad(r.rows ?? '-', 5)} ${pad((r.ms ?? '-') + 'ms', 7)} ${pad((r.server ?? '-') + 'ms', 6)} ${r.wrong ?? ''}${r.note ? ' ' + r.note : ''}${r.example ? '  e.g. ' + r.example : ''}`);
const ms = out.filter((r) => r.ms).map((r) => r.ms).sort((a, b) => a - b);
console.log(`\n${out.filter((r) => r.ok).length}/${out.length} passed · page load median ${ms[Math.floor(ms.length / 2)]}ms, slowest ${ms.at(-1)}ms`);

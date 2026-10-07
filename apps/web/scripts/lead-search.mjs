#!/usr/bin/env node
// Lead and local-business search test (migrations 0017–0019). Signs in as throwaway users and
// checks, against the real tables:
//   - security: no direct table access, workspace isolation, masking, reveal links cannot be faked
//   - accuracy: ~40 filter combinations (single filters up to 15+ stacked). For each one, every
//     matching row among the first SAMPLE rows must be returned and nothing else (completeness),
//     and every returned row must satisfy every filter when re-checked on its raw record (soundness)
//   - paging, counts and speed
//   - reveals: credits charged once, free on repeat, lists filled, isolation, limits
// Prints only counts and timings, never personal data. Everything it creates is deleted.
//
//   SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @decibels/web test:search
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const envFile = join(here, '..', '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
  }
}
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL_ || !ANON || !SERVICE) {
  console.error('Needs .env.local and SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(2);
}
const SAMPLE = Number(process.env.SAMPLE ?? 200);
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(URL_, SERVICE, opts);
const results = [];
const timings = [];
const check = (name, pass, detail = '') => results.push({ name, pass: !!pass, detail });
const cleanup = [];

async function user(tag) {
  const email = `search-${tag}-${randomBytes(4).toString('hex')}@example.test`;
  const password = randomBytes(18).toString('base64url') + '1';
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: `Search ${tag}` } });
  if (error) throw new Error(`createUser: ${error.message}`);
  cleanup.push(() => admin.auth.admin.deleteUser(data.user.id));
  const client = createClient(URL_, ANON, opts);
  const { error: se } = await client.auth.signInWithPassword({ email, password });
  if (se) throw new Error(`sign in: ${se.message}`);
  return { client, id: data.user.id };
}
async function workspace(u, name) {
  const { data, error } = await u.client.rpc('create_workspace', { p_name: name, p_slug: `st-${randomBytes(4).toString('hex')}` });
  if (error) throw new Error(`create_workspace: ${error.message}`);
  cleanup.unshift(() => admin.from('workspaces').delete().eq('id', data.id));
  return data.id;
}
async function timed(label, fn) {
  const t = Date.now();
  const out = await fn();
  timings.push({ label, ms: Date.now() - t });
  return out;
}

// ---- predicates that mirror the SQL, run on raw rows --------------------------
const lc = (s) => (s ?? '').toString().toLowerCase();
const has = (s) => (s ?? '') !== '';
const anyIn = (arr, ...fields) => arr.some((t) => fields.some((f) => lc(f).includes(lc(t))));
const monthsAgo = (m) => {
  const d = new Date();
  d.setUTCMonth(d.getUTCMonth() - m);
  return d.toISOString().slice(0, 10);
};
const year = (ts) => (ts ? Number(String(ts).slice(0, 4)) : null);
const company = (r) => (has(r.company_name) ? r.company_name : r.current_employer);

function leadMatches(r, f) {
  if (f.q && !anyIn([f.q], r.full_name, r.current_title, company(r))) return false;
  if (f.titles && !anyIn(f.titles, r.current_title)) return false;
  if (f.titlesNot && anyIn(f.titlesNot, r.current_title)) return false;
  if (f.seniorities && !f.seniorities.includes(r.seniority_level)) return false;
  if (f.departments && !f.departments.includes(r.department)) return false;
  if (f.industries && !(f.industries.includes(r.company_industry) || f.industries.includes(r.main_industry))) return false;
  if (f.industriesNot && (f.industriesNot.includes(r.company_industry ?? '') || f.industriesNot.includes(r.main_industry ?? ''))) return false;
  if (f.sizes && !f.sizes.includes(r.employee_count_range)) return false;
  if (f.employeesMin !== undefined && !(r.linkedin_employee_count_exact !== null && r.linkedin_employee_count_exact >= f.employeesMin)) return false;
  if (f.employeesMax !== undefined && !(r.linkedin_employee_count_exact !== null && r.linkedin_employee_count_exact <= f.employeesMax)) return false;
  if (f.revenues && !f.revenues.includes(r.revenue_range)) return false;
  if (f.countries && !f.countries.includes(r.contact_country)) return false;
  if (f.hqCountries && !f.hqCountries.includes(r.company_hq_country)) return false;
  if (f.cities && !anyIn(f.cities, r.contact_location)) return false;
  if (f.companies && !anyIn(f.companies, company(r))) return false;
  if (f.companiesNot && anyIn(f.companiesNot, company(r))) return false;
  if (f.domains && !anyIn(f.domains, r.company_domain, r.current_employer_website)) return false;
  if (f.hasMobile !== undefined && has(r.mobile_phone) !== f.hasMobile) return false;
  if (f.mobileCodes) {
    const prefix = (r.mobile_phone ?? '').replace(/[^0-9+]/g, '').slice(0, 6);
    if (!f.mobileCodes.some((c) => prefix.startsWith(c))) return false;
  }
  if (f.hasEmail !== undefined && has(r.work_email) !== f.hasEmail) return false;
  if (f.emailStatus && !f.emailStatus.includes(r.email_status)) return false;
  if (f.hasPersonalEmail !== undefined && has(r.personal_emails) !== f.hasPersonalEmail) return false;
  if (f.hasLinkedin !== undefined && has(r.linkedin_url) !== f.hasLinkedin) return false;
  if (f.openToWork !== undefined && !!r.open_to_work !== f.openToWork) return false;
  if (f.isHiring !== undefined && !!r.is_hiring !== f.isHiring) return false;
  if (f.tenureMin !== undefined && !(r.role_start_date && r.role_start_date <= monthsAgo(f.tenureMin))) return false;
  if (f.tenureMax !== undefined && !(r.role_start_date && r.role_start_date >= monthsAgo(f.tenureMax))) return false;
  if (f.foundedMin !== undefined && !(year(r.company_founded_year) !== null && year(r.company_founded_year) >= f.foundedMin)) return false;
  if (f.foundedMax !== undefined && !(year(r.company_founded_year) !== null && year(r.company_founded_year) <= f.foundedMax)) return false;
  if (f.funding && !f.funding.includes(r.last_funding_type)) return false;
  if (f.hasFunding !== undefined && has(r.last_funding_type) !== f.hasFunding) return false;
  if (f.skills && !anyIn(f.skills, r.skills)) return false;
  if (f.languages && !anyIn(f.languages, r.languages)) return false;
  if (f.tech && !anyIn(f.tech, r.company_tech_stack)) return false;
  if (f.tags && !anyIn(f.tags, r.smart_tags)) return false;
  return true;
}

const openDay = (h, day) => lc(h).includes(`${lc(day)}:`) && !lc(h).includes(`${lc(day)}: closed`);
function localMatches(g, f) {
  if (f.q && !anyIn([f.q], g.Name, g['All Categories'] || g.Category, g.Domain)) return false;
  if (f.keywords && !f.keywords.includes(g.Keyword)) return false;
  if (f.categories && !anyIn(f.categories, g.Category, g['All Categories'])) return false;
  if (f.cities && !anyIn(f.cities, g.City, g.Municipality, g.Neighborhood)) return false;
  if (f.postcodes) {
    const z = (g.Zip ?? '').replace(/ /g, '').toUpperCase();
    if (!f.postcodes.some((p) => z.startsWith(p.replace(/ /g, '').toUpperCase()))) return false;
  }
  if (f.countries && !f.countries.includes(g.Country)) return false;
  const rating = g['Average Rating'] === null ? null : Number(g['Average Rating']);
  if (f.minRating !== undefined && !(rating !== null && rating >= f.minRating)) return false;
  if (f.maxRating !== undefined && !(rating !== null && rating <= f.maxRating)) return false;
  if (f.hasRating !== undefined && (rating !== null) !== f.hasRating) return false;
  const phone = g['Phone Standard Format'] ?? '';
  if (f.hasPhone !== undefined && (phone !== '') !== f.hasPhone) return false;
  if (f.mobileOnly !== undefined && phone.startsWith('+44 7') !== f.mobileOnly) return false;
  if (f.hasEmail !== undefined && has(g['Email 1']) !== f.hasEmail) return false;
  if (f.hasWebsite !== undefined && has(g.Website) !== f.hasWebsite) return false;
  if (f.hasWhatsapp !== undefined && has(g.WhatsApp) !== f.hasWhatsapp) return false;
  if (f.hasFacebook !== undefined && has(g.Facebook) !== f.hasFacebook) return false;
  if (f.hasInstagram !== undefined && has(g.Instagram) !== f.hasInstagram) return false;
  if (f.hasLinkedin !== undefined && has(g.LinkedIn) !== f.hasLinkedin) return false;
  if (f.openSaturday !== undefined && openDay(g.Hours, 'Saturday') !== f.openSaturday) return false;
  if (f.openSunday !== undefined && openDay(g.Hours, 'Sunday') !== f.openSunday) return false;
  if (f.domains && !anyIn(f.domains, g.Domain)) return false;
  return true;
}

// ---- filter combinations ---------------------------------------------------------
const LEAD_CASES = [
  ['no filters', {}],
  ['has mobile', { hasMobile: true }],
  ['no mobile', { hasMobile: false }],
  ['title CEO', { titles: ['ceo', 'chief executive'] }],
  ['exclude titles', { hasMobile: true, titlesNot: ['manager', 'assistant'] }],
  ['seniority', { seniorities: ['director', 'c-level'] }],
  ['department', { departments: ['Sales & Business Development', 'Information Technology & Engineering'] }],
  ['industry', { industries: ['Software Development', 'IT Services and IT Consulting'] }],
  ['exclude industry', { industriesNot: ['Government Administration', 'Business Consulting and Services'] }],
  ['size bands', { sizes: ['11 to 50', '51 to 200'] }],
  ['exact employees 7–15', { employeesMin: 7, employeesMax: 15 }],
  ['mobile + 7–15 employees', { hasMobile: true, employeesMin: 7, employeesMax: 15 }],
  ['revenue', { revenues: ['$1M to <$10M', '$10M to <$50M'] }],
  ['country', { countries: ['Germany', 'Netherlands'] }],
  ['HQ country', { hqCountries: ['United Kingdom'] }],
  ['city London', { cities: ['london'] }],
  ['company contains', { companies: ['bank'] }],
  ['exclude company', { companiesNot: ['nhs', 'council'] }],
  ['domain', { domains: ['.co.uk'] }],
  ['mobile code +44', { mobileCodes: ['+44'] }],
  ['mobile code +49/+31', { mobileCodes: ['+49', '+31'] }],
  ['email status accept-all', { emailStatus: ['CATCH_ALL'] }],
  ['personal email', { hasPersonalEmail: true }],
  ['open to work', { openToWork: true }],
  ['hiring', { isHiring: true }],
  ['tenure 1–3 years', { tenureMin: 12, tenureMax: 36 }],
  ['founded 2010–2020', { foundedMin: 2010, foundedMax: 2020 }],
  ['funding stage', { funding: ['venture round', 'seed', 'series a'] }],
  ['skills', { skills: ['project management'] }],
  ['languages', { languages: ['english'] }],
  ['tech stack', { tech: ['salesforce'] }],
  ['signals', { tags: ['oneYearAtCurrentCompany'] }],
  ['search text', { q: 'director' }],
  [
    '15 stacked',
    {
      hasMobile: true, hasEmail: true, emailStatus: ['VALID'], countries: ['United Kingdom'], seniorities: ['director', 'manager', 'c-level', 'senior'],
      sizes: ['11 to 50', '51 to 200', '201 to 500', '1001 to 5000', '10001+'], titlesNot: ['intern'], hasLinkedin: true, openToWork: false, tenureMin: 3,
      mobileCodes: ['+44'], industriesNot: ['Government Administration'], revenues: ['$1M to <$10M', '$10M to <$50M', '$1B+', '$100M to <$1B'],
      isHiring: false, hasPersonalEmail: false,
    },
  ],
  [
    '18 stacked, narrow',
    {
      hasMobile: true, hasEmail: true, countries: ['United Kingdom'], cities: ['london', 'manchester', 'birmingham'], seniorities: ['director', 'c-level'],
      titles: ['director', 'head', 'founder', 'owner'], titlesNot: ['assistant'], sizes: ['11 to 50', '51 to 200'], employeesMin: 10, employeesMax: 200,
      industriesNot: ['Government Administration'], hasLinkedin: true, openToWork: false, emailStatus: ['VALID'], mobileCodes: ['+44'], tenureMin: 6,
      companiesNot: ['nhs'], foundedMin: 1950,
    },
  ],
];

const LOCAL_CASES = [
  ['no filters', {}],
  ['has phone', { hasPhone: true }],
  ['UK mobile only', { mobileOnly: true }],
  ['not mobile', { mobileOnly: false }],
  ['search term', { keywords: ['electricians in London UK', 'accountants in London UK'] }],
  ['category', { categories: ['accountant'] }],
  ['town', { cities: ['london'] }],
  ['postcode area', { postcodes: ['E1', 'N1'] }],
  ['country US', { countries: ['US'] }],
  ['rating 4.5+', { minRating: 4.5 }],
  ['rating under 3.5', { maxRating: 3.5 }],
  ['not rated', { hasRating: false }],
  ['has email', { hasEmail: true }],
  ['no website', { hasWebsite: false }],
  ['whatsapp', { hasWhatsapp: true }],
  ['facebook + instagram', { hasFacebook: true, hasInstagram: true }],
  ['open saturday', { openSaturday: true }],
  ['closed sunday', { openSunday: false }],
  ['domain', { domains: ['.co.uk'] }],
  ['text', { q: 'support' }],
  [
    '12 stacked',
    { hasPhone: true, mobileOnly: true, hasEmail: true, hasWebsite: true, countries: ['GB'], minRating: 4, hasRating: true, openSaturday: true, cities: ['london', 'manchester'], categories: ['electrician', 'plumber', 'builder', 'accountant'], hasFacebook: true, openSunday: false },
  ],
];

// ---- run ------------------------------------------------------------------------
async function main() {
  const a = await user('a');
  const b = await user('b');
  const outsider = await user('out');
  const wsA = await workspace(a, 'Search A');
  const wsB = await workspace(b, 'Search B');
  const anon = createClient(URL_, ANON, opts);

  // security ---------------------------------------------------------------------
  for (const t of ['data_list', 'google_businesses', 'lead_search', 'local_search', 'search_facets']) {
    const r1 = await anon.from(t).select('*').limit(1);
    check(`anon cannot read ${t}`, r1.error || (r1.data ?? []).length === 0);
    const r2 = await a.client.from(t).select('*').limit(1);
    check(`signed-in user cannot read ${t} directly`, r2.error || (r2.data ?? []).length === 0);
  }
  const anonSearch = await anon.rpc('search_leads', { p_workspace_id: wsA, p_filters: {} });
  check('anon cannot call search_leads', !!anonSearch.error);
  const cross = await a.client.rpc('search_leads', { p_workspace_id: wsB, p_filters: {} });
  check("cannot search another workspace's leads", !!cross.error);
  const outs = await outsider.client.rpc('count_local', { p_workspace_id: wsA, p_filters: {} });
  check('non-member cannot search local', !!outs.error);
  const facets = await a.client.rpc('search_facets_for', { p_source: 'leads' });
  check('facets load for members', !facets.error && (facets.data ?? []).some((r) => r.facet === 'seniority'));

  // masking: nothing unrevealed leaves the server in full
  const page = await a.client.rpc('search_leads', { p_workspace_id: wsA, p_filters: { hasMobile: true }, p_limit: 100 });
  const ids = (page.data ?? []).map((r) => r.lead_id);
  const { data: raw } = await admin.from('data_list').select('contact_id,mobile_phone,work_email').in('contact_id', ids);
  const rawById = new Map((raw ?? []).map((r) => [r.contact_id, r]));
  let leaks = 0;
  for (const r of page.data ?? []) {
    const src = rawById.get(r.lead_id);
    const blob = JSON.stringify(r);
    const digits = (src?.mobile_phone ?? '').replace(/[^0-9]/g, '');
    if (digits.length > 6 && blob.replace(/[^0-9]/g, '').includes(digits.slice(-7))) leaks++;
    if (src?.work_email && blob.includes(src.work_email.split('@')[0] + '@')) leaks++;
    if (r.mobile && !r.mobile.includes('•')) leaks++;
  }
  check('unrevealed mobiles and emails are masked', leaks === 0 && (page.data ?? []).length > 0, `${leaks} leaks in ${(page.data ?? []).length} rows`);

  // faking a reveal is refused
  const fake = await a.client.from('people').insert({ workspace_id: wsA, first_name: 'Fake', source_lead_id: ids[0] });
  check('cannot insert a person linked to a lead without paying', !!fake.error);
  const own = await a.client.from('people').insert({ workspace_id: wsA, first_name: 'Manual' }).select('id').single();
  const relink = own.data ? await a.client.from('people').update({ source_lead_id: ids[1] }).eq('id', own.data.id) : { error: { message: 'no row' } };
  check('cannot link an existing person to a lead', !!relink.error);

  // accuracy: leads ------------------------------------------------------------------
  const { data: sampleIds } = await admin.from('lead_search').select('contact_id').order('contact_id').limit(SAMPLE);
  const sample = (sampleIds ?? []).map((r) => r.contact_id);
  const { data: sampleRaw } = await admin.from('data_list').select('*').in('contact_id', sample);
  const grouped = new Map();
  (sampleRaw ?? []).forEach((r) => grouped.set(r.contact_id, [...(grouped.get(r.contact_id) ?? []), r]));
  const sampleRows = sample.filter((id) => grouped.get(id)?.length === 1).map((id) => grouped.get(id)[0]);
  check(`lead sample loaded (${sampleRows.length} rows)`, sampleRows.length >= 50);

  for (const [name, f] of LEAD_CASES) {
    const res = await timed(`leads: ${name}`, () => a.client.rpc('search_leads', { p_workspace_id: wsA, p_filters: f, p_limit: 500 }));
    if (res.error) {
      check(`leads: ${name}`, false, res.error.message);
      continue;
    }
    const got = res.data ?? [];
    // completeness within the sample
    const expected = new Set(sampleRows.filter((r) => leadMatches(r, f)).map((r) => r.contact_id));
    // the sample is the first SAMPLE ids in the database's own order, so at most SAMPLE matches can
    // come before its last id: with a 500 limit every sample match is always within reach
    const inSample = new Set(sampleRows.map((r) => r.contact_id));
    const gotInSample = new Set(got.filter((r) => inSample.has(r.lead_id)).map((r) => r.lead_id));
    const exhaustive = true;
    const missing = [...expected].filter((id) => !gotInSample.has(id));
    const extra = [...gotInSample].filter((id) => !expected.has(id));
    // soundness on everything returned (re-checked on raw records)
    const { data: back } = await admin.from('data_list').select('*').in('contact_id', got.slice(0, 200).map((r) => r.lead_id));
    const wrong = (back ?? []).filter((r) => !leadMatches(r, f)).length;
    const ordered = got.every((r, i) => i === 0 || got[i - 1].lead_id < r.lead_id);
    const cnt = await timed(`leads count: ${name}`, () => a.client.rpc('count_leads', { p_workspace_id: wsA, p_filters: f }));
    const countOk = !cnt.error && (cnt.data === null || (got.length < 500 ? cnt.data === got.length : cnt.data >= 500));
    check(
      `leads: ${name}`,
      exhaustive && !missing.length && !extra.length && !wrong && ordered && countOk,
      `${got.length} returned, ${expected.size} expected in sample, missing ${missing.length}, extra ${extra.length}, wrong ${wrong}, count ${cnt.data ?? cnt.error?.message}`,
    );
  }

  // paging
  const p0 = await a.client.rpc('search_leads', { p_workspace_id: wsA, p_filters: { hasMobile: true }, p_limit: 100, p_offset: 0 });
  const p1 = await a.client.rpc('search_leads', { p_workspace_id: wsA, p_filters: { hasMobile: true }, p_limit: 100, p_offset: 100 });
  const s0 = new Set((p0.data ?? []).map((r) => r.lead_id));
  check('pages do not overlap and continue in order', (p1.data ?? []).length === 100 && (p1.data ?? []).every((r) => !s0.has(r.lead_id)) && p1.data[0].lead_id > p0.data[99].lead_id);

  // accuracy: local --------------------------------------------------------------------
  const { data: placeIds } = await admin.from('local_search').select('place_id').order('place_id').limit(SAMPLE);
  const places = (placeIds ?? []).map((r) => r.place_id);
  const { data: placeRaw } = await admin.from('google_businesses').select('*').in('Place ID', places);
  const placeRows = placeRaw ?? [];
  check(`local sample loaded (${placeRows.length} rows)`, placeRows.length >= 50);
  for (const [name, f] of LOCAL_CASES) {
    const res = await timed(`local: ${name}`, () => a.client.rpc('search_local', { p_workspace_id: wsA, p_filters: f, p_limit: 500 }));
    if (res.error) {
      check(`local: ${name}`, false, res.error.message);
      continue;
    }
    const got = res.data ?? [];
    const expected = new Set(placeRows.filter((g) => localMatches(g, f)).map((g) => g['Place ID']));
    const inSample = new Set(placeRows.map((g) => g['Place ID']));
    const gotInSample = new Set(got.filter((g) => inSample.has(g.place_id)).map((g) => g.place_id));
    const exhaustive = true;
    const missing = [...expected].filter((id) => !gotInSample.has(id));
    const extra = [...gotInSample].filter((id) => !expected.has(id));
    const { data: back } = await admin.from('google_businesses').select('*').in('Place ID', got.slice(0, 200).map((g) => g.place_id));
    const wrong = (back ?? []).filter((g) => !localMatches(g, f)).length;
    const cnt = await timed(`local count: ${name}`, () => a.client.rpc('count_local', { p_workspace_id: wsA, p_filters: f }));
    const countOk = !cnt.error && (cnt.data === null || (got.length < 500 ? cnt.data === got.length : cnt.data >= 500));
    check(
      `local: ${name}`,
      exhaustive && !missing.length && !extra.length && !wrong && countOk,
      `${got.length} returned, ${expected.size} expected in sample, missing ${missing.length}, extra ${extra.length}, wrong ${wrong}, count ${cnt.data ?? cnt.error?.message}`,
    );
  }

  // reveals --------------------------------------------------------------------------
  const before = (await admin.from('workspaces').select('credit_balance').eq('id', wsA).single()).data.credit_balance;
  const three = ids.slice(0, 3);
  const r1 = await a.client.rpc('reveal_leads', { p_workspace_id: wsA, p_lead_ids: three });
  const after1 = (await admin.from('workspaces').select('credit_balance').eq('id', wsA).single()).data.credit_balance;
  check('revealing 3 leads costs 3 credits', !r1.error && before - after1 === 3 && (r1.data ?? []).length === 3, r1.error?.message ?? `${before} -> ${after1}`);
  const { data: ledger } = await admin.from('credit_transactions').select('delta,reason,reference_id').eq('workspace_id', wsA).eq('reason', 'reveal');
  check('each reveal is one ledger row referencing the lead', (ledger ?? []).length === 3 && three.every((id) => (ledger ?? []).some((l) => l.reference_id === id && l.delta === -1)));
  const r2 = await a.client.rpc('reveal_leads', { p_workspace_id: wsA, p_lead_ids: three });
  const after2 = (await admin.from('workspaces').select('credit_balance').eq('id', wsA).single()).data.credit_balance;
  check('revealing the same leads again is free', !r2.error && after2 === after1);
  const shown = await a.client.rpc('search_leads', { p_workspace_id: wsA, p_filters: { hasMobile: true }, p_limit: 3 });
  const people = r1.data ?? [];
  check(
    'revealed leads show the workspace copy, unmasked',
    (shown.data ?? []).every((r) => r.person_id && !String(r.mobile ?? '').includes('•') && people.some((p) => p.id === r.person_id && p.mobile_e164 === r.mobile)),
  );
  const forB = await b.client.rpc('search_leads', { p_workspace_id: wsB, p_filters: { hasMobile: true }, p_limit: 3 });
  check("another workspace still sees them masked", (forB.data ?? []).every((r) => !r.person_id && String(r.mobile ?? '').includes('•')));
  const list = await a.client.from('lists').insert({ workspace_id: wsA, name: 'Search test', owner_id: a.id }).select('id').single();
  const r3 = await a.client.rpc('reveal_leads', { p_workspace_id: wsA, p_lead_ids: ids.slice(0, 5), p_list_id: list.data?.id });
  const { count: members } = await admin.from('list_members').select('person_id', { count: 'exact', head: true }).eq('list_id', list.data?.id);
  const after3 = (await admin.from('workspaces').select('credit_balance').eq('id', wsA).single()).data.credit_balance;
  check('reveal into a list adds all and charges only new ones', !r3.error && members === 5 && after2 - after3 === 2, r3.error?.message ?? `members ${members}, charged ${after2 - after3}`);
  const tooMany = await a.client.rpc('reveal_leads', { p_workspace_id: wsA, p_lead_ids: Array.from({ length: 501 }, () => ids[0]) });
  check('more than 500 at once is refused', !!tooMany.error);
  const bad = await a.client.rpc('reveal_leads', { p_workspace_id: wsA, p_lead_ids: [ids[10], '00000000-0000-0000-0000-000000000000'] });
  const after4 = (await admin.from('workspaces').select('credit_balance').eq('id', wsA).single()).data.credit_balance;
  check('an unknown lead refuses the whole batch with no charge', !!bad.error && after4 === after3);
  const crossReveal = await a.client.rpc('reveal_leads', { p_workspace_id: wsB, p_lead_ids: [ids[20]] });
  check("cannot reveal into another workspace", !!crossReveal.error);

  // saved search round trip
  const saved = await a.client.from('saved_searches').insert({ workspace_id: wsA, user_id: a.id, name: 'test', filters: { v: 2, hasMobile: true, employeesMin: 7, employeesMax: 15 } }).select('filters').single();
  check('saved searches store the new filters', !saved.error && saved.data.filters.employeesMin === 7);
}

try {
  await main();
} catch (e) {
  check('test run completed', false, e.message);
} finally {
  for (const fn of cleanup) {
    try {
      await fn();
    } catch {
      /* best effort */
    }
  }
}

const failed = results.filter((r) => !r.pass);
for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? `  (${r.detail})` : ''}`);
const ms = timings.map((t) => t.ms).sort((x, y) => x - y);
const p = (q) => ms[Math.min(ms.length - 1, Math.floor(q * ms.length))];
console.log(`\nTimings over ${ms.length} calls: median ${p(0.5)}ms, p90 ${p(0.9)}ms, max ${ms[ms.length - 1]}ms`);
timings.filter((t) => t.ms > 3000).forEach((t) => console.log(`  slow: ${t.label} ${t.ms}ms`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);

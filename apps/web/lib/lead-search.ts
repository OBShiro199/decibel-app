// Search over the real lead tables: data_list (people at companies) and google_businesses
// (local listings). Filters are plain JSON objects whose keys match the database functions
// (search_leads / search_local, migrations 0017–0019), so what the browser builds is exactly
// what the server filters on. Every filter stacks with AND; values inside one filter are OR.
'use client';
import { queryOptions } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase/client';

export const PAGE_SIZE = 100;
/** count_leads / count_local count exactly up to this, then report "10,000+" */
export const COUNT_CAP = 10000;

// ---- filter definitions ------------------------------------------------------

export type FilterKind = 'pills' | 'multi' | 'bool' | 'range';
export interface FilterDef {
  key: string;
  label: string;
  group: string;
  kind: FilterKind;
  /** multi: facet name to load options from; pills: facet used for suggestions */
  facet?: string;
  /** fixed options, in this order (overrides facet ordering) */
  order?: string[];
  placeholder?: string;
  /** range: the two keys it writes, a unit for the chip, and quick presets */
  range?: { min: string; max: string; unit?: string; step?: number; presets?: { label: string; min?: number; max?: number }[] };
  /** bool: wording for true/false */
  yes?: string;
  no?: string;
  hint?: string;
}

export const SIZE_ORDER = ['1 to 10', '11 to 50', '51 to 200', '201 to 500', '501 to 1000', '1001 to 5000', '5001 to 10000', '10001+'];
export const REVENUE_ORDER = ['<$1M', '$1M to <$10M', '$10M to <$50M', '$50M to <$100M', '$100M to <$1B', '$1B+'];
export const SENIORITY_ORDER = ['c-level', 'vp', 'director', 'manager', 'senior', 'junior', 'unknown'];

export const LEAD_FILTERS: FilterDef[] = [
  // person
  { key: 'titles', label: 'Job title', group: 'Person', kind: 'pills', placeholder: 'CEO, Head of Sales, IT Manager…', hint: 'Matches any title containing a word you add. CEO also finds Chief Executive.' },
  { key: 'titlesNot', label: 'Exclude titles', group: 'Person', kind: 'pills', placeholder: 'Intern, Assistant…' },
  { key: 'seniorities', label: 'Seniority', group: 'Person', kind: 'multi', facet: 'seniority', order: SENIORITY_ORDER },
  { key: 'departments', label: 'Department', group: 'Person', kind: 'multi', facet: 'department' },
  {
    key: 'tenure',
    label: 'Time in role',
    group: 'Person',
    kind: 'range',
    range: {
      min: 'tenureMin',
      max: 'tenureMax',
      unit: 'months',
      presets: [
        { label: 'New in role (under 6 months)', max: 6 },
        { label: '6 to 12 months', min: 6, max: 12 },
        { label: '1 to 3 years', min: 12, max: 36 },
        { label: 'Over 3 years', min: 36 },
      ],
    },
  },
  { key: 'skills', label: 'Skills', group: 'Person', kind: 'pills', placeholder: 'Salesforce, Cyber security…' },
  { key: 'languages', label: 'Languages', group: 'Person', kind: 'pills', placeholder: 'German, French…' },
  { key: 'openToWork', label: 'Open to work', group: 'Person', kind: 'bool', yes: 'Open to work', no: 'Not open to work' },
  // company
  { key: 'companies', label: 'Company name', group: 'Company', kind: 'pills', placeholder: 'Barclays, Ocado…' },
  { key: 'companiesNot', label: 'Exclude companies', group: 'Company', kind: 'pills', placeholder: 'Competitors, current customers…' },
  { key: 'domains', label: 'Company domain', group: 'Company', kind: 'pills', placeholder: 'acme.co.uk' },
  { key: 'industries', label: 'Industry', group: 'Company', kind: 'multi', facet: 'industry' },
  { key: 'industriesNot', label: 'Exclude industries', group: 'Company', kind: 'multi', facet: 'industry' },
  { key: 'sizes', label: 'Company size', group: 'Company', kind: 'multi', facet: 'size', order: SIZE_ORDER },
  {
    key: 'employees',
    label: 'Exact employee count',
    group: 'Company',
    kind: 'range',
    range: { min: 'employeesMin', max: 'employeesMax', unit: 'employees', presets: [{ label: '7 to 15', min: 7, max: 15 }, { label: '20 to 100', min: 20, max: 100 }, { label: '100 to 500', min: 100, max: 500 }] },
    hint: 'Uses the exact LinkedIn headcount where we have it.',
  },
  { key: 'revenues', label: 'Revenue', group: 'Company', kind: 'multi', facet: 'revenue', order: REVENUE_ORDER },
  { key: 'founded', label: 'Year founded', group: 'Company', kind: 'range', range: { min: 'foundedMin', max: 'foundedMax', presets: [{ label: 'Last 5 years', min: new Date().getFullYear() - 5 }, { label: '2010 to 2020', min: 2010, max: 2020 }, { label: 'Before 2000', max: 1999 }] } },
  { key: 'hqCountries', label: 'Company HQ country', group: 'Company', kind: 'multi', facet: 'hq_country' },
  { key: 'isHiring', label: 'Hiring now', group: 'Company', kind: 'bool', yes: 'Hiring', no: 'Not hiring' },
  { key: 'funding', label: 'Funding stage', group: 'Company', kind: 'multi', facet: 'funding' },
  { key: 'hasFunding', label: 'Has raised funding', group: 'Company', kind: 'bool', yes: 'Has funding', no: 'No funding' },
  { key: 'tech', label: 'Tech stack', group: 'Company', kind: 'pills', placeholder: 'HubSpot, Azure, Shopify…' },
  // location
  { key: 'countries', label: 'Country', group: 'Location', kind: 'multi', facet: 'country' },
  { key: 'cities', label: 'City or region', group: 'Location', kind: 'pills', placeholder: 'London, Manchester…' },
  // contact data
  { key: 'hasMobile', label: 'Has mobile', group: 'Contact data', kind: 'bool', yes: 'Has mobile', no: 'No mobile' },
  { key: 'mobileCodes', label: 'Mobile country code', group: 'Contact data', kind: 'multi', facet: 'mobile_code' },
  { key: 'hasEmail', label: 'Has work email', group: 'Contact data', kind: 'bool', yes: 'Has work email', no: 'No work email' },
  { key: 'emailStatus', label: 'Email status', group: 'Contact data', kind: 'multi', facet: 'email_status' },
  { key: 'hasPersonalEmail', label: 'Has personal email', group: 'Contact data', kind: 'bool', yes: 'Has personal email', no: 'No personal email' },
  { key: 'hasLinkedin', label: 'Has LinkedIn', group: 'Contact data', kind: 'bool', yes: 'Has LinkedIn', no: 'No LinkedIn' },
  // signals
  { key: 'tags', label: 'Signals', group: 'Signals', kind: 'multi', facet: 'tag', hint: 'Career and company signals, such as one year at the company.' },
];

export const LOCAL_FILTERS: FilterDef[] = [
  { key: 'keywords', label: 'Search term', group: 'Business', kind: 'multi', facet: 'keyword', hint: 'The search the listing was found under, e.g. electricians in London.' },
  { key: 'categories', label: 'Category', group: 'Business', kind: 'multi', facet: 'category', hint: 'Matches the main category or any secondary one.' },
  { key: 'domains', label: 'Website domain', group: 'Business', kind: 'pills', placeholder: 'taxassist.co.uk' },
  { key: 'cities', label: 'Town or area', group: 'Location', kind: 'pills', facet: 'city', placeholder: 'London, Shoreditch…' },
  { key: 'postcodes', label: 'Postcode area', group: 'Location', kind: 'pills', placeholder: 'E1, N14, M1…', hint: 'Matches the start of the postcode.' },
  { key: 'countries', label: 'Country', group: 'Location', kind: 'multi', facet: 'country' },
  {
    key: 'rating',
    label: 'Rating',
    group: 'Reputation',
    kind: 'range',
    range: { min: 'minRating', max: 'maxRating', unit: '★', step: 0.1, presets: [{ label: '4.5 and above', min: 4.5 }, { label: '4.0 and above', min: 4 }, { label: 'Below 3.5', max: 3.5 }] },
  },
  { key: 'hasRating', label: 'Has a rating', group: 'Reputation', kind: 'bool', yes: 'Rated', no: 'Not rated' },
  { key: 'hasPhone', label: 'Has phone', group: 'Contact', kind: 'bool', yes: 'Has phone', no: 'No phone' },
  { key: 'mobileOnly', label: 'Mobile number', group: 'Contact', kind: 'bool', yes: 'UK mobile', no: 'Not a mobile', hint: 'Numbers starting +44 7.' },
  { key: 'hasEmail', label: 'Has email', group: 'Contact', kind: 'bool', yes: 'Has email', no: 'No email' },
  { key: 'hasWebsite', label: 'Has website', group: 'Contact', kind: 'bool', yes: 'Has website', no: 'No website' },
  { key: 'hasWhatsapp', label: 'WhatsApp', group: 'Contact', kind: 'bool', yes: 'On WhatsApp', no: 'No WhatsApp' },
  { key: 'hasFacebook', label: 'Facebook page', group: 'Social', kind: 'bool', yes: 'Has Facebook', no: 'No Facebook' },
  { key: 'hasInstagram', label: 'Instagram', group: 'Social', kind: 'bool', yes: 'Has Instagram', no: 'No Instagram' },
  { key: 'hasLinkedin', label: 'LinkedIn page', group: 'Social', kind: 'bool', yes: 'Has LinkedIn', no: 'No LinkedIn' },
  { key: 'openSaturday', label: 'Open Saturday', group: 'Hours', kind: 'bool', yes: 'Open Saturday', no: 'Closed Saturday' },
  { key: 'openSunday', label: 'Open Sunday', group: 'Hours', kind: 'bool', yes: 'Open Sunday', no: 'Closed Sunday' },
];

export type Filters = Record<string, unknown>;

/** True when a filter definition has a value set. */
export function isSet(def: FilterDef, f: Filters): boolean {
  if (def.kind === 'range') return typeof f[def.range!.min] === 'number' || typeof f[def.range!.max] === 'number';
  const v = f[def.key];
  return Array.isArray(v) ? v.length > 0 : typeof v === 'boolean';
}

export function clearFilter(def: FilterDef, f: Filters): Filters {
  const next = { ...f };
  if (def.kind === 'range') {
    delete next[def.range!.min];
    delete next[def.range!.max];
  } else delete next[def.key];
  return next;
}

export const countSet = (defs: FilterDef[], f: Filters) => defs.filter((d) => isSet(d, f)).length;

// "CEO" also finds "Chief Executive" etc.
const TITLE_SYNONYMS: Record<string, string[]> = {
  ceo: ['chief executive'],
  cto: ['chief technology', 'chief technical'],
  cfo: ['chief financial', 'finance director'],
  coo: ['chief operating', 'operations director'],
  cmo: ['chief marketing'],
  cro: ['chief revenue'],
  cio: ['chief information'],
  ciso: ['chief information security'],
  md: ['managing director'],
  vp: ['vice president'],
  hr: ['human resources', 'people'],
  founder: ['co-founder', 'owner'],
};

/** What is sent to the server: drops empty values and expands title abbreviations. */
export function toServer(f: Filters, q: string): Filters {
  const out: Filters = {};
  for (const [k, v] of Object.entries(f)) {
    if (Array.isArray(v) ? v.length : v !== undefined && v !== null && v !== '') out[k] = v;
  }
  if (Array.isArray(out.titles)) {
    const set = new Set<string>();
    (out.titles as string[]).forEach((t) => {
      set.add(t);
      (TITLE_SYNONYMS[t.trim().toLowerCase()] ?? []).forEach((s) => set.add(s));
    });
    out.titles = [...set];
  }
  if (q.trim()) out.q = q.trim();
  return out;
}

/** Saved searches from before this filter model (contacts sample data) map across where they can. */
export function fromSaved(raw: Record<string, unknown>): { filters: Filters; q: string } {
  if (raw.v === 2) {
    const { v: _v, q, ...rest } = raw;
    return { filters: rest, q: typeof q === 'string' ? q : '' };
  }
  const f: Filters = {};
  if (Array.isArray(raw.titles)) f.titles = raw.titles;
  if (raw.hasMobile === true) f.hasMobile = true;
  if (raw.hasEmail === true) f.hasEmail = true;
  if (Array.isArray(raw.seniorities)) f.seniorities = (raw.seniorities as string[]).map((s) => (s === 'c_level' ? 'c-level' : s === 'ic' ? 'senior' : s));
  return { filters: f, q: typeof raw.q === 'string' ? raw.q : '' };
}

// ---- rows ------------------------------------------------------------------

export interface LeadRow {
  lead_id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  current_title: string | null;
  seniority_level: string | null;
  department: string | null;
  role_start_date: string | null;
  company_name: string | null;
  company_domain: string | null;
  company_industry: string | null;
  main_industry: string | null;
  employee_count_range: string | null;
  employee_count: number | null;
  revenue_range: string | null;
  company_founded: number | null;
  company_hq_country: string | null;
  contact_country: string | null;
  contact_city: string | null;
  contact_location: string | null;
  linkedin_url: string | null;
  has_mobile: boolean;
  mobile: string | null;
  has_email: boolean;
  email: string | null;
  email_status: string | null;
  has_personal_email: boolean;
  open_to_work: boolean;
  is_hiring: boolean;
  last_funding_type: string | null;
  total_funding_amount: string | null;
  smart_tags: string | null;
  person_id: string | null;
}

export interface LocalRow {
  place_id: string;
  name: string | null;
  category: string | null;
  all_categories: string | null;
  keyword: string | null;
  phone: string | null;
  has_mobile: boolean;
  whatsapp: string | null;
  email: string | null;
  all_emails: string | null;
  website: string | null;
  domain: string | null;
  facebook: string | null;
  instagram: string | null;
  linkedin: string | null;
  address: string | null;
  street: string | null;
  neighbourhood: string | null;
  city: string | null;
  postcode: string | null;
  country: string | null;
  rating: number | null;
  review_url: string | null;
  hours: string | null;
  maps_url: string | null;
  logo_url: string | null;
}

// ---- queries ----------------------------------------------------------------

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase().rpc(fn, args);
  if (error) throw new Error(error.message.includes('statement timeout') ? 'That search took too long. Add a more specific filter and try again.' : error.message);
  return data as T;
}

export const leadSearchQuery = (workspaceId: string, filters: Filters, page: number) =>
  queryOptions({
    queryKey: ['lead-search', workspaceId, filters, page],
    staleTime: 60_000,
    queryFn: () => rpc<LeadRow[]>('search_leads', { p_workspace_id: workspaceId, p_filters: filters, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE }),
  });

export const leadCountQuery = (workspaceId: string, filters: Filters) =>
  queryOptions({
    queryKey: ['lead-count', workspaceId, filters],
    staleTime: 5 * 60_000,
    queryFn: () => rpc<number | null>('count_leads', { p_workspace_id: workspaceId, p_filters: filters }),
  });

export const localSearchQuery = (workspaceId: string, filters: Filters, page: number) =>
  queryOptions({
    queryKey: ['local-search', workspaceId, filters, page],
    staleTime: 60_000,
    queryFn: () => rpc<LocalRow[]>('search_local', { p_workspace_id: workspaceId, p_filters: filters, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE }),
  });

export const localCountQuery = (workspaceId: string, filters: Filters) =>
  queryOptions({
    queryKey: ['local-count', workspaceId, filters],
    staleTime: 5 * 60_000,
    queryFn: () => rpc<number | null>('count_local', { p_workspace_id: workspaceId, p_filters: filters }),
  });

export type Facets = Record<string, { value: string; n: number }[]>;
export const facetsQuery = (source: 'leads' | 'local') =>
  queryOptions({
    queryKey: ['search-facets', source],
    staleTime: 30 * 60_000,
    queryFn: async () => {
      const rows = await rpc<{ facet: string; value: string; n: number }[]>('search_facets_for', { p_source: source });
      const out: Facets = {};
      rows.forEach((r) => (out[r.facet] ??= []).push({ value: r.value, n: Number(r.n) }));
      return out;
    },
  });

/** All matching ids (up to 500) for "export / save all filtered". */
export async function leadIdsForFilters(workspaceId: string, filters: Filters, limit: number): Promise<LeadRow[]> {
  return rpc<LeadRow[]>('search_leads', { p_workspace_id: workspaceId, p_filters: filters, p_limit: Math.min(limit, 500), p_offset: 0 });
}
export async function localRowsForFilters(workspaceId: string, filters: Filters, limit: number): Promise<LocalRow[]> {
  return rpc<LocalRow[]>('search_local', { p_workspace_id: workspaceId, p_filters: filters, p_limit: Math.min(limit, 500), p_offset: 0 });
}

/**
 * The match count for the toolbar. Counts are exact up to 10,000; a count that took too long
 * comes back null, and then the page shows what it knows ("100+" when a full page loaded).
 */
export function formatCount(n: number | null | undefined, shown = 0): string {
  if (n === undefined) return '…';
  if (n === null) return shown >= PAGE_SIZE ? `${shown.toLocaleString('en-GB')}+` : shown.toLocaleString('en-GB');
  return n > COUNT_CAP ? `${COUNT_CAP.toLocaleString('en-GB')}+` : n.toLocaleString('en-GB');
}

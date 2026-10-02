// Lead-database search: one filter shape shared by the Leads page, the ICP
// step in onboarding, saved searches and the Today suggestions.
import type { CompanySizeBand, Seniority } from '@/lib/types';

export interface LeadFilters {
  q?: string;
  countries?: string[];
  industries?: string[];
  sizes?: CompanySizeBand[];
  titles?: string[];
  seniorities?: Seniority[];
  departments?: string[];
  city?: string;
  hasMobile?: boolean;
  hasEmail?: boolean;
  tpsClear?: boolean;
}

export const EMPTY_FILTERS: LeadFilters = { hasMobile: true };

export const DEPARTMENTS = ['Executive', 'Sales', 'Operations', 'Engineering', 'Marketing', 'Finance', 'HR'];

// Common abbreviations so "CEO" also finds "Chief Executive Officer".
const TITLE_SYNONYMS: Record<string, string[]> = {
  ceo: ['chief executive'],
  cto: ['chief technology'],
  cfo: ['chief financial', 'finance director'],
  coo: ['chief operating', 'operations director'],
  cmo: ['chief marketing'],
  md: ['managing director'],
  founder: ['owner', 'co-founder'],
  vp: ['vice president'],
};

/** PostgREST or() values cannot contain commas or parentheses. */
const clean = (s: string) => s.replace(/[,()%*\\]/g, ' ').trim();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyLeadFilters<Q extends Record<string, any>>(query: Q, f: LeadFilters): Q {
  let q = query;
  const text = clean(f.q ?? '');
  if (text) q = q.or(`full_name.ilike.%${text}%,company_name.ilike.%${text}%,job_title.ilike.%${text}%`);
  if (f.countries?.length) q = q.in('country_code', f.countries);
  if (f.industries?.length) q = q.in('industry', f.industries);
  if (f.sizes?.length) q = q.in('company_size_band', f.sizes);
  if (f.seniorities?.length) q = q.in('seniority', f.seniorities);
  if (f.departments?.length) q = q.in('department', f.departments);
  const titles = (f.titles ?? []).map(clean).filter(Boolean);
  if (titles.length) {
    const patterns = new Set<string>();
    titles.forEach((t) => {
      patterns.add(t);
      (TITLE_SYNONYMS[t.toLowerCase()] ?? []).forEach((s) => patterns.add(s));
    });
    q = q.or([...patterns].map((p) => `job_title.ilike.%${p}%`).join(','));
  }
  const city = clean(f.city ?? '');
  if (city) q = q.or(`city.ilike.%${city}%,region.ilike.%${city}%`);
  if (f.hasMobile) q = q.eq('has_mobile', true);
  if (f.hasEmail) q = q.eq('has_email', true);
  if (f.tpsClear) q = q.eq('tps_status', 'clear');
  return q;
}

export function countActiveFilters(f: LeadFilters): number {
  return (
    (f.q ? 1 : 0) +
    (f.countries?.length ? 1 : 0) +
    (f.industries?.length ? 1 : 0) +
    (f.sizes?.length ? 1 : 0) +
    (f.titles?.length ? 1 : 0) +
    (f.seniorities?.length ? 1 : 0) +
    (f.departments?.length ? 1 : 0) +
    (f.city ? 1 : 0) +
    (f.hasMobile ? 1 : 0) +
    (f.hasEmail ? 1 : 0) +
    (f.tpsClear ? 1 : 0)
  );
}

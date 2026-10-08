// Search with AI: the prompt, output schema and sanitiser for turning a sentence into the
// filters Leads (search_leads) and Local businesses (search_local) understand.
//
// Claude only ever proposes filters. Everything it returns is re-checked here against the
// filter whitelist and the real values in the data (search_facets) before it reaches the
// database or the browser, so a confused or manipulated answer can only ever produce an
// ordinary, valid search.

export type Mode = 'leads' | 'local';
export type Facets = Record<string, string[]>;
export type Filters = Record<string, unknown>;

// ---- filter whitelist (keys match lib/lead-search.ts and the RPCs) --------------------
type Kind = 'text' | 'enum' | 'bool' | 'int' | 'num';
interface Field { kind: Kind; facet?: string; min?: number; max?: number; describe: string }

export const LEAD_FIELDS: Record<string, Field> = {
  titles: { kind: 'text', describe: 'Job title words or phrases; a lead matches if its title contains ANY of them. Include common variants (e.g. "CEO", "Chief Executive"; "Head of Sales", "Sales Director").' },
  titlesNot: { kind: 'text', describe: 'Title words to exclude, e.g. "assistant", "intern".' },
  seniorities: { kind: 'enum', facet: 'seniority', describe: 'Seniority levels.' },
  departments: { kind: 'enum', facet: 'department', describe: 'Departments.' },
  industries: { kind: 'enum', facet: 'industry', describe: 'Company industries (pick every value that fits the request, e.g. software → "Software Development", "IT Services and IT Consulting", "Technology; Information and Internet").' },
  industriesNot: { kind: 'enum', facet: 'industry', describe: 'Industries to exclude.' },
  sizes: { kind: 'enum', facet: 'size', describe: 'Employee-count bands. Use only for vague sizes ("small", "SMEs", "enterprise"); for numbers use employeesMin/employeesMax.' },
  employeesMin: { kind: 'int', min: 1, max: 1000000, describe: 'Minimum exact headcount, for numeric ranges like "50-100 employees".' },
  employeesMax: { kind: 'int', min: 1, max: 1000000, describe: 'Maximum exact headcount.' },
  revenues: { kind: 'enum', facet: 'revenue', describe: 'Revenue bands.' },
  countries: { kind: 'enum', facet: 'country', describe: 'Country the person is based in.' },
  hqCountries: { kind: 'enum', facet: 'hq_country', describe: 'Country of the company headquarters.' },
  cities: { kind: 'text', describe: 'City or region names the person is located in, e.g. "London", "Manchester", "Greater London".' },
  companies: { kind: 'text', describe: 'Company names (or parts of names) to include.' },
  companiesNot: { kind: 'text', describe: 'Company names to exclude.' },
  domains: { kind: 'text', describe: 'Company website domains or parts, e.g. ".co.uk".' },
  hasMobile: { kind: 'bool', describe: 'true when the user wants people with a mobile number ("with a mobile", "who I can call").' },
  mobileCodes: { kind: 'enum', facet: 'mobile_code', describe: 'Mobile dial codes, e.g. "+44" for UK mobiles.' },
  hasEmail: { kind: 'bool', describe: 'true when the user wants a work email.' },
  emailStatus: { kind: 'enum', facet: 'email_status', describe: 'Email verification status.' },
  hasPersonalEmail: { kind: 'bool', describe: 'Has a personal email.' },
  hasLinkedin: { kind: 'bool', describe: 'Has a LinkedIn profile.' },
  openToWork: { kind: 'bool', describe: 'Person is open to work.' },
  isHiring: { kind: 'bool', describe: 'Company is hiring now.' },
  tenureMin: { kind: 'int', min: 0, max: 600, describe: 'Minimum months in current role ("over 2 years" → 24).' },
  tenureMax: { kind: 'int', min: 0, max: 600, describe: 'Maximum months in current role ("new in role" → 6).' },
  foundedMin: { kind: 'int', min: 1700, max: 2100, describe: 'Earliest company founding year.' },
  foundedMax: { kind: 'int', min: 1700, max: 2100, describe: 'Latest company founding year.' },
  funding: { kind: 'enum', facet: 'funding', describe: 'Last funding round type.' },
  hasFunding: { kind: 'bool', describe: 'Company has raised funding ("VC-backed", "funded").' },
  skills: { kind: 'text', describe: 'Skills listed on the profile.' },
  languages: { kind: 'text', describe: 'Languages the person speaks.' },
  tech: { kind: 'text', describe: 'Technologies in the company tech stack, e.g. "HubSpot", "Salesforce", "AWS".' },
  tags: { kind: 'enum', facet: 'tag', describe: 'Career and company signals.' },
};

export const LOCAL_FIELDS: Record<string, Field> = {
  keywords: { kind: 'enum', facet: 'keyword', describe: 'Exact search terms the listings were collected under (only when one clearly matches).' },
  categories: { kind: 'text', describe: 'Business category words; matches the main or any secondary category containing ANY of them. Use singular trade words, e.g. "plumber", "electrician", "accountant", "dentist", "cafe".' },
  domains: { kind: 'text', describe: 'Website domains or parts.' },
  cities: { kind: 'text', describe: 'Town, city or area names, e.g. "London", "Shoreditch", "Leeds".' },
  postcodes: { kind: 'text', describe: 'UK postcode areas or districts (start of the postcode), e.g. "E1", "M1", "LS".' },
  countries: { kind: 'enum', facet: 'country', describe: 'Country code of the listing.' },
  minRating: { kind: 'num', min: 0, max: 5, describe: 'Minimum Google rating, 0–5 ("well reviewed" → 4.5).' },
  maxRating: { kind: 'num', min: 0, max: 5, describe: 'Maximum Google rating ("poorly rated" → 3.5).' },
  hasRating: { kind: 'bool', describe: 'Has a Google rating.' },
  hasPhone: { kind: 'bool', describe: 'true when the user wants businesses they can call.' },
  mobileOnly: { kind: 'bool', describe: 'true when the user wants a UK mobile number (+44 7).' },
  hasEmail: { kind: 'bool', describe: 'Has an email address.' },
  hasWebsite: { kind: 'bool', describe: 'false for "no website" (e.g. selling web design), true for "has a website".' },
  hasWhatsapp: { kind: 'bool', describe: 'On WhatsApp.' },
  hasFacebook: { kind: 'bool', describe: 'Has a Facebook page.' },
  hasInstagram: { kind: 'bool', describe: 'Has an Instagram account.' },
  hasLinkedin: { kind: 'bool', describe: 'Has a LinkedIn page.' },
  openSaturday: { kind: 'bool', describe: 'Open on Saturdays.' },
  openSunday: { kind: 'bool', describe: 'Open on Sundays.' },
};

const fieldsFor = (m: Mode) => (m === 'leads' ? LEAD_FIELDS : LOCAL_FIELDS);

// ---- output schema --------------------------------------------------------------
function filterSchema(fields: Record<string, Field>) {
  const properties: Record<string, unknown> = {};
  for (const [k, f] of Object.entries(fields)) {
    const t = f.kind === 'text' || f.kind === 'enum' ? { type: ['array', 'null'], items: { type: 'string' } } : f.kind === 'bool' ? { type: ['boolean', 'null'] } : f.kind === 'int' ? { type: ['integer', 'null'] } : { type: ['number', 'null'] };
    properties[k] = { ...t, description: f.describe };
  }
  return { type: 'object', additionalProperties: false, required: Object.keys(fields), properties };
}

export const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['suggested_mode', 'mode_reason', 'title', 'summary', 'notes', 'leads', 'local'],
  properties: {
    suggested_mode: { type: 'string', enum: ['leads', 'local'], description: 'Which database fits the request best.' },
    mode_reason: { type: 'string', description: 'One short sentence on why, written to the user (no jargon).' },
    title: { type: 'string', description: 'A short list name, under 60 characters, e.g. "Software CEOs, 50–100 staff, with mobiles".' },
    summary: { type: 'string', description: 'One plain sentence describing exactly what is being searched for.' },
    notes: { type: 'array', items: { type: 'string' }, description: 'Parts of the request that cannot be expressed with these filters, each as a short sentence. Empty if none.' },
    leads: filterSchema(LEAD_FIELDS),
    local: filterSchema(LOCAL_FIELDS),
  },
} as const;

// ---- system prompt (stable per facet snapshot, so it caches) --------------------------
const list = (v: string[] | undefined, n: number) => (v ?? []).slice(0, n).map((x) => `- ${x}`).join('\n');

export function systemPrompt(facets: { leads: Facets; local: Facets }): string {
  const L = facets.leads;
  const G = facets.local;
  return `You turn a sales rep's request into search filters for Decibel, a UK and EU outbound sales tool. You never answer in prose: you only return the JSON object described by the schema.

There are two databases:
1. "leads": B2B decision-makers (people at companies), about 690,000, mostly UK, also Germany, Netherlands, Italy, France and more. Each has a job title, seniority, department, company, industry, headcount, revenue, location, and often a mobile and work email.
2. "local": local businesses from map listings, about 365,000, mostly UK (GB) with some US. Each has a name, category, town, postcode, Google rating, phone, email, website, social links and opening hours. There are no people or job titles here.

How to choose suggested_mode:
- Requests about people, job titles, roles, decision-makers, companies by industry or headcount → "leads".
- Requests about trades, shops, venues, local services, high-street or map-style businesses (plumbers, cafés, dentists, salons, garages, electricians, gyms, estate agents in a town) → "local".
- If both could work, prefer the mode the user selected.

Fill filters for the selected mode, always. If suggested_mode differs from the selected mode, ALSO fill the other mode's filters so the user can switch without asking again. Leave every filter you do not need as null. Never invent filters the request did not ask for, except: when the user asks for people "with a mobile" or "to call", set hasMobile true (leads) or hasPhone true (local).

Rules for leads:
- Job titles: put the role words in titles, with common variants and abbreviations (CEO → "CEO", "Chief Executive"; founder → "Founder", "Co-Founder", "Owner"; MD → "Managing Director"; IT manager → "IT Manager", "Head of IT", "IT Director"). Use seniorities as well only when the request is about a level ("directors", "C-level", "senior people") rather than a specific role.
- Headcount numbers ("50-100 employees", "over 200 staff") go in employeesMin/employeesMax. Use sizes only for vague words ("small companies" → 1 to 10 and 11 to 50, "SMEs" → 11 to 50, 51 to 200, 201 to 500, "enterprise" → 1001 to 5000, 5001 to 10000, 10001+).
- Locations: a country goes in countries (exact value from the list); a city or region goes in cities ("London" → "London").
- Pick industries only from the list below, choosing every value that fits.
- Enum filters must use values exactly as written in the lists below.

Rules for local:
- Trades and business types go in categories as simple singular words ("plumbing companies" → "plumber"; "coffee shops" → "cafe", "coffee shop").
- Towns and areas go in cities; postcode areas go in postcodes. "UK" means countries ["GB"].
- "No website" → hasWebsite false. "Mobile number" → mobileOnly true. "Good reviews" / "well rated" → minRating 4.5.

Write title and summary in plain British English, sentence case, no emoji.

Allowed values for leads:
seniorities:
${list(L.seniority, 20)}
departments:
${list(L.department, 40)}
sizes:
${list(L.size, 20)}
revenues:
${list(L.revenue, 20)}
countries:
${list(L.country, 60)}
hqCountries:
${list(L.hq_country, 60)}
emailStatus:
${list(L.email_status, 10)}
funding:
${list(L.funding, 40)}
mobileCodes:
${list(L.mobile_code, 40)}
tags:
${list(L.tag, 60)}
industries:
${list(L.industry, 400)}

Allowed values for local:
countries:
${list(G.country, 20)}
keywords (only use when one clearly matches; otherwise use categories and cities):
${list(G.keyword, 400)}
common categories (for reference; categories is free text):
${list(G.category, 200)}`;
}

// ---- sanitiser ---------------------------------------------------------------------
const canon = (values: string[] | undefined) => new Map((values ?? []).map((v) => [v.toLowerCase(), v]));

/** Keeps only whitelisted filters with valid types, and enum values that exist in the data. */
export function sanitize(mode: Mode, raw: unknown, facets: Facets): { filters: Filters; dropped: string[] } {
  const fields = fieldsFor(mode);
  const out: Filters = {};
  const dropped: string[] = [];
  if (!raw || typeof raw !== 'object') return { filters: out, dropped };
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const f = fields[k];
    if (!f || v === null || v === undefined) continue;
    if (f.kind === 'bool') {
      if (typeof v === 'boolean') out[k] = v;
    } else if (f.kind === 'int' || f.kind === 'num') {
      const n = typeof v === 'number' ? v : Number(v);
      if (Number.isFinite(n)) out[k] = f.kind === 'int' ? Math.round(Math.min(Math.max(n, f.min ?? -Infinity), f.max ?? Infinity)) : Math.min(Math.max(n, f.min ?? -Infinity), f.max ?? Infinity);
    } else if (Array.isArray(v)) {
      const strings = [...new Set(v.filter((x): x is string => typeof x === 'string').map((x) => x.trim().slice(0, 80)).filter(Boolean))].slice(0, 20);
      if (f.kind === 'enum') {
        const allowed = canon(facets[f.facet!]);
        const kept: string[] = [];
        for (const s of strings) {
          const hit = allowed.get(s.toLowerCase());
          if (hit) kept.push(hit);
          else dropped.push(s);
        }
        if (kept.length) out[k] = kept;
      } else if (strings.length) out[k] = strings;
    }
  }
  // a range given back to front is still what the person meant
  for (const [lo, hi] of mode === 'leads' ? [['employeesMin', 'employeesMax'], ['tenureMin', 'tenureMax'], ['foundedMin', 'foundedMax']] : [['minRating', 'maxRating']]) {
    if (typeof out[lo] === 'number' && typeof out[hi] === 'number' && (out[lo] as number) > (out[hi] as number)) [out[lo], out[hi]] = [out[hi], out[lo]];
  }
  return { filters: out, dropped };
}

export const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');

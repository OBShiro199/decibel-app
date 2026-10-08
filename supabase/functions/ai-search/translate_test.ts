// Unit tests for the Search with AI sanitiser and prompt (no network): deno test ai-search/
import { assertEquals, assert } from 'jsr:@std/assert';
import { sanitize, systemPrompt, OUTPUT_SCHEMA, LEAD_FIELDS, LOCAL_FIELDS, type Facets } from './translate.ts';

const facetsFile = Deno.env.get('FACETS_TSV');
const leads: Facets = {}, local: Facets = {};
if (facetsFile) {
  for (const line of Deno.readTextFileSync(facetsFile).trim().split('\n')) {
    const [a, b, c] = line.split('\t');
    // q.sh prints columns in key order: facet, source, value
    const [facet, source, value] = [a, b, c];
    ((source === 'leads' ? leads : local)[facet] ??= []).push(value);
  }
}

Deno.test('enum values are matched to the real spelling, invented ones dropped', () => {
  const { filters, dropped } = sanitize('leads', { seniorities: ['Director', 'c-level', 'Overlord'], industries: ['software development', 'Space Piracy'] }, leads);
  assertEquals(filters.seniorities, ['director', 'c-level']);
  assertEquals(filters.industries, ['Software Development']);
  assertEquals(dropped.sort(), ['Overlord', 'Space Piracy']);
});

Deno.test('unknown keys and wrong types are removed', () => {
  const { filters } = sanitize('leads', { titles: 'CEO', hasMobile: 'yes', employeesMin: 'fifty', dropTable: ['x'], hasEmail: true, cities: ['London', 42, '  '] }, leads);
  assertEquals(filters, { hasEmail: true, cities: ['London'] });
});

Deno.test('ranges are clamped and swapped when back to front', () => {
  const { filters } = sanitize('leads', { employeesMin: 100, employeesMax: 50, tenureMin: -5, foundedMax: 99999 }, leads);
  assertEquals(filters.employeesMin, 50);
  assertEquals(filters.employeesMax, 100);
  assertEquals(filters.tenureMin, 0);
  assertEquals(filters.foundedMax, 2100);
  const loc = sanitize('local', { minRating: 7, maxRating: 4 }, local).filters;
  assertEquals(loc.minRating, 4);
  assertEquals(loc.maxRating, 5);
});

Deno.test('local filters only accept local keys', () => {
  const { filters } = sanitize('local', { categories: ['plumber'], titles: ['CEO'], hasWebsite: false, countries: ['gb', 'Narnia'] }, local);
  assertEquals(filters, { categories: ['plumber'], hasWebsite: false, countries: ['GB'] });
});

Deno.test('long lists and long values are capped', () => {
  const { filters } = sanitize('leads', { titles: Array.from({ length: 40 }, (_, i) => `t${i}`), companies: ['x'.repeat(500)] }, leads);
  assertEquals((filters.titles as string[]).length, 20);
  assertEquals((filters.companies as string[])[0].length, 80);
});

Deno.test('schema covers every filter key, all required (strict output)', () => {
  const l = OUTPUT_SCHEMA.properties.leads as { required: string[] };
  const g = OUTPUT_SCHEMA.properties.local as { required: string[] };
  assertEquals(l.required.sort(), Object.keys(LEAD_FIELDS).sort());
  assertEquals(g.required.sort(), Object.keys(LOCAL_FIELDS).sort());
});

Deno.test('system prompt contains the real vocabulary and stays a sensible size', () => {
  const p = systemPrompt({ leads, local });
  assert(p.includes('Software Development'));
  assert(p.includes('- c-level'));
  console.log(`   system prompt: ${p.length} chars (~${Math.round(p.length / 4)} tokens)`);
  assert(p.length < 60000);
});

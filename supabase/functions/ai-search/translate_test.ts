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

Deno.test('schema offers every filter key and no nullable unions (structured output limits)', () => {
  const field = (m: 'leads' | 'local') => (OUTPUT_SCHEMA.properties[m] as { items: { properties: { field: { enum: string[] } } } }).items.properties.field.enum;
  assertEquals([...field('leads')].sort(), Object.keys(LEAD_FIELDS).sort());
  assertEquals([...field('local')].sort(), Object.keys(LOCAL_FIELDS).sort());
  assert(!JSON.stringify(OUTPUT_SCHEMA).includes('null'));
});

Deno.test('the model\'s { field, values } list becomes typed filters', () => {
  const { filters } = sanitize('leads', [
    { field: 'titles', values: ['CEO', 'Chief Executive'] },
    { field: 'titles', values: ['Founder'] },
    { field: 'hasMobile', values: ['yes'] },
    { field: 'hasEmail', values: ['maybe'] },
    { field: 'employeesMin', values: ['50'] },
    { field: 'employeesMax', values: ['1,000'] },
    { field: 'foundedMin', values: ['soon'] },
    { field: '__proto__', values: ['x'] },
    { field: 'dropTable', values: ['x'] },
    'junk',
  ], leads);
  assertEquals(filters, { titles: ['CEO', 'Chief Executive', 'Founder'], hasMobile: true, employeesMin: 50, employeesMax: 1000 });
  assertEquals(sanitize('local', [{ field: 'hasWebsite', values: ['no'] }, { field: 'minRating', values: ['4.5'] }], local).filters, { hasWebsite: false, minRating: 4.5 });
});

Deno.test('system prompt contains the real vocabulary and stays a sensible size', () => {
  const p = systemPrompt({ leads, local });
  assert(p.includes('Software Development'));
  assert(p.includes('- c-level'));
  console.log(`   system prompt: ${p.length} chars (~${Math.round(p.length / 4)} tokens)`);
  assert(p.length < 60000);
});

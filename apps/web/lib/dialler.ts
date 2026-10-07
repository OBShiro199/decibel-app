// Power dialler: practice leads (fictional people, all ringing the rep's own mobile)
// and the shared shape for real leads.
import type { Person } from '@/lib/types';

export interface DialLead {
  id: string;
  name: string;
  company: string;
  title: string;
  number: string;
  practice: boolean;
  person?: Person;
}

export const WRAP_SECONDS = 20;
export const PRACTICE_DEFAULT_NUMBER = '07585509647';
/**
 * While testing, every power dialler call rings the test number (the rep's own mobile)
 * instead of the lead's mobile. Calls are otherwise real: checks, call rows, outcomes,
 * notes and recordings are all saved against the person. Set to false for live calling.
 */
export const TEST_ROUTING = true;

const PRACTICE: [string, string, string][] = [
  ['Amelia Ward', 'Ward & Hale Interiors', 'Managing Director'],
  ['Marcus Bell', 'Northlight Studios', 'Founder'],
  ['Sophie Turner', 'Fernbrook Dental', 'Practice Manager'],
  ['Daniel Okoro', 'Okoro Freight', 'Operations Director'],
  ['Isla Campbell', 'Glenmore Hotels', 'Head of Sales'],
  ['Ethan Price', 'Price & Co Accountants', 'Partner'],
  ['Freya Lewis', 'Lewis Bakery Group', 'Commercial Director'],
  ['Noah Patel', 'Patel Logistics', 'Chief Executive Officer'],
  ['Grace Murphy', 'Murphy Legal', 'Head of Business Development'],
  ['Leo Harrison', 'Harrison Tech', 'Chief Technology Officer'],
];

export function practiceLeads(number: string): DialLead[] {
  return PRACTICE.map(([name, company, title], i) => ({ id: `practice-${i + 1}`, name, company, title, number, practice: true }));
}

export function personLead(p: Person): DialLead {
  return { id: p.id, name: p.full_name, company: p.company?.name ?? '', title: p.job_title ?? '', number: p.mobile_e164 ?? '', practice: false, person: p };
}

/** Name for a list made to start the dialler, e.g. "Dialler list (7 Oct 2026, 14:32)". */
export function diallerListName(d = new Date()): string {
  const day = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `Dialler list (${day}, ${time})`;
}

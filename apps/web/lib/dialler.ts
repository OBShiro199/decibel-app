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

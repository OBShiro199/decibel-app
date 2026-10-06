// Sample data for the Local tab: ten fictional local businesses laid out like Google Maps
// listings. Every business, address and website is invented, and every number is from
// Ofcom's reserved drama range (07700 900xxx mobiles), so none of it can reach a real person.
export interface LocalBusiness {
  id: string;
  name: string;
  category: string;
  /** which pastel tag colour the category pill uses (see .tag-N) */
  tone: number;
  rating: number;
  reviews: number;
  mobile: string; // E.164
  website: string | null;
  address: string;
  hours: { open: boolean; text: string };
  lastReview: string;
}

export const LOCAL_BUSINESSES: LocalBusiness[] = [
  { id: 'l1', name: 'Harbour Lane Bakery', category: 'Bakery', tone: 2, rating: 4.8, reviews: 412, mobile: '+447700900201', website: 'harbourlanebakery.co.uk', address: '14 Quay Street, Bristol', hours: { open: true, text: 'Open · closes 5pm' }, lastReview: '2 days ago' },
  { id: 'l2', name: 'Kestrel Plumbing & Heating', category: 'Plumber', tone: 1, rating: 4.6, reviews: 187, mobile: '+447700900202', website: 'kestrelplumbing.co.uk', address: '9 Mill Road, Manchester', hours: { open: true, text: 'Open 24 hours' }, lastReview: '1 week ago' },
  { id: 'l3', name: 'Oakfield Dental Care', category: 'Dentist', tone: 5, rating: 4.9, reviews: 523, mobile: '+447700900203', website: 'oakfielddental.co.uk', address: '22 Park Row, Leeds', hours: { open: true, text: 'Open · closes 6pm' }, lastReview: 'Yesterday' },
  { id: 'l4', name: 'Northgate Estate Agents', category: 'Estate agent', tone: 4, rating: 4.2, reviews: 96, mobile: '+447700900204', website: 'northgateestates.co.uk', address: '3 Church Street, Sheffield', hours: { open: false, text: 'Closed · opens 9am' }, lastReview: '3 weeks ago' },
  { id: 'l5', name: "Tilly's Hair Studio", category: 'Hair salon', tone: 6, rating: 4.7, reviews: 156, mobile: '+447700900205', website: null, address: '41 Victoria Road, Nottingham', hours: { open: true, text: 'Open · closes 7pm' }, lastReview: '5 days ago' },
  { id: 'l6', name: 'Ironworks Gym', category: 'Gym', tone: 3, rating: 4.5, reviews: 308, mobile: '+447700900206', website: 'ironworksgym.co.uk', address: 'Unit 6, Dock Road, Liverpool', hours: { open: true, text: 'Open 24 hours' }, lastReview: 'Today' },
  { id: 'l7', name: 'Marlowe & Finch Accountants', category: 'Accountant', tone: 7, rating: 4.4, reviews: 61, mobile: '+447700900207', website: 'marlowefinch.co.uk', address: '18 Bishopsgate Court, London', hours: { open: false, text: 'Closed · opens 8:30am' }, lastReview: '2 months ago' },
  { id: 'l8', name: "Dave's Motor Repairs", category: 'Car repair', tone: 2, rating: 4.3, reviews: 129, mobile: '+447700900208', website: null, address: '7 Forge Lane, Birmingham', hours: { open: true, text: 'Open · closes 5:30pm' }, lastReview: '4 days ago' },
  { id: 'l9', name: 'The Copper Kettle Café', category: 'Café', tone: 0, rating: 4.6, reviews: 274, mobile: '+447700900209', website: 'copperkettlecafe.co.uk', address: '5 Grassmarket, Edinburgh', hours: { open: true, text: 'Open · closes 4pm' }, lastReview: '3 days ago' },
  { id: 'l10', name: 'Willowbrook Veterinary Clinic', category: 'Vet', tone: 5, rating: 4.9, reviews: 388, mobile: '+447700900210', website: 'willowbrookvets.co.uk', address: '31 Cathedral Road, Cardiff', hours: { open: true, text: 'Open · closes 7pm' }, lastReview: 'Yesterday' },
];

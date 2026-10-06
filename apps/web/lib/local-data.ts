// Sample data for the Local businesses tab: twenty fictional local businesses laid out like Google Maps
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
  { id: 'l11', name: 'Petal & Stem Florist', category: 'Florist', tone: 6, rating: 4.8, reviews: 214, mobile: '+447700900211', website: 'petalandstem.co.uk', address: '12 Eastgate Row, Chester', hours: { open: true, text: 'Open · closes 5:30pm' }, lastReview: '6 days ago' },
  { id: 'l12', name: 'The Anchor Inn', category: 'Pub', tone: 2, rating: 4.4, reviews: 642, mobile: '+447700900212', website: 'theanchorbrighton.co.uk', address: '8 The Lanes, Brighton', hours: { open: true, text: 'Open · closes 11pm' }, lastReview: 'Today' },
  { id: 'l13', name: 'Brightwell Opticians', category: 'Optician', tone: 1, rating: 4.7, reviews: 118, mobile: '+447700900213', website: 'brightwelloptics.co.uk', address: '26 Granby Street, Leicester', hours: { open: false, text: 'Closed · opens 9am' }, lastReview: '2 weeks ago' },
  { id: 'l14', name: 'Hartley & Moss Solicitors', category: 'Solicitor', tone: 7, rating: 4.1, reviews: 47, mobile: '+447700900214', website: 'hartleymoss.co.uk', address: '4 Tombland, Norwich', hours: { open: false, text: 'Closed · opens 9am' }, lastReview: '1 month ago' },
  { id: 'l15', name: 'Spark Right Electrical', category: 'Electrician', tone: 3, rating: 4.9, reviews: 203, mobile: '+447700900215', website: null, address: '19 Sauchiehall Lane, Glasgow', hours: { open: true, text: 'Open 24 hours' }, lastReview: 'Yesterday' },
  { id: 'l16', name: 'Meadowbank Physiotherapy', category: 'Physiotherapist', tone: 5, rating: 4.8, reviews: 175, mobile: '+447700900216', website: 'meadowbankphysio.co.uk', address: '11 Micklegate, York', hours: { open: true, text: 'Open · closes 7pm' }, lastReview: '3 days ago' },
  { id: 'l17', name: 'Sunrise Dry Cleaners', category: 'Dry cleaner', tone: 4, rating: 4.2, reviews: 88, mobile: '+447700900217', website: null, address: '23 Mill Lane, Cambridge', hours: { open: true, text: 'Open · closes 6pm' }, lastReview: '2 weeks ago' },
  { id: 'l18', name: 'Slate & Sons Roofing', category: 'Roofer', tone: 0, rating: 4.6, reviews: 134, mobile: '+447700900218', website: 'slateandsons.co.uk', address: '6 Fore Street, Exeter', hours: { open: true, text: 'Open · closes 5pm' }, lastReview: '5 days ago' },
  { id: 'l19', name: 'Greenfingers Garden Centre', category: 'Garden centre', tone: 0, rating: 4.5, reviews: 462, mobile: '+447700900219', website: 'greenfingersgardens.co.uk', address: '15 Broad Walk, Oxford', hours: { open: true, text: 'Open · closes 5:30pm' }, lastReview: 'Yesterday' },
  { id: 'l20', name: "Luca's Pizzeria", category: 'Restaurant', tone: 3, rating: 4.3, reviews: 756, mobile: '+447700900220', website: null, address: '37 Grey Street, Newcastle', hours: { open: true, text: 'Open · closes 10pm' }, lastReview: 'Today' },
];

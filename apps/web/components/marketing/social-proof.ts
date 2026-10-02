// Customer logos and testimonials for the landing page.
//
// IMPORTANT: these quotes are DRAFTS written for Decibel. The people named have not
// approved them, and the figures are placeholders to confirm with each customer.
// Publishing invented endorsements or showing a logo as a customer without consent
// breaches UK consumer law (CPRs / DMCC Act) and the CAP code.
//
// They render on your local dev server so you can review the design. On the live
// site they stay hidden until you set the flag below to true, after each person has
// signed off their quote and each brand has agreed to its logo being shown.
export const SOCIAL_PROOF_APPROVED = false;

export const showSocialProof = SOCIAL_PROOF_APPROVED || process.env.NODE_ENV !== 'production';

export interface Brand {
  name: string;
  logo?: string; // transparent image in /public/landing/logos, cropped tight; text wordmark if absent
  /** Intrinsic size of the cropped logo, used to give every logo the same optical size. */
  w?: number;
  h?: number;
}

export const BRANDS: Brand[] = [
  { name: 'Response AI', logo: '/landing/logos/response.webp', w: 157, h: 36 },
  { name: 'Saral Influencers' },
  { name: 'GreatLab', logo: '/landing/logos/greatlab.webp', w: 139, h: 26 },
  { name: 'Quolum' },
  { name: 'Linq', logo: '/landing/logos/linq.webp', w: 120, h: 56 },
  { name: 'Bionic Talent', logo: '/landing/logos/bionic-talent.webp', w: 137, h: 33 },
  { name: 'Seer', logo: '/landing/logos/seer.webp', w: 79, h: 30 },
  { name: 'Comb' },
  { name: 'Capfern' },
  { name: 'For You Advertising', logo: '/landing/logos/for-you.webp', w: 391, h: 61 },
  { name: 'Paper Schedule' },
  { name: 'Centrale' },
  { name: 'SpotList' },
];

export interface Testimonial {
  brand: string;
  logo: string;
  photo: string;
  name: string;
  role: string;
  quote: string;
  features: [string, string, string];
}

export const TESTIMONIALS: Testimonial[] = [
  {
    brand: 'Response',
    logo: '/landing/logos/response.webp',
    photo: '/landing/people/seth-smith.webp',
    name: 'Seth Smith',
    role: 'Growth Advisor',
    // DRAFT: confirm wording and figures with Seth before publishing
    quote: 'Decibel took our reps from a spreadsheet and a desk phone to 40 dials a day each. The verified mobiles made the difference: 23 meetings booked in our first month.',
    features: ['Power dialler', 'Verified mobiles', 'Call recording'],
  },
  {
    brand: 'Bionic Talent',
    logo: '/landing/logos/bionic-talent.webp',
    photo: '/landing/people/abdul-qadir.webp',
    name: 'Abdul Qadir',
    role: 'CEO/Founder',
    // DRAFT: confirm wording and figures with Abdul before publishing
    quote: '17 meetings booked in 30 days for Bionic Talent, straight from Decibel’s database and dialler. No data vendor and no separate phone system.',
    features: ['Lead database', 'Power dialler', 'Pipeline'],
  },
  {
    brand: 'Seer',
    logo: '/landing/logos/seer.webp',
    photo: '/landing/people/mac-burt.webp',
    name: 'Mac Burt',
    role: 'Founder',
    // DRAFT: confirm wording and figures with Mac before publishing
    quote: 'We worked one Decibel list of SaaS founders for six weeks and landed 70-ish demos for Seer. TPS screening meant we never worried about who we were dialling.',
    features: ['Lists', 'TPS screening', 'Analytics'],
  },
];

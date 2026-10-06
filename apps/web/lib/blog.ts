// Blog posts: metadata for the index, the sitemap and each article page. The article body
// lives in app/(marketing)/blog/<slug>/page.tsx.

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  /** ISO date, e.g. 2026-10-06 */
  date: string;
  readMinutes: number;
  tag: 'Compliance' | 'Playbooks';
  /** ASCII cover art (monospace), about 44 columns by 9 rows */
  cover: string;
};

export const BLOG_AUTHOR = { name: 'Oliver Burt', role: 'Founder, Decibel' };

// Covers: 44 columns by 9 rows, ASCII and box-drawing characters only, every line the same width.
const TPS_COVER = [
  ' ┌───────┐  ┌──────────────────────────────┐',
  ' │ ..... │  │ 07700 900123   TPS      x    │',
  ' │ ..... │  │ 07700 900456   clear    >    │',
  ' │  ───  │  │ 07700 900789   CTPS     x    │',
  ' │ 1 2 3 │  │ 07700 900321   clear    >    │',
  ' │ 4 5 6 │  │ 07700 900654   DNC      x    │',
  ' │ 7 8 9 │  └──────────────────────────────┘',
  ' │ * 0 # │     screened before every dial   ',
  ' └───────┘                                  ',
].join('\n');

const GDPR_COVER = [
  '      ╭─────╮       ┌──────────────────────┐',
  '      │     │       │ UK GDPR  Art. 6(1)f  │',
  '      │     │       │ ──────────────────── │',
  '    ┌─┴─────┴─┐     │ purpose          ok  │',
  '    │         │     │ necessity        ok  │',
  '    │    o    │     │ balancing        ok  │',
  '    │    │    │     │ Art. 14 notice   ok  │',
  '    │         │     │ objection  =   stop  │',
  '    └─────────┘     └──────────────────────┘',
].join('\n');

const SPIN_COVER = [
  '  S  situation                 ┌─────────┐  ',
  '  P  problem                   │    N    │  ',
  '  I  implication     ┌─────────┤         │  ',
  '  N  need-payoff     │    I    │         │  ',
  '           ┌─────────┤         │         │  ',
  '           │    P    │         │         │  ',
  ' ┌─────────┤         │         │         │  ',
  ' │    S    │         │         │         │  ',
  ' └─────────┴─────────┴─────────┴─────────┘  ',
].join('\n');

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'tps-ctps-cold-calling-uk',
    title: 'TPS and CTPS: the UK cold calling rules, explained',
    description: 'What PECR, the Telephone Preference Service and the Corporate TPS mean for B2B cold calling in the UK: who is covered, how often to screen and what happens if you get it wrong.',
    date: '2026-10-06',
    readMinutes: 8,
    tag: 'Compliance',
    cover: TPS_COVER,
  },
  {
    slug: 'gdpr-cold-calling-b2b',
    title: 'GDPR and B2B cold calling: a practical guide',
    description: 'Lawful basis, legitimate interests assessments, Article 14 notices, the right to object and call recording, for UK and EU outbound teams.',
    date: '2026-10-06',
    readMinutes: 9,
    tag: 'Compliance',
    cover: GDPR_COVER,
  },
  {
    slug: 'spin-selling-cold-calling',
    title: 'SPIN selling for cold calls: a field guide',
    description: 'How to use Situation, Problem, Implication and Need-payoff questions on a short cold call, with example questions, a two-minute call structure and a way to practise.',
    date: '2026-10-06',
    readMinutes: 8,
    tag: 'Playbooks',
    cover: SPIN_COVER,
  },
];

export const postBySlug = (slug: string) => BLOG_POSTS.find((p) => p.slug === slug);

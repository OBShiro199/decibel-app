import Link from 'next/link';
import { COMPARE_LINKS, INDUSTRY_LINKS, PRODUCT_LINKS, TOOL_LINKS } from '@/lib/marketing-pages';
import { FOUNDER } from '@/lib/site';
import { Logo } from './logo';

type FooterLink = { href: string; label: string; external?: boolean };

// Columns come from lib/marketing-pages, so the header, footer and sitemap stay in step.
const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [{ href: '/features', label: 'All features' }, ...PRODUCT_LINKS.filter((l) => l.href !== '/compliance'), { href: '/#pricing', label: 'Pricing' }],
  },
  {
    title: 'Industries',
    links: [...INDUSTRY_LINKS, { href: '/industries', label: 'All industries' }],
  },
  {
    title: 'Compare',
    links: [...COMPARE_LINKS.map((l) => ({ href: l.href, label: l.label.replace('Decibel vs. ', 'vs. ') })), { href: '/vs', label: 'All comparisons' }],
  },
  {
    title: 'Free tools',
    links: [...TOOL_LINKS, { href: '/tools', label: 'All free tools' }],
  },
  {
    title: 'Company',
    links: [
      { href: '/blog', label: 'Blog' },
      { href: '/careers', label: 'Careers' },
      { href: '/demo', label: 'Book a 15-min demo' },
      { href: '/signup', label: 'Start free trial' },
      { href: '/login', label: 'Log in' },
      { href: `mailto:${FOUNDER.email}`, label: 'Contact us', external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/compliance', label: 'Compliance' },
      { href: '/privacy', label: 'Privacy' },
      { href: '/terms', label: 'Terms' },
      { href: '/fair-use', label: 'Fair use' },
      { href: '/dpa', label: 'DPA' },
      { href: '/cookies', label: 'Cookies' },
      { href: '/art-14', label: 'Art. 14 notice' },
      { href: '/privacy/opt-out', label: 'Opt out' },
    ],
  },
];

// an eased (S-curve) fade: the picture is solid only at the very bottom and dissolves gradually upward
const FADE =
  'linear-gradient(to top, #000 0%, rgba(0,0,0,0.97) 8%, rgba(0,0,0,0.9) 18%, rgba(0,0,0,0.77) 30%, rgba(0,0,0,0.6) 42%, rgba(0,0,0,0.42) 54%, rgba(0,0,0,0.26) 66%, rgba(0,0,0,0.13) 78%, rgba(0,0,0,0.05) 90%, transparent 100%)';

const linkClass = 'text-black-700 transition-colors hover:text-black-0';

export function SiteFooter() {
  return (
    <footer className="border-t border-white-800 bg-white-100">
      <div className="mx-auto max-w-[1180px] border-x border-white-800">
        <div className="px-5 pb-6 pt-12 md:px-8 md:pb-8 md:pt-16">
          <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 lg:grid-cols-[1.3fr_repeat(6,1fr)]">
            <div className="col-span-2 sm:col-span-3 lg:col-span-1">
              <Logo />
              <p className="mt-3 max-w-[240px] text-black-700">Verified UK & EU mobiles, a browser dialler and a pipeline, in one place.</p>
              <p className="t-small mt-6 text-black-0">Talk to the founder</p>
              <ul className="mt-3 space-y-2">
                <li>
                  <a href={`tel:${FOUNDER.phone}`} className={`${linkClass} tabular-nums`}>
                    {FOUNDER.phoneDisplay}
                  </a>
                </li>
                <li>
                  <a href={`mailto:${FOUNDER.email}`} className={linkClass}>
                    {FOUNDER.email}
                  </a>
                </li>
              </ul>
            </div>
            {COLUMNS.map((col) => (
              <nav key={col.title} aria-label={col.title}>
                <p className="t-small text-black-0">{col.title}</p>
                <ul className="mt-3 space-y-2">
                  {col.links.map((l) => (
                    <li key={l.label}>
                      {l.external || l.href === '#' ? (
                        <a href={l.href} className={linkClass}>
                          {l.label}
                        </a>
                      ) : (
                        <Link href={l.href} className={linkClass}>
                          {l.label}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
          <div className="mt-12 flex flex-col gap-2 border-t border-white-800 pt-6 text-black-700 sm:flex-row sm:items-center sm:justify-between">
            <p className="t-small">© {new Date().getFullYear()} Decibel. All rights reserved.</p>
            <p className="t-small">Data hosted in the UK (London).</p>
          </div>
        </div>
        {/* a landscape inside the columned wall: solid at the bottom edge, fading to nothing before it reaches the text */}
        <div aria-hidden className="relative h-[170px] overflow-hidden md:h-[300px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/landing/footer-landscape.webp"
            alt=""
            width={2000}
            height={500}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full select-none object-cover object-bottom"
            style={{ WebkitMaskImage: FADE, maskImage: FADE }}
            draggable={false}
          />
        </div>
      </div>
    </footer>
  );
}

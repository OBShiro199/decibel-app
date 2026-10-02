import Link from 'next/link';
import { Logo } from './logo';

type FooterLink = { href: string; label: string; external?: boolean };

const COLUMNS: { title: string; links: FooterLink[] }[] = [
  {
    title: 'Product',
    links: [
      { href: '/#product', label: 'Overview' },
      { href: '/#data', label: 'Data' },
      { href: '/#pricing', label: 'Pricing' },
      { href: '/signup', label: 'Start free trial' },
      { href: '/login', label: 'Log in' },
    ],
  },
  {
    title: 'Company',
    links: [
      { href: '/compliance', label: 'Compliance' },
      { href: 'mailto:sales@decibel.io', label: 'Talk to sales', external: true },
      { href: 'mailto:privacy@decibel.io', label: 'Privacy team', external: true },
    ],
  },
  {
    title: 'Legal',
    links: [
      { href: '/privacy', label: 'Privacy' },
      { href: '/dpa', label: 'DPA' },
      { href: '/cookies', label: 'Cookies' },
      { href: '/art-14', label: 'Art. 14 notice' },
      { href: '/terms', label: 'Terms' },
      { href: '/privacy/opt-out', label: 'Opt out' },
    ],
  },
  {
    title: 'Status',
    links: [
      // Placeholders until the status page and social accounts exist.
      { href: '#', label: 'System status' },
      { href: '#', label: 'Twitter' },
      { href: '#', label: 'LinkedIn' },
    ],
  },
];

const linkClass = 'text-black-700 transition-colors hover:text-black-0';

export function SiteFooter() {
  return (
    <footer className="border-t border-white-800 bg-white-100">
      <div className="mx-auto max-w-[1180px] border-x border-white-800 px-5 py-12 md:px-8 md:py-16">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-[1.5fr_repeat(4,1fr)]">
          <div className="col-span-2 md:col-span-1">
            <Logo />
            <p className="mt-3 max-w-[240px] text-black-700">Verified UK & EU mobiles, a browser dialler and a pipeline, in one place.</p>
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
    </footer>
  );
}

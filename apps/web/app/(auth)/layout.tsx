import Link from 'next/link';
import { Logo } from '@/components/marketing/logo';
import { FOUNDER } from '@/lib/site';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-page-scroll className="flex min-h-dvh flex-col items-center bg-canvas px-4 py-12">
      <Link href="/" aria-label="Decibel home" className="mb-8">
        <Logo />
      </Link>
      <div className="w-full max-w-[400px]">{children}</div>
      <p className="t-caption mt-8 text-center text-black-700">
        Questions? Talk to the founder: <a href={`tel:${FOUNDER.phone}`} className="tabular-nums hover:underline">{FOUNDER.phoneDisplay}</a> · <a href={`mailto:${FOUNDER.email}`} className="hover:underline">{FOUNDER.email}</a>
      </p>
      <p className="t-caption mt-3 text-black-700">
        <Link href="/privacy" className="hover:underline">Privacy</Link> · <Link href="/terms" className="hover:underline">Terms</Link> · <Link href="/compliance" className="hover:underline">Compliance</Link>
      </p>
    </div>
  );
}

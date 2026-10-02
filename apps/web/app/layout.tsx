import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

// Self-hosted at build time by next/font.
const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: { default: 'Decibel · Turn up your outbound', template: '%s · Decibel' },
  description: 'Verified UK & EU mobiles, a browser dialler and a pipeline, in one place.',
  openGraph: {
    title: 'Decibel · Turn up your outbound',
    description: 'Verified UK & EU mobiles, a browser dialler and a pipeline, in one place.',
    type: 'website',
    locale: 'en_GB',
  },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f6f6f4' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={sans.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

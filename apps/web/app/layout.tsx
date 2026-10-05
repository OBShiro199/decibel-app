import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { SITE_DESCRIPTION, SITE_TITLE, SITE_URL } from '@/lib/site';

// Self-hosted at build time by next/font.
const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: '%s · Decibel' },
  description: SITE_DESCRIPTION,
  applicationName: 'Decibel',
  keywords: ['B2B data', 'UK mobile numbers', 'EU mobile numbers', 'verified mobiles', 'cold calling software', 'power dialler', 'browser dialler', 'sales dialler UK', 'TPS screening', 'CTPS', 'outbound sales', 'lead database', 'call recording', 'sales pipeline'],
  category: 'business',
  alternates: { canonical: '/' },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    siteName: 'Decibel',
    type: 'website',
    locale: 'en_GB',
  },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: { index: true, follow: true },
  // favicon.io export, copied into public/brand
  // ?v= busts browsers' separate favicon cache; bump it whenever the icons change
  icons: {
    icon: [
      { url: '/brand/favicon.ico?v=2', sizes: 'any' },
      { url: '/brand/favicon-32x32.png?v=2', sizes: '32x32', type: 'image/png' },
      { url: '/brand/favicon-16x16.png?v=2', sizes: '16x16', type: 'image/png' },
    ],
    apple: '/brand/apple-touch-icon.png?v=2',
  },
  manifest: '/brand/site.webmanifest?v=2',
};

// light only: stops the OS dark setting (and Chrome's auto dark mode) restyling native controls or the page
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#f6f6f4', colorScheme: 'only light' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-GB" className={sans.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

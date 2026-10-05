import type { Metadata, Viewport } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';

// Self-hosted at build time by next/font.
const sans = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
  title: { default: 'Decibel · 1 million verified mobiles & the dialler to reach them all', template: '%s · Decibel' },
  description: 'Search UK and EU decision makers, reveal a direct mobile for one credit and call it from your browser. TPS screening, call recording and a self-updating pipeline built in.',
  openGraph: {
    title: 'Decibel · 1 million verified mobiles & the dialler to reach them all',
    description: 'Search UK and EU decision makers, reveal a direct mobile for one credit and call it from your browser. TPS screening, call recording and a self-updating pipeline built in.',
    type: 'website',
    locale: 'en_GB',
  },
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

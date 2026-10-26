import type { Metadata } from 'next';

// the browser tab says which page this is ("Dashboard · Decibel")
export const metadata: Metadata = { title: 'Dashboard' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

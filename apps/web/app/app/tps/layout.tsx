import type { Metadata } from 'next';

// the browser tab says which page this is ("TPS/CTPS checks · Decibel")
export const metadata: Metadata = { title: 'TPS/CTPS checks' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

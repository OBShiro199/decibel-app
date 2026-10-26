import type { Metadata } from 'next';

// the browser tab says which page this is ("People · Decibel")
export const metadata: Metadata = { title: 'People' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

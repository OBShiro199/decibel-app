import type { Metadata } from 'next';

// the browser tab says which page this is ("Leads · Decibel")
export const metadata: Metadata = { title: 'Leads' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

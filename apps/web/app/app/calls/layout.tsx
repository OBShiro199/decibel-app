import type { Metadata } from 'next';

// the browser tab says which page this is ("Calls · Decibel")
export const metadata: Metadata = { title: 'Calls' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

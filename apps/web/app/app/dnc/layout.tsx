import type { Metadata } from 'next';

// the browser tab says which page this is ("DNC list · Decibel")
export const metadata: Metadata = { title: 'DNC list' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

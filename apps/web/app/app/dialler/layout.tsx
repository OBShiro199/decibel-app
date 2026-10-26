import type { Metadata } from 'next';

// the browser tab says which page this is ("Power dialler · Decibel")
export const metadata: Metadata = { title: 'Power dialler' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

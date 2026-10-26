import type { Metadata } from 'next';

// the browser tab says which page this is ("Local businesses · Decibel")
export const metadata: Metadata = { title: 'Local businesses' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

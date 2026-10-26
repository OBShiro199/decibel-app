import type { Metadata } from 'next';

// the browser tab says which page this is ("Website visitors · Decibel")
export const metadata: Metadata = { title: 'Website visitors' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

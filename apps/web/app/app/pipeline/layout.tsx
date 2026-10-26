import type { Metadata } from 'next';

// the browser tab says which page this is ("Pipeline · Decibel")
export const metadata: Metadata = { title: 'Pipeline' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

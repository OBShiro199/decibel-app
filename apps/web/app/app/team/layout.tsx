import type { Metadata } from 'next';

// the browser tab says which page this is ("Team · Decibel")
export const metadata: Metadata = { title: 'Team' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

import type { Metadata } from 'next';

// the browser tab says which page this is ("Companies · Decibel")
export const metadata: Metadata = { title: 'Companies' };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}

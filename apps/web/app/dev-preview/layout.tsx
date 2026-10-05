import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PreviewShell } from './preview-shell';

// Local design preview: the real app pages on sample data, for screenshot reviews.
// Never available in production builds.
export const metadata: Metadata = { robots: { index: false, follow: false } };
export default function Layout({ children }: { children: React.ReactNode }) {
  if (process.env.NODE_ENV === 'production') notFound();
  return <PreviewShell>{children}</PreviewShell>;
}

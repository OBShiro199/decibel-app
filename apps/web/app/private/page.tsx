import type { Metadata } from 'next';
import { PrivateInbox } from './inbox';

// Unlisted: not in the sitemap, not linked anywhere, and asked not to be indexed.
export const metadata: Metadata = {
  title: 'Inbox',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function PrivatePage() {
  return <PrivateInbox />;
}

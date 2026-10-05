import type { Metadata } from 'next';

// Invite links are personal: never index them.
export const metadata: Metadata = { title: 'Join your team', robots: { index: false, follow: false } };

export default function InviteLayout({ children }: { children: React.ReactNode }) {
  return children;
}

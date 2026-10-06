import type { Metadata } from 'next';
import { Unsubscribe } from './unsubscribe';

export const metadata: Metadata = {
  title: 'Unsubscribe',
  robots: { index: false, follow: false },
};

export default function UnsubscribePage() {
  return <Unsubscribe />;
}

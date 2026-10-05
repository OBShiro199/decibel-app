import type { Metadata } from 'next';
import Link from 'next/link';
import { OptOutForm } from '@/components/marketing/opt-out-form';
import { Prose } from '@/components/marketing/prose';

export const metadata: Metadata = {
  title: 'Opt out',
  description: 'Ask Decibel to remove your details from the database or object to your data being used for direct marketing.',
  alternates: { canonical: '/privacy/opt-out' },
};

export default function OptOutPage() {
  return (
    <Prose
      draft
      title="Opt out"
      lead="If your details are in the Decibel database, or you have been called by a Decibel customer, you can ask us to remove you. You do not need to give a reason."
    >
      <p>
        Fill in the details below so we can find your record. Your right to object to direct marketing is absolute, and we act on requests within one month.
        How we handle your data is explained in the <Link href="/art-14">Article 14 notice</Link>.
      </p>
      <OptOutForm />
      <p>
        Prefer to write it yourself? Email <a href="mailto:privacy@decibel.io">privacy@decibel.io</a> with your name and the phone number concerned.
      </p>
    </Prose>
  );
}

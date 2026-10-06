import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose, ProseTable } from '@/components/marketing/prose';

export const metadata: Metadata = {
  title: 'Privacy policy',
  description: 'How Decibel collects, uses, stores and shares personal data, and the rights you have over it.',
  alternates: { canonical: '/privacy' },
};

export default function PrivacyPage() {
  return (
    <Prose
      draft
      title="Privacy policy"
      lead="This policy explains what personal data Decibel handles, why, and what you can do about it."
      updated="1 October 2026"
    >
      <h2>1. Who we are</h2>
      <p>
        Decibel (&ldquo;we&rdquo;, &ldquo;us&rdquo;) provides a contact database, browser dialler and pipeline for B2B sales teams. [Legal entity name,
        company number and registered address to be confirmed before publication.] You can reach our privacy team at{' '}
        <a href="mailto:privacy@decibel.io">privacy@decibel.io</a>.
      </p>

      <h2>2. Who this policy covers</h2>
      <ul>
        <li>
          <strong>Customers and users:</strong> people who sign up for and use the Decibel app.
        </li>
        <li>
          <strong>Website visitors:</strong> people who browse this site.
        </li>
        <li>
          <strong>People in the database:</strong> business contacts whose professional details appear in our database. If that is you, the{' '}
          <Link href="/art-14">Article 14 notice</Link> is written for you.
        </li>
        <li>
          <strong>People our customers call:</strong> for calls, notes and recordings our customers are the controller and we act as their processor under
          our <Link href="/dpa">Data Processing Addendum</Link>.
        </li>
      </ul>

      <h2>3. Data we collect and why</h2>
      <ProseTable
        head={['Data', 'Purpose', 'Lawful basis']}
        rows={[
          ['Account details: name, work email, workspace, role', 'Creating and running your account', 'Contract'],
          ['Billing details: plan, invoices, payment status (card details are held by Stripe, not us)', 'Taking payment and keeping accounts', 'Contract, legal obligation'],
          ['Usage data: actions in the app, device and browser information', 'Security, support and improving the product', 'Legitimate interest'],
          ['Website analytics', 'Understanding which pages are useful', 'Consent'],
          ['Business contact data in the database: name, job title, employer, business phone or mobile, work location', 'Providing a B2B contact database to customers', 'Legitimate interest'],
          ['Support correspondence', 'Answering your questions', 'Legitimate interest'],
        ]}
      />

      <h2>4. Where data is stored</h2>
      <p>
        Our primary database is hosted in the UK (London). Some sub-processors may process data outside the UK. Where they do, we rely on adequacy
        regulations or the UK International Data Transfer Agreement or Addendum with appropriate safeguards.
      </p>

      <h2>5. Who we share data with</h2>
      <p>
        We share data with the sub-processors listed in our <Link href="/dpa">DPA</Link> (Supabase, Twilio, Stripe, Vercel, Resend and PostHog) so they can
        provide their services to us. We do not sell personal data to advertisers. We may disclose data where the law requires it.
      </p>

      <h2>6. How long we keep it</h2>
      <ul>
        <li>Call recordings: 1 year on Pro, 90 days during a free trial.</li>
        <li>Call metadata: 3 years.</li>
        <li>Deleted workspaces: purged 30 days after deletion.</li>
        <li>Billing records: as long as tax and accounting law requires.</li>
      </ul>

      <h2>7. Your rights</h2>
      <p>Under UK GDPR and EU GDPR you can ask us to:</p>
      <ul>
        <li>give you a copy of your data;</li>
        <li>correct data that is wrong;</li>
        <li>erase your data;</li>
        <li>restrict or stop processing, including an absolute right to object to direct marketing;</li>
        <li>move your data to another provider, where that applies.</li>
      </ul>
      <p>
        Email <a href="mailto:privacy@decibel.io">privacy@decibel.io</a> or use the <Link href="/privacy/opt-out">opt-out page</Link>. We respond within
        one month. You can also complain to the Information Commissioner&rsquo;s Office (ico.org.uk) or your local supervisory authority.
      </p>

      <h2>8. Cookies</h2>
      <p>
        See the <Link href="/cookies">cookie policy</Link>. Analytics are off unless you accept them.
      </p>

      <h2>9. Changes</h2>
      <p>If we make a material change to this policy we will update the date above and tell account holders by email.</p>
    </Prose>
  );
}

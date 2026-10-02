import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose, ProseTable } from '@/components/marketing/prose';

export const metadata: Metadata = {
  title: 'Data Processing Addendum',
  description: 'The Decibel Data Processing Addendum, including security measures and the list of sub-processors.',
};

export default function DpaPage() {
  return (
    <Prose
      draft
      title="Data Processing Addendum"
      lead="This addendum forms part of the agreement between Decibel and each customer, and applies where Decibel processes personal data on the customer's behalf."
      updated="1 October 2026"
    >
      <h2>1. Roles</h2>
      <p>
        For data the customer brings to or creates in the service (imported contacts, notes, call recordings, call outcomes), the customer is the controller
        and Decibel is the processor. For the Decibel contact database itself, Decibel is an independent controller, and the customer becomes an
        independent controller of any contact it reveals and uses.
      </p>

      <h2>2. Scope of processing</h2>
      <ProseTable
        head={['Item', 'Detail']}
        rows={[
          ['Subject matter', 'Providing the Decibel database, dialler and pipeline'],
          ['Duration', 'The term of the agreement plus the deletion period in section 9'],
          ['Nature and purpose', 'Storing, organising, transmitting and recording data so the customer can run outbound calling'],
          ['Data subjects', 'The customer’s users, and the business contacts the customer calls or imports'],
          ['Types of data', 'Names, job titles, employers, phone numbers, email addresses, call metadata, call recordings, notes'],
        ]}
      />

      <h2>3. Our obligations</h2>
      <ul>
        <li>Process personal data only on the customer&rsquo;s documented instructions, including the agreement and the customer&rsquo;s use of the service.</li>
        <li>Ensure people authorised to process the data are bound by confidentiality.</li>
        <li>Apply the security measures in section 5.</li>
        <li>Help the customer respond to data subject requests and meet its obligations on security, breach notification and impact assessments.</li>
        <li>Tell the customer if we believe an instruction breaks data protection law.</li>
      </ul>

      <h2>4. Customer obligations</h2>
      <p>
        The customer is responsible for having a lawful basis for its outreach, for the content of its calls, for choosing an appropriate call recording
        notice setting, and for complying with the calling rules of each country it dials.
      </p>

      <h2>5. Security</h2>
      <ul>
        <li>Encryption in transit (TLS) and at rest.</li>
        <li>Workspace isolation enforced at the database level with row-level security.</li>
        <li>Role-based access within each workspace.</li>
        <li>Access to production systems limited to staff who need it.</li>
        <li>Primary data hosted in the UK (London).</li>
      </ul>

      <h2>6. Sub-processors</h2>
      <p>The customer gives general authorisation for the sub-processors below. We will give at least 30 days&rsquo; notice of additions or replacements, and the customer may object on reasonable grounds.</p>
      <ProseTable
        head={['Sub-processor', 'Purpose', 'Data processed', 'Location']}
        rows={[
          ['Supabase', 'Database, authentication, file storage', 'All customer data', 'UK (London, eu-west-2)'],
          ['Twilio', 'Voice calls, phone numbers, call recording', 'Phone numbers, call audio, call metadata', '[To be confirmed]'],
          ['Stripe', 'Subscription billing and payments', 'Billing contact, payment details', '[To be confirmed]'],
          ['Vercel', 'Application hosting', 'Requests in transit, logs', '[To be confirmed]'],
          ['Resend', 'Transactional email', 'Email addresses, email content', '[To be confirmed]'],
          ['PostHog', 'Product analytics', 'Usage events, user identifiers', 'EU'],
        ]}
      />

      <h2>7. International transfers</h2>
      <p>
        Where a sub-processor processes personal data outside the UK or EEA, the transfer is covered by adequacy regulations, the UK International Data
        Transfer Addendum, or the EU Standard Contractual Clauses as applicable.
      </p>

      <h2>8. Personal data breaches</h2>
      <p>We will notify the customer without undue delay, and in any case within 72 hours, after becoming aware of a personal data breach affecting customer data, with the information the customer needs to meet its own obligations.</p>

      <h2>9. Deletion and return</h2>
      <p>
        Customers can export their data at any time. When a workspace is deleted, its data is purged after 30 days. Call recordings are deleted on the
        schedule for the customer&rsquo;s plan (90 days on Starter, 1 year on Growth). Call metadata is retained for 3 years.
      </p>

      <h2>10. Audits</h2>
      <p>On reasonable written request, no more than once a year, we will provide information needed to demonstrate compliance with this addendum.</p>

      <h2>11. Contact</h2>
      <p>
        Questions about this addendum: <a href="mailto:privacy@decibel.io">privacy@decibel.io</a>. See also the <Link href="/privacy">privacy policy</Link>{' '}
        and <Link href="/compliance">compliance page</Link>.
      </p>
    </Prose>
  );
}

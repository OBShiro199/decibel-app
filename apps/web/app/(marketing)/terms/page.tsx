import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '@/components/marketing/prose';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: 'The terms that apply when you use Decibels, including trials, billing, acceptable use and liability.',
};

export default function TermsPage() {
  return (
    <Prose draft title="Terms of service" lead="These terms apply when you create a Decibels workspace or use the service." updated="1 October 2026">
      <h2>1. The agreement</h2>
      <p>
        These terms are between Decibels [legal entity name and company number to be confirmed] and the business that creates a workspace (&ldquo;you&rdquo;).
        The service is for business use only. The person accepting these terms confirms they have authority to do so for that business.
      </p>

      <h2>2. The service</h2>
      <p>Decibels provides a B2B contact database, a browser-based dialler and a pipeline for managing outbound calling. Features may change as the product develops.</p>

      <h2>3. Free trial</h2>
      <p>New workspaces get a 14-day trial with 1 seat, 50 credits and 60 call minutes. No payment card is needed. When the trial ends you need a paid plan to keep calling.</p>

      <h2>4. Plans, credits and billing</h2>
      <ul>
        <li>Plans are charged per seat, monthly or annually in advance. Annual billing is discounted by 20%.</li>
        <li>Credits are used to reveal mobile numbers. One reveal uses one credit. Plan credits are allocated per seat each month.</li>
        <li>Call minutes are billed at our cost plus 20%.</li>
        <li>Prices exclude VAT. Payments are handled by Stripe.</li>
        <li>[Refunds, credit rollover and cancellation terms to be confirmed.]</li>
      </ul>

      <h2>5. Your responsibilities</h2>
      <ul>
        <li>Use the service lawfully, including PECR, UK GDPR, EU GDPR and the calling rules of each country you dial.</li>
        <li>Have your own lawful basis and Legitimate Interests Assessment for your outreach.</li>
        <li>Honour opt-outs and do-not-call requests immediately.</li>
        <li>Keep login details secure and make sure only your authorised users access the workspace.</li>
      </ul>

      <h2>6. Acceptable use</h2>
      <p>You must not use Decibels to:</p>
      <ul>
        <li>call consumers for marketing, or call anyone for unlawful, misleading or harassing purposes;</li>
        <li>attempt to bypass TPS/CTPS screening, the do-not-call list or caller ID presentation;</li>
        <li>resell, scrape or bulk-export database contacts beyond what your plan allows;</li>
        <li>interfere with the service or other customers&rsquo; use of it.</li>
      </ul>
      <p>We may suspend a workspace that breaks these rules.</p>

      <h2>7. Data protection</h2>
      <p>
        The <Link href="/dpa">Data Processing Addendum</Link> forms part of these terms. How the product supports compliance is described on the{' '}
        <Link href="/compliance">compliance page</Link>. Nothing we provide is legal advice.
      </p>

      <h2>8. Data accuracy</h2>
      <p>We work to keep database contacts accurate but cannot guarantee that every record or phone number is correct or current.</p>

      <h2>9. Availability</h2>
      <p>We aim to keep the service available but do not guarantee uninterrupted service. Calls depend on third-party telephony networks outside our control. Decibels is not for emergency calls.</p>

      <h2>10. Intellectual property</h2>
      <p>We own the service and the database. You own the data you import and create. You give us permission to process it to provide the service.</p>

      <h2>11. Liability</h2>
      <p>
        Nothing in these terms limits liability that cannot be limited by law. Otherwise, neither party is liable for indirect or consequential loss, and our
        total liability in any 12-month period is limited to the fees you paid in that period. [To be reviewed.]
      </p>

      <h2>12. Ending the agreement</h2>
      <p>You can cancel from the billing settings. We may end the agreement for material breach. Deleted workspaces are purged after 30 days.</p>

      <h2>13. Law</h2>
      <p>These terms are governed by the laws of England and Wales, and the courts of England and Wales have exclusive jurisdiction.</p>

      <h2>14. Contact</h2>
      <p>
        <a href="mailto:sales@decibels.io">sales@decibels.io</a> for commercial questions, <a href="mailto:privacy@decibels.io">privacy@decibels.io</a> for
        data protection.
      </p>
    </Prose>
  );
}

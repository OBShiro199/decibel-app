import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose } from '@/components/marketing/prose';

export const metadata: Metadata = {
  title: 'Article 14 notice',
  description: 'Information for people whose business contact details appear in the Decibel database, as required by Article 14 of the GDPR.',
};

export default function Article14Page() {
  return (
    <Prose
      draft
      title="Article 14 notice"
      lead="This notice is for people whose business contact details appear in the Decibel database. We did not collect these details from you directly, so the law requires us to tell you what we hold and why."
      updated="1 October 2026"
    >
      <h2>Who holds your data</h2>
      <p>
        Decibel is the controller of the database. [Legal entity name, company number and registered address to be confirmed before publication.] Contact:{' '}
        <a href="mailto:privacy@decibel.io">privacy@decibel.io</a>.
      </p>

      <h2>What we hold</h2>
      <ul>
        <li>Your name, job title and seniority.</li>
        <li>Your employer, its size, sector and location.</li>
        <li>Business contact details: work email, direct line or mobile number used for work.</li>
        <li>Whether the number is registered with the TPS or CTPS.</li>
      </ul>
      <p>We do not hold special category data, and we do not profile you beyond your professional role.</p>

      <h2>Where it comes from</h2>
      <p>
        Licensed B2B data providers and publicly available business sources. [Named sources to be added as each licensed source is onboarded. At launch the
        database contains sample data only.]
      </p>

      <h2>Why we hold it and our lawful basis</h2>
      <p>
        We make business contact details available to our customers, who are B2B sales teams, so they can contact people in a professional capacity about
        relevant products and services. Our lawful basis is legitimate interest (Article 6(1)(f)), supported by a documented Legitimate Interests Assessment.
      </p>

      <h2>Who receives it</h2>
      <p>
        Decibel customers who search the database and reveal your contact details, and the service providers listed in our <Link href="/dpa">DPA</Link> who
        host and operate the service for us. A customer that reveals your details becomes a controller of that copy in its own right.
      </p>

      <h2>Where it is stored</h2>
      <p>In the UK (London). Where a service provider processes data elsewhere, appropriate transfer safeguards are in place.</p>

      <h2>How long we keep it</h2>
      <p>For as long as the record remains accurate and relevant to your professional role, reviewed periodically, or until you ask us to remove it.</p>

      <h2>Your rights</h2>
      <ul>
        <li>
          <strong>Object.</strong> You can object to your data being used for direct marketing at any time. This right is absolute.
        </li>
        <li>
          <strong>Erasure.</strong> You can ask us to delete your record.
        </li>
        <li>
          <strong>Access and correction.</strong> You can ask for a copy of what we hold and have it corrected.
        </li>
        <li>
          <strong>Complain.</strong> You can complain to the Information Commissioner&rsquo;s Office (ico.org.uk) or your local supervisory authority.
        </li>
      </ul>
      <p>
        To use any of these, go to the <Link href="/privacy/opt-out">opt-out page</Link> or email{' '}
        <a href="mailto:privacy@decibel.io">privacy@decibel.io</a>. Registering your number with the TPS or CTPS also stops Decibel customers calling it
        through our dialler.
      </p>

      <h2>Automated decisions</h2>
      <p>We do not make decisions about you that have legal or similarly significant effects by automated means.</p>
    </Prose>
  );
}

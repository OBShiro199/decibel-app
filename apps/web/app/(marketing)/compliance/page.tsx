import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose, ProseNote, ProseTable } from '@/components/marketing/prose';

export const metadata: Metadata = {
  title: 'Compliance',
  description: 'How Decibel handles TPS/CTPS screening, caller ID, call recording, lawful basis, data residency and retention for UK and EU outbound calling.',
  alternates: { canonical: '/compliance' },
};

export default function CompliancePage() {
  return (
    <Prose
      title="Compliance"
      lead="Outbound calling in the UK and EU comes with rules. Decibel enforces the ones a product can enforce and gives you the documents for the rest."
      updated="1 October 2026"
    >
      <ProseNote>This page describes how the product works. It is not legal advice.</ProseNote>

      <h2>TPS and CTPS screening</h2>
      <p>
        Regulation 21 of the Privacy and Electronic Communications Regulations (PECR) prohibits unsolicited live marketing calls to numbers registered with the
        Telephone Preference Service (TPS) or the Corporate TPS (CTPS), unless the person has told you they do not object.
      </p>
      <p>
        Decibel checks every number before every dial. The check runs on our servers as part of placing the call, so it cannot be skipped from the browser.
        If a number is listed, the call is blocked and the rep sees why. Numbers imported by CSV are screened row by row in the same way.
      </p>

      <h2>Your do-not-call list</h2>
      <p>
        Each workspace has its own do-not-call list. When a rep logs the outcome &ldquo;Do not call&rdquo;, or an admin adds a number, it takes effect
        immediately: the next attempt to dial that number from anyone in the workspace is blocked.
      </p>

      <h2>Caller ID</h2>
      <p>
        Every call presents a valid caller ID that the person can ring back: either your workspace number or an existing number you have verified. There is
        no option to withhold the number.
      </p>

      <h2>Call recording notices</h2>
      <p>Calls are recorded so teams can review and coach. Workspace admins choose how people are told:</p>
      <ul>
        <li>
          <strong>Always.</strong> A recording announcement plays at the start of every call.
        </li>
        <li>
          <strong>Rep&rsquo;s choice.</strong> The rep decides per call, for example when they will tell the person themselves.
        </li>
        <li>
          <strong>Never.</strong> No automatic announcement. You are responsible for informing people another way.
        </li>
      </ul>
      <p>We recommend &ldquo;Always&rdquo; unless you have taken advice on your own approach.</p>

      <h2>Lawful basis</h2>
      <p>
        For B2B outreach the lawful basis under UK GDPR and EU GDPR is legitimate interest (Article 6(1)(f)). That basis needs a documented Legitimate
        Interests Assessment (LIA) showing the purpose, why the processing is necessary, and how it balances against the rights of the people you contact.
      </p>
      <p>
        Decibel maintains an LIA for the database. As a customer you are a controller for your own outreach, so you need one too.{' '}
        <a href="/lia-template.txt" download>
          Download LIA template
        </a>
      </p>

      <h2>Article 14 notices</h2>
      <p>
        People in the database did not give us their details directly, so Article 14 of the GDPR requires that they are told who holds their data, why, and
        how to object. Our notice is published at <Link href="/art-14">Article 14 notice</Link>.
      </p>

      <h2>Right to object and erasure</h2>
      <p>
        Anyone can object to direct marketing at any time, and that objection is absolute. People can ask to be removed at{' '}
        <Link href="/privacy/opt-out">Opt out</Link>. Customers can action objections themselves by marking a person &ldquo;Do not call&rdquo; or deleting the
        record.
      </p>

      <h2>Data residency and sub-processors</h2>
      <p>The primary database, including contact records, call metadata and recordings metadata, is hosted in the UK (Supabase eu-west-2, London).</p>
      <ProseTable
        head={['Sub-processor', 'Purpose']}
        rows={[
          ['Supabase', 'Database, authentication and file storage (London)'],
          ['Twilio', 'Voice calls, phone numbers and call recordings'],
          ['Stripe', 'Subscription billing and payments'],
          ['Vercel', 'Application hosting'],
          ['Resend', 'Transactional email'],
          ['PostHog', 'Product analytics'],
        ]}
      />
      <p>
        Details of each sub-processor are listed in the <Link href="/dpa">Data Processing Addendum</Link>.
      </p>

      <h2>Retention</h2>
      <ProseTable
        head={['Data', 'Kept for']}
        rows={[
          ['Call recordings, Starter plan', '90 days'],
          ['Call recordings, Growth plan', '1 year'],
          ['Call metadata (who, when, duration, outcome)', '3 years'],
          ['Deleted workspaces', 'Purged 30 days after deletion'],
        ]}
      />

      <h2>Country notes</h2>
      <p>
        Rules differ by country. Germany and Austria are notably stricter about unsolicited B2B calls and generally expect prior or at least presumed consent.
        Decibel shows a warning in the product when you search for or open contacts in those countries. Check local rules before calling outside the UK.
      </p>

      <h2>Ofcom and abandoned calls</h2>
      <p>
        Ofcom&rsquo;s rules on abandoned and silent calls are aimed at predictive diallers that place more calls than there are agents to answer. The
        Decibel dialler places one call at a time, started by a rep who is on the line when it connects, so those rules do not apply to it.
      </p>

      <h2>Questions</h2>
      <p>
        Email <a href="mailto:privacy@decibel.io">privacy@decibel.io</a> and we will answer in plain English.
      </p>
    </Prose>
  );
}

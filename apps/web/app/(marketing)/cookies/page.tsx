import type { Metadata } from 'next';
import { CookieSettingsButton } from '@/components/marketing/cookie-banner';
import { Prose, ProseTable } from '@/components/marketing/prose';

export const metadata: Metadata = {
  title: 'Cookie policy',
  description: 'The cookies and browser storage Decibel uses, what they are for, and how to change your choice.',
  alternates: { canonical: '/cookies' },
};

export default function CookiesPage() {
  return (
    <Prose
      draft
      title="Cookie policy"
      lead="We keep cookies and similar browser storage to a minimum. Analytics are off unless you accept them."
      updated="1 October 2026"
    >
      <h2>What we use</h2>
      <ProseTable
        head={['Name', 'Type', 'Purpose', 'Category']}
        rows={[
          [<code key="c">decibels.cookies</code>, 'Local storage', 'Remembers your cookie choice', 'Essential'],
          ['Sign-in session', 'Cookie', 'Keeps you logged in to the app', 'Essential'],
          ['PostHog', 'Cookie and local storage', 'Product and website analytics, set only if you accept analytics', 'Analytics (optional)'],
        ]}
      />

      <h2>Essential storage</h2>
      <p>Essential items are needed for the site and app to work, for example to keep you signed in. They cannot be switched off here.</p>

      <h2>Analytics</h2>
      <p>
        If you choose &ldquo;Accept analytics&rdquo;, we use PostHog to record page views and clicks on this site so we can see what is useful. If you choose
        &ldquo;Essential only&rdquo;, or make no choice, no analytics events are sent from this site.
      </p>

      <h2>Change your choice</h2>
      <p>You can change your mind at any time. This reopens the cookie banner.</p>
      <p>
        <CookieSettingsButton />
      </p>
      <p>You can also clear cookies and site data in your browser settings.</p>

      <h2>Contact</h2>
      <p>
        Questions: <a href="mailto:oliver@usedecibel.com">oliver@usedecibel.com</a>.
      </p>
    </Prose>
  );
}

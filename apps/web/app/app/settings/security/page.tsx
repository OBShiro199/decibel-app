'use client';
import Link from 'next/link';
import { Badge } from '@/components/ui/display';
import { Section, SettingsPage } from '../_components';

const IN_PLACE: [string, string][] = [
  ['Row-level security on every table', 'Each query runs as the logged-in user. The database itself refuses rows from other workspaces.'],
  ['Private call recordings', 'Recordings sit in private storage. Playback uses signed links that expire after 1 hour.'],
  ['Telephony secrets in a vault', 'Twilio credentials are stored in Supabase Vault and never reach the browser.'],
  ['Signed webhooks', 'Incoming Twilio and Stripe webhooks are rejected unless their signature is valid.'],
];
const PLANNED: [string, string][] = [
  ['SSO / SAML', 'Single sign-on through your identity provider.'],
  ['SOC 2', 'We have not been audited yet. We will say so here when that changes.'],
];

export default function SecurityPage() {
  return (
    <SettingsPage title="Security" description="How your workspace data is protected today, and what is still to come.">
      <Section title="In place">
        <ul className="card divide-y divide-white-800">
          {IN_PLACE.map(([title, body]) => (
            <li key={title} className="flex items-start gap-4 px-6 py-4">
              <div className="min-w-0 flex-1">
                <p>{title}</p>
                <p className="t-small mt-0.5 text-black-700">{body}</p>
              </div>
              <Badge tone="success">Active</Badge>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Planned">
        <ul className="card divide-y divide-white-800">
          {PLANNED.map(([title, body]) => (
            <li key={title} className="flex items-start gap-4 px-6 py-4">
              <div className="min-w-0 flex-1">
                <p>{title}</p>
                <p className="t-small mt-0.5 text-black-700">{body}</p>
              </div>
              <Badge>Planned</Badge>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Your access">
        <div className="card divide-y divide-white-800">
          <div className="flex flex-wrap items-center gap-4 px-6 py-4">
            <p className="min-w-0 flex-1">Change your password or log out of other devices.</p>
            <Link href="/app/settings/sessions" className="link">
              Sessions
            </Link>
          </div>
          <div className="flex flex-wrap items-center gap-4 px-6 py-4">
            <p className="min-w-0 flex-1">Review who has access to this workspace and their roles.</p>
            <Link href="/app/settings/members" className="link">
              Members
            </Link>
          </div>
        </div>
      </Section>
    </SettingsPage>
  );
}

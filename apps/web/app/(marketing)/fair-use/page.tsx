import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose, ProseNote } from '@/components/marketing/prose';
import { FAIR_USE_MINUTES, PRO } from '@/lib/constants';
import { FOUNDER } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Fair use policy',
  description: `What "unlimited calls" means on Decibel Pro: ${FAIR_USE_MINUTES.toLocaleString('en-GB')} call minutes per seat each month included, then minutes at cost.`,
  alternates: { canonical: '/fair-use' },
};

const mins = FAIR_USE_MINUTES.toLocaleString('en-GB');

export default function FairUsePage() {
  return (
    <Prose
      title="Fair use policy"
      lead={`Decibel ${PRO.name} includes unlimited calls from the browser dialler for normal sales use. This page explains what that means in practice.`}
      updated="6 October 2026"
    >
      <ProseNote>In short: {mins} minutes per seat each month are included. Past that, extra minutes are charged at cost, and we will talk to you before that happens.</ProseNote>

      <h2>What is included</h2>
      <p>
        Every {PRO.name} seat includes {mins} minutes of calls each calendar month from the Decibel browser dialler and power dialler. That is roughly 50 minutes
        of talk time every working day, which covers a full-time rep calling all day. Minutes are counted per seat and reset on the first day of each month.
        Unused minutes do not roll over.
      </p>

      <h2>After {mins} minutes</h2>
      <p>
        If a seat goes past {mins} minutes in a month, the extra minutes are charged at cost: what our telecoms carrier charges us for those calls, with no
        markup. We will get in touch with the workspace owner before any extra minutes are charged, so there are no surprises.
      </p>

      <h2>What counts as fair use</h2>
      <p>Unlimited calls are for people making live sales calls, one at a time, from Decibel. That means:</p>
      <ul>
        <li>A person is on every call. Decibel never dials automatically without a rep, and there is no predictive or parallel dialling.</li>
        <li>One seat is used by one person. Sharing a login between several reps is not fair use.</li>
        <li>Calls are business calls made in line with the law, including TPS and CTPS rules, which Decibel screens for on every dial.</li>
      </ul>
      <p>These are not fair use, and we may suspend calling if we see them:</p>
      <ul>
        <li>Automated or recorded-message calls, or using Decibel to connect calls for a third party.</li>
        <li>Reselling minutes, or routing other systems&rsquo; calls through Decibel.</li>
        <li>Calls to premium-rate or revenue-sharing numbers.</li>
        <li>Patterns that suggest abuse of the network, such as very short repeated calls to the same numbers.</li>
      </ul>

      <h2>Free trial</h2>
      <p>
        The 14-day free trial includes 60 minutes of calls so you can try the dialler properly. Choose a plan to continue calling after that.
      </p>

      <h2>Questions</h2>
      <p>
        If your team calls more than this and you want a fixed price instead, email <a href={`mailto:${FOUNDER.email}`}>{FOUNDER.email}</a> and we will work
        something out. See also our <Link href="/terms">terms</Link>.
      </p>
    </Prose>
  );
}

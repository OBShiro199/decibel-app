import type { Metadata } from 'next';
import Link from 'next/link';
import { Prose, ProseNote } from '@/components/marketing/prose';
import { FAIR_USE_MINUTES, PRO } from '@/lib/constants';
import { FOUNDER } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Dialler minutes',
  description: `How dialler minutes work on Decibel Pro: ${FAIR_USE_MINUTES.toLocaleString('en-GB')} minutes a month included, then ${PRO.extraMinutePence}p a minute.`,
  alternates: { canonical: '/fair-use' },
};

const mins = FAIR_USE_MINUTES.toLocaleString('en-GB');

export default function FairUsePage() {
  return (
    <Prose
      title="Dialler minutes"
      lead={`Decibel ${PRO.name} includes ${mins} dialler minutes every month. This page explains how they are counted and what extra minutes cost.`}
      updated="6 October 2026"
    >
      <ProseNote>In short: {mins} dialler minutes a month are included. Past that, each extra minute is {PRO.extraMinutePence}p, and you can see your minutes in the app at any time.</ProseNote>

      <h2>What is included</h2>
      <p>
        {PRO.name} includes {mins} minutes of calls each calendar month from the Decibel browser dialler and power dialler. That is roughly 50 minutes
        of talk time every working day, which covers a full-time rep calling all day. Minutes reset on the first day of each month.
        Unused minutes do not roll over.
      </p>

      <h2>After {mins} minutes</h2>
      <p>
        Past {mins} minutes in a month, each extra minute is {PRO.extraMinutePence}p, rounded up to the next whole minute and added to your next monthly invoice.
        The workspace owner gets an email when the allowance is nearly used up, so there are no surprises.
      </p>

      <h2>What counts as fair use</h2>
      <p>Dialler minutes are for people making live sales calls, one at a time, from Decibel. That means:</p>
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


      <h2>Questions</h2>
      <p>
        If your team calls more than this and you want a fixed price instead, email <a href={`mailto:${FOUNDER.email}`}>{FOUNDER.email}</a> and we will work
        something out. See also our <Link href="/terms">terms</Link>.
      </p>
    </Prose>
  );
}

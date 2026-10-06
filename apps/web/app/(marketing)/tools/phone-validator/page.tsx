import type { Metadata } from 'next';
import { ToolPage } from '@/components/marketing/tool-page';

export const metadata: Metadata = {
  title: 'Free phone number validator',
  description: 'Check if a phone number is valid and see whether it is a mobile or landline, plus its network and correct format. Free for UK and EU numbers.',
  alternates: { canonical: '/tools/phone-validator' },
};

export default function PhoneValidatorPage() {
  return (
    <ToolPage
      tool="phone"
      path="/tools/phone-validator"
      name="Phone number validator"
      title="Free phone number validator."
      lede="Check that a number is real before you call it: valid or not, mobile or landline, which network it belongs to and how to write it properly."
      dailyLimit={5}
      corners={['UK + EU', 'Line type + network']}
      meanings={[
        { tag: 'Valid', title: 'A real, allocated number', body: 'The number fits the national numbering plan and is assigned to a network, so it can be dialled.' },
        { tag: 'Line type', title: 'Mobile, landline or VoIP', body: 'Know whether you are reaching someone’s mobile or a switchboard before you pick up the phone.' },
        { tag: 'Invalid', title: 'Not a usable number', body: 'Usually a missing or extra digit, or a number from a range that is not in use. It cannot be called as written.' },
      ]}
      steps={[
        ['We read the number', 'Any format works: 07700 900123, +44 7700 900123 or 0044 7700 900123. Numbers without a country code are treated as UK.'],
        ['We check it against the numbering plan', 'Invalid numbers are caught straight away, at no cost to anyone.'],
        ['We look up the line', 'For valid numbers we look up the line type and network, then show the number in national and international format.'],
      ]}
      faqs={[
        { question: 'Which countries does it support?', answer: 'Any country, but it is built for UK and EU numbers. Enter the number with its country code, for example +33 or +49, if it is not a UK number.' },
        { question: 'Does it tell me if the phone is switched on?', answer: 'No. It confirms the number is valid and which network and line type it belongs to. It does not ring the phone or check whether it is switched on.' },
        { question: 'How many numbers can I check?', answer: 'Five a day for free, with no sign-up. Invalid numbers do not count against your limit.' },
        { question: 'Is this the same as a TPS check?', answer: 'No. A valid number can still be registered on the TPS or CTPS. Use our free TPS checker to see whether you are allowed to make a sales call to it.' },
        { question: 'Do you keep the numbers I check?', answer: 'We keep only a scrambled (hashed) copy for a short time so repeat checks are instant and our limits can work. We never store the number itself.' },
      ]}
      cta="Valid numbers are only the start. Call them from your browser."
    />
  );
}

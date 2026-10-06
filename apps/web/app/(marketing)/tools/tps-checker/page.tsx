import type { Metadata } from 'next';
import { ToolPage } from '@/components/marketing/tool-page';

export const metadata: Metadata = {
  title: 'Free TPS and CTPS checker',
  description: 'Check a UK phone number against the Telephone Preference Service and Corporate TPS registers for free, before you make a sales call.',
  alternates: { canonical: '/tools/tps-checker' },
};

export default function TpsCheckerPage() {
  return (
    <ToolPage
      tool="tps"
      path="/tools/tps-checker"
      name="TPS and CTPS checker"
      title="Free TPS and CTPS checker."
      lede="Enter a UK number to see whether it is registered on the Telephone Preference Service or the Corporate TPS, before you make a sales call."
      dailyLimit={3}
      corners={['TPS + CTPS', 'Live register check']}
      meanings={[
        { tag: 'Clear', title: 'Not on either register', body: 'You can make a live sales call, as long as the person has not told you to stop and the number is not on your own do-not-call list.' },
        { tag: 'TPS', title: 'Registered on the TPS', body: 'An individual, sole trader or partnership has opted out. No unsolicited marketing calls unless they have told you they do not object.' },
        { tag: 'CTPS', title: 'Registered on the CTPS', body: 'A company or organisation has opted out. The same rule applies: no unsolicited marketing calls to this number.' },
      ]}
      steps={[
        ['We tidy the number', 'Spaces and brackets are removed and the number is put into standard UK format. Only UK numbers can be on the TPS or CTPS.'],
        ['We check both registers', 'The number is looked up against the current TPS and CTPS registers through a TPS screening service.'],
        ['You get the answer', 'Registered or not, for each register. Checks of the same number in the next few days come back instantly.'],
      ]}
      faqs={[
        { question: 'Is this TPS check free?', answer: 'Yes. You can check three numbers a day for free, with no sign-up.' },
        { question: 'Do I need to check business numbers?', answer: 'Yes. Companies can register on the Corporate TPS (CTPS), and sole traders and partnerships register on the TPS. Under PECR you must not make unsolicited marketing calls to a registered number, whether it is a landline or a mobile.' },
        { question: 'How often should I screen my call list?', answer: 'The TPS recommends screening at least every 28 days, because new registrations take effect 28 days after they are made. Many teams check at the moment of dialling.' },
        { question: 'If a number is clear, can I always call it?', answer: 'Not always. You must also respect anyone who has told you not to call them, and keep your own do-not-call list. This tool is a helpful check, not legal advice.' },
        { question: 'Do you keep the numbers I check?', answer: 'We keep only a scrambled (hashed) copy of each number for a few days, so repeat checks are instant and our limits can work. We never store the number itself.' },
      ]}
      cta="Find the right people, check them and call them in one place."
    />
  );
}

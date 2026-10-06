import type { Metadata } from 'next';
import { ToolPage } from '@/components/marketing/tool-page';

export const metadata: Metadata = {
  title: 'Free email verifier',
  description: 'Check whether an email address exists and will accept mail before you send. Free email verification for sales and outbound teams.',
  alternates: { canonical: '/tools/email-verifier' },
};

export default function EmailVerifierPage() {
  return (
    <ToolPage
      tool="email"
      path="/tools/email-verifier"
      name="Email verifier"
      title="Free email verifier."
      lede="Check whether an email address exists before you send, so your messages land and your sending reputation stays healthy."
      dailyLimit={5}
      corners={['Mailbox check', 'No email sent']}
      meanings={[
        { tag: 'Deliverable', title: 'The mailbox exists', body: 'The mail server confirmed the address. It is safe to send.' },
        { tag: 'Accept-all', title: 'The domain accepts everything', body: 'Some company servers accept every address, so a single mailbox cannot be confirmed. Mail may still arrive.' },
        { tag: 'Unknown', title: 'No clear answer', body: 'The mail server did not respond clearly, often because it is busy or rate limiting. Try again later.' },
        { tag: 'Undeliverable', title: 'It will bounce', body: 'The address does not exist or is a throwaway inbox. Remove it from your list.' },
      ]}
      steps={[
        ['We check the format', 'Obvious typos and malformed addresses are caught before anything else happens.'],
        ['We ask the mail server', 'A verification service asks the domain’s mail server whether the mailbox exists. No email is sent to the person.'],
        ['You get the answer', 'Deliverable, accept-all, unknown or undeliverable, plus whether it is a free provider or a role address like info@.'],
      ]}
      faqs={[
        { question: 'Does this send an email to the address?', answer: 'No. The check talks to the mail server without delivering a message, so the person never sees anything.' },
        { question: 'What does accept-all mean?', answer: 'Some company mail servers are set to accept mail for any address at their domain. That means no checker can confirm a specific mailbox there. Treat these addresses with a little caution.' },
        { question: 'How many emails can I check?', answer: 'Five a day for free, with no sign-up.' },
        { question: 'Why does verifying emails matter?', answer: 'Bounced emails hurt your sender reputation, which makes it more likely that your future emails land in spam. Checking before you send keeps bounce rates low.' },
        { question: 'Do you keep the emails I check?', answer: 'We keep only a scrambled (hashed) copy for a short time so repeat checks are instant and our limits can work. We never store the address itself.' },
      ]}
      cta="Find the right person, then call them directly."
    />
  );
}

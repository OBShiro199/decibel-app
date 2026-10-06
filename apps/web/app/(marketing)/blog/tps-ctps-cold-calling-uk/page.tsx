import type { Metadata } from 'next';
import Link from 'next/link';
import { BlogArticle, InlineCta } from '@/components/marketing/blog';
import { ProseTable } from '@/components/marketing/prose';
import { BLOG_AUTHOR, postBySlug } from '@/lib/blog';

const SLUG = 'tps-ctps-cold-calling-uk';
const post = postBySlug(SLUG)!;

export const metadata: Metadata = {
  title: post.title,
  description: post.description,
  alternates: { canonical: `/blog/${SLUG}` },
  openGraph: {
    type: 'article',
    title: post.title,
    description: post.description,
    url: `/blog/${SLUG}`,
    siteName: 'Decibel',
    locale: 'en_GB',
    publishedTime: post.date,
    authors: [BLOG_AUTHOR.name],
  },
};

const ICO_GUIDANCE = 'https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/';

export default function Page() {
  return (
    <BlogArticle slug={SLUG}>
      <p>
        <em>
          This is a practical guide, not legal advice. Check the <a href={ICO_GUIDANCE}>ICO’s guidance</a> or a solicitor for your situation.
        </em>
      </p>
      <p>
        Cold calling businesses is legal in the UK. It is also regulated, and most of the rules that matter to an outbound team sit in one place: the Privacy and
        Electronic Communications Regulations 2003, usually shortened to PECR. If your reps call people who have not asked to hear from you, PECR decides who
        they may call, what they must show when they do, and what happens when they get it wrong.
      </p>
      <p>
        This guide covers the two registers at the centre of those rules, the Telephone Preference Service (TPS) and the Corporate Telephone Preference Service
        (CTPS), and turns them into a routine your team can follow every day.
      </p>

      <h2>The short version</h2>
      <ul>
        <li>Do not make unsolicited live marketing calls to a number on the TPS or CTPS, unless that subscriber has told you they do not object to your calls.</li>
        <li>Do not call anyone who has told you not to call them, whether or not they are registered. Keep your own do-not-call list.</li>
        <li>Screen your data against both registers at least every 28 days, and ideally at the moment you dial.</li>
        <li>Always present a number people can call back. Never withhold it.</li>
        <li>Say who you are calling from, and give an address or freephone number if asked.</li>
      </ul>

      <h2>What PECR regulation 21 says</h2>
      <p>Regulation 21 deals with unsolicited calls made for direct marketing purposes. In plain terms, you must not make such a call to a line where:</p>
      <ul>
        <li>the subscriber has previously told you that they do not want marketing calls from you on that line; or</li>
        <li>the number is listed on the register kept under regulation 26, which in practice means the TPS and the CTPS.</li>
      </ul>
      <p>
        There is one exception for registered numbers: where the subscriber has told you that, for the time being, they do not object to your calls on that
        line. There is also a short lag built in, because a new registration only takes effect 28 days after it is made. That is where the 28-day screening
        rhythm comes from.
      </p>
      <p>
        Regulation 21 covers live calls made by a person. Automated, pre-recorded calls fall under a separate rule and need prior consent, which is a much higher
        bar. Everything in this guide assumes a real rep on a real call.
      </p>

      <h2>TPS and CTPS: who is on which register</h2>
      <p>
        PECR splits subscribers, meaning the person or organisation that holds the contract for the line, into two groups. Which register applies depends on who
        that subscriber is, not on whether the number is a landline or a mobile.
      </p>
      <ProseTable
        head={['At a glance', 'TPS', 'CTPS']}
        rows={[
          ['Who it is for', 'Individual subscribers', 'Corporate subscribers'],
          [
            'Includes',
            'Consumers, sole traders and, in England, Wales and Northern Ireland, partnerships that are not limited',
            'Limited companies, LLPs, Scottish partnerships, government bodies, schools and other corporate bodies',
          ],
          ['Number types', 'Landlines and mobiles', 'Landlines and mobiles'],
          ['Effect on cold calls', 'No unsolicited live marketing calls unless the subscriber has said they do not object', 'The same'],
        ]}
      />
      <p>
        The practical point: you cannot assume a business number is safe to call because it belongs to a business. A sole trader’s number is screened against
        the TPS, a limited company’s against the CTPS, and many switchboards and direct dials are registered. Screen against both registers every time, since
        you will rarely know for certain which kind of subscriber holds the line.
      </p>

      <h2>What counts as a marketing call</h2>
      <p>
        Direct marketing under PECR covers more than selling. The ICO treats any communication that promotes the products, services, aims or ideals of an
        organisation as marketing. For a B2B outbound team, that means:
      </p>
      <ul>
        <li>sales calls and appointment-setting calls are marketing;</li>
        <li>calls offering a demo, a trial or an invitation to an event are marketing;</li>
        <li>“research” calls that are really a route into a sales conversation are marketing too.</li>
      </ul>
      <p>
        Genuinely neutral calls, such as chasing an unpaid invoice or confirming an order the customer placed, are not marketing. But if part of the purpose of
        a call is to promote something, treat the whole call as a marketing call.
      </p>

      <h2>The “do not object” exception</h2>
      <p>
        A registered number is not off limits forever. If the subscriber has specifically told you that they are happy to receive calls from you, you can call
        them even though they are on the TPS or CTPS. Two cautions:
      </p>
      <ul>
        <li>
          <strong>It has to come from them, to you.</strong> A tick box on someone else’s website, or permission given to a data supplier, is not the same as
          the subscriber telling your organisation.
        </li>
        <li>
          <strong>Record it.</strong> Note who said it, when and for which number, so you can show it later. The permission is “for the time being”, so if they
          withdraw it, it is gone.
        </li>
      </ul>

      <h2>Your own do-not-call list matters as much</h2>
      <p>
        The second half of regulation 21 is easy to forget. If someone tells you not to call them again, you must not, whatever the registers say. That applies
        to your whole organisation, not only the rep who took the call.
      </p>
      <p>
        A practical setup is a single suppression list that every rep and every tool checks before dialling, updated the moment someone says “please don’t call
        me again”. Make the do-not-call outcome one click, so nobody has to remember to update a spreadsheet at the end of the day.
      </p>

      <h2>How often to screen</h2>
      <p>
        The TPS advises screening your data against the registers at least every 28 days. A newly registered number becomes effective 28 days after
        registration, so a list screened in January is not safe to call in March. Organisations licensed to use the TPS data download updated files regularly,
        and most calling and data tools that offer screening rely on one of those licensed feeds. The <a href="https://www.tpsonline.org.uk/">TPS website</a>{' '}
        explains the options for organisations that call.
      </p>
      <p>
        Every 28 days is the minimum. Screening at the moment of dialling is better, because it closes the gap altogether and means imported lists, old CRM
        records and a rep’s own contacts are all checked the same way.
      </p>

      <InlineCta location={`blog_${SLUG}_inline`} />

      <h2>Caller ID and identifying yourself</h2>
      <p>Two more PECR requirements apply to every marketing call, whether the number is registered or not:</p>
      <ul>
        <li>
          <strong>Present your number.</strong> Calling line identification must be shown on marketing calls. You cannot withhold your number, and the number
          you present should be one the person can call back, ideally reaching someone who can deal with an opt-out.
        </li>
        <li>
          <strong>Say who you are.</strong> The caller must give the name of the organisation the call is made for and, if asked, a valid address or a freephone
          number.
        </li>
      </ul>
      <p>
        Neither is difficult, but both are easy to break with the wrong setup. Personal mobiles set to withhold, or a shared number nobody ever answers, are
        common ways to fall foul of the rules without meaning to.
      </p>

      <h2>Mobiles, directors and sole traders</h2>
      <p>B2B teams increasingly call mobiles, because that is where decision makers actually answer. This is where the TPS catches people out.</p>
      <p>
        Mobile numbers can be registered on the TPS. If a director’s mobile is held in their own name as an individual subscriber and registered, it is on the
        TPS, even if they mostly use it for work. An unsolicited sales call to that number breaches regulation 21, however business-focused the conversation. A
        mobile on a company contract belongs to a corporate subscriber and could be on the CTPS instead.
      </p>
      <p>
        Sole traders and ordinary partnerships outside Scotland are individual subscribers, so their numbers sit on the TPS, not the CTPS. If you sell to small
        businesses, trades or professional practices, expect a higher share of TPS hits.
      </p>
      <p>The safe rule is the simple one: screen every number against both registers, whatever it is and whoever you think holds it.</p>

      <h2>What happens if you get it wrong</h2>
      <p>
        The ICO enforces PECR. It receives complaints from the public, many of which are passed on by the TPS, and it regularly fines organisations for making
        unsolicited marketing calls to registered numbers. Historically the maximum PECR fine was £500,000. The Data (Use and Access) Act 2025 brings PECR fines
        up to UK GDPR levels, which means up to £17.5 million or 4% of global annual turnover, whichever is higher. The ICO can also issue enforcement notices
        requiring you to stop.
      </p>
      <p>
        Ofcom is the other regulator to know. Its persistent misuse rules target abandoned and silent calls, which mostly come from predictive diallers that ring
        more numbers than there are agents free to answer. Ofcom’s policy expects the abandoned call rate to stay at or below 3%, with an information message
        played when a call is abandoned. A power dialler that dials one number at a time, with the rep on the line when it connects, does not create abandoned
        calls in the first place.
      </p>
      <p>
        Then there is the commercial cost. A prospect who receives an unwanted call on a registered number is unlikely to become a customer, and a complaint can
        follow your company name around.
      </p>

      <h2>A practical screening checklist</h2>
      <ol>
        <li>Screen every list against both TPS and CTPS before it reaches your dialler, including CSV imports and old CRM data.</li>
        <li>Re-screen at least every 28 days, or check each number at the point of dialling.</li>
        <li>Keep one organisation-wide do-not-call list and check it before every call.</li>
        <li>Log “do not call” requests immediately, with the date and the number.</li>
        <li>Record any “I don’t object to your calls” permission from a registered subscriber: who, when and which number.</li>
        <li>Present a callable caller ID on every call. Never withhold.</li>
        <li>Train reps to name the company and give an address or freephone number when asked.</li>
        <li>Avoid predictive dialling unless you can stay within Ofcom’s abandoned call rules.</li>
        <li>Keep evidence of screening dates, suppression lists and call logs in case the ICO asks.</li>
      </ol>

      <h2>How Decibel handles it</h2>
      <p>
        We built Decibel so these steps happen automatically rather than from memory. Every dial is checked against TPS and CTPS on our servers as part of
        placing the call, so it cannot be skipped from the browser. If a number is listed, the call is blocked and the rep sees why. Each workspace has its own
        do-not-call list, which takes effect the moment a rep logs that outcome. Caller ID is always presented, with no option to withhold, and CSV imports are
        screened row by row in the same way as contacts from our database. More detail is on our <Link href="/compliance">compliance page</Link>.
      </p>
      <p>
        Whatever tools you use, the principle is the same: put the rules where the calls happen, so compliance does not depend on someone checking a spreadsheet
        at the end of a long day.
      </p>
    </BlogArticle>
  );
}

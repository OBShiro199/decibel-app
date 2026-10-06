import type { Metadata } from 'next';
import Link from 'next/link';
import { BlogArticle, InlineCta } from '@/components/marketing/blog';
import { BLOG_AUTHOR, postBySlug } from '@/lib/blog';

const SLUG = 'gdpr-cold-calling-b2b';
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
        Ask an outbound team about compliance and most will mention the TPS. Fewer will mention GDPR, yet it applies to every call they make to a named person.
        Screening tells you whether you may dial a number. Data protection law governs everything around it: where the contact came from, why you hold it, what
        you tell the person and what you do when they say no.
      </p>
      <p>
        This guide walks through UK GDPR as it applies to B2B cold calling, with a note on calling into the EU, and ends with a checklist you can adopt as it
        stands.
      </p>

      <h2>Two sets of rules, one phone call</h2>
      <p>In the UK, a B2B sales call sits under two overlapping regimes:</p>
      <ul>
        <li>
          <strong>PECR</strong>, the Privacy and Electronic Communications Regulations 2003, sets the specific rules for marketing calls: TPS and CTPS screening,
          honouring requests not to be called, and presenting caller ID. Our <Link href="/blog/tps-ctps-cold-calling-uk">guide to TPS and CTPS</Link> covers
          these in detail.
        </li>
        <li>
          <strong>UK GDPR</strong> and the <strong>Data Protection Act 2018</strong> govern the personal data you use to make the call: the name, job title,
          phone number and any notes about the person.
        </li>
      </ul>
      <p>
        Complying with one does not mean you comply with the other. A number can be clear of the TPS and still be one you have no business holding, and a
        perfectly sourced contact can still be on the CTPS.
      </p>

      <h2>Business contact details are personal data</h2>
      <p>
        A common myth is that GDPR does not apply to B2B. It does, whenever the data relates to an identifiable person. “Sarah Patel, Head of Operations, 07700
        900123” is personal data, even though it is about her job. A switchboard number with no name attached is not, but outbound teams rarely call those by
        choice.
      </p>
      <p>
        That makes your organisation a controller for the contact data in your CRM and dialler. You decide why and how it is used, so you are responsible for
        having a lawful basis, being transparent and respecting the person’s rights.
      </p>

      <h2>Choosing a lawful basis</h2>
      <p>Article 6 of UK GDPR lists six lawful bases. For B2B cold calling, two are realistic:</p>
      <ul>
        <li>
          <strong>Consent</strong> is possible but rarely practical. It must be specific, informed and freely given, and you would need it before the first
          call, which defeats the purpose of cold outreach.
        </li>
        <li>
          <strong>Legitimate interests</strong>, under Article 6(1)(f), is the usual basis. Recital 47 says that direct marketing may be regarded as carried out
          for a legitimate interest, and the ICO accepts it for B2B calling where the balance is right.
        </li>
      </ul>
      <p>
        Note the word “may”. Legitimate interests is not automatic. It is the most flexible lawful basis, and in exchange you are expected to show your working.
      </p>

      <h2>The three-part test and your LIA</h2>
      <p>
        The ICO describes legitimate interests as a three-part test. Write your answers down in a Legitimate Interests Assessment (LIA) before you start
        calling, and review it whenever your targeting or data sources change.
      </p>
      <h3>1. Purpose</h3>
      <p>
        Is there a legitimate interest behind the processing? Promoting your products and services to businesses that could use them is a recognised commercial
        interest. Be specific about which roles, which industries and which offer.
      </p>
      <h3>2. Necessity</h3>
      <p>
        Is processing this person’s data necessary for that purpose, and is there a less intrusive way to achieve it? Reaching the person responsible for a
        buying decision usually needs their name, role and a direct number. Their home address or personal social media does not.
      </p>
      <h3>3. Balancing</h3>
      <p>
        Do the person’s interests, rights and freedoms override yours? Ask whether they would reasonably expect the call. A head of sales receiving a call about
        a sales tool is well within expectations. A junior employee called about something unrelated to their role is not. Weigh up the safeguards you have in
        place, such as screening, a clear opt-out and short retention.
      </p>
      <p>
        A good LIA is a page or two, not a dissertation. It should record what you decided, why, and the safeguards that tip the balance. If the ICO ever asks,
        it is the first document you will want to hand over.
      </p>

      <h2>Telling people: Article 14 notices</h2>
      <p>
        When you collect data directly from someone, Article 13 requires you to give them privacy information at the time. Cold outreach usually relies on data
        from elsewhere, such as a data provider, a website or a directory, so Article 14 applies instead.
      </p>
      <p>
        Under Article 14 you must give the person privacy information within a reasonable period of obtaining their data, and at the latest within one month.
        If you use the data to contact them, you must provide it at the latest at the first communication. For a cold call, that means at or before the first
        call.
      </p>
      <p>
        The notice should cover who you are, why you are processing their data, your lawful basis and legitimate interest, the categories of data, where you got
        it, how long you keep it, and their rights, including the right to object. A common approach is a short public page: the rep mentions it on the call, and
        it is linked in any follow-up email.
      </p>
      <p>
        There is a limited exemption where providing the information would involve disproportionate effort, but it is hard to rely on for direct marketing.
        Plan on providing the notice.
      </p>

      <InlineCta location={`blog_${SLUG}_inline`} />

      <h2>The right to object is absolute</h2>
      <p>
        Most GDPR rights involve some balancing. The right to object to direct marketing does not. Under Article 21(2) and (3), anyone can object to the use of
        their data for direct marketing at any time, and once they do, you must stop using it for that purpose. No assessment, no counter-arguments.
      </p>
      <p>
        Article 21 also requires you to bring this right to the person’s attention explicitly, at the latest at the first communication, presented clearly and
        separately from other information.
      </p>
      <p>For a calling team that means:</p>
      <ul>
        <li>When someone says “don’t call me again” or “take me off your list”, treat it as an objection and stop immediately.</li>
        <li>
          Suppress rather than delete. Keep just enough (usually the name and number) on a suppression list so the person is never re-imported and called again.
        </li>
        <li>Apply it across the organisation, to every rep and every tool, not only the person who took the call.</li>
      </ul>
      <p>The same request is also a PECR “do not call” instruction, so one well-run suppression list can serve both regimes.</p>

      <h2>Minimise, keep accurate, delete on time</h2>
      <p>Three principles from Article 5 do a lot of practical work in outbound:</p>
      <ul>
        <li>
          <strong>Data minimisation.</strong> Hold only what you need to make relevant calls: name, role, company, business contact details and notes about the
          conversation. Resist enriching everything just because a tool can.
        </li>
        <li>
          <strong>Accuracy.</strong> People change jobs constantly. Calling a former employee on a number that now belongs to someone else wastes time and is a
          data protection problem. Correct or remove stale records, and act on “wrong number” outcomes.
        </li>
        <li>
          <strong>Storage limitation.</strong> Set retention periods and enforce them. A contact who never engaged does not need to sit in your CRM for five
          years. Suppression entries are the exception, because you keep them to honour the objection.
        </li>
      </ul>

      <h2>Sourcing data responsibly</h2>
      <p>If you buy or license contact data, you inherit its problems. Before you sign with a provider, ask:</p>
      <ul>
        <li>Where does the data come from, and can they show provenance for individual records?</li>
        <li>What lawful basis do they rely on, and have they carried out their own LIA?</li>
        <li>Have they given the people in their database the privacy information Article 14 requires, and is their notice public?</li>
        <li>How do they handle objections and removals, and how quickly do those reach customers?</li>
        <li>How often is the data verified and refreshed?</li>
      </ul>
      <p>Keep the answers on file. Due diligence on your suppliers is part of showing that your own processing is lawful.</p>

      <h2>Recording calls</h2>
      <p>Call recordings are personal data too, and often richer than the CRM record. If you record calls:</p>
      <ul>
        <li>Tell people at the start of the call that it is being recorded and why, for example for training and quality.</li>
        <li>Identify your lawful basis. For coaching and quality, legitimate interests is common, and it belongs in your LIA.</li>
        <li>Set a retention period and delete recordings when it ends.</li>
        <li>Limit access to the people who need it, and treat requests for a copy of a recording as subject access requests.</li>
      </ul>

      <h2>Calling EU numbers</h2>
      <p>
        For contacts in the European Union, the EU GDPR applies in much the same way as UK GDPR: lawful basis, transparency, the right to object and the other
        principles above. The rules for the call itself come from each country’s implementation of the ePrivacy Directive, and they vary. Some countries run
        their own opt-out registers, and some are much stricter about unsolicited B2B calls; Germany, for example, generally expects at least presumed consent.
        Check country rules before calling EU numbers, and do not assume UK practice carries over.
      </p>

      <h2>What is at stake</h2>
      <p>
        UK GDPR fines can reach £17.5 million or 4% of global annual turnover, whichever is higher, and the ICO can order you to stop processing. Most outbound
        teams are more likely to meet complaints, subject access requests and reputational damage than a headline fine, but the controls that prevent one also
        prevent the others.
      </p>

      <h2>A practical compliance checklist</h2>
      <ol>
        <li>Map your data: where each contact came from and when.</li>
        <li>Write and date a Legitimate Interests Assessment covering your outbound calling.</li>
        <li>Publish an Article 14 notice and point people to it no later than the first call.</li>
        <li>Tell people about their right to object, clearly, at the first contact.</li>
        <li>Keep one suppression list for objections and do-not-call requests, checked before every dial.</li>
        <li>Screen against TPS and CTPS as well. GDPR compliance does not replace PECR.</li>
        <li>Collect only what you need, and correct inaccurate records.</li>
        <li>Set retention periods for contacts and recordings, and enforce them.</li>
        <li>Announce call recording at the start of the call.</li>
        <li>Carry out due diligence on data providers and keep the evidence.</li>
        <li>Check local rules before calling any EU country.</li>
      </ol>

      <h2>How Decibel helps</h2>
      <p>
        Decibel covers the parts a product can cover and gives you the documents for the rest. You can download an <a href="/lia-template.txt">LIA template</a>{' '}
        to adapt for your own outreach, and our <Link href="/art-14">Article 14 notice</Link> is public for the people in our database. With recording notices
        switched on, the person you call hears a recording announcement when they answer. Recordings are kept according to your plan, one year on Pro, and
        anyone can ask to be removed through our <Link href="/privacy/opt-out">opt-out page</Link>. Data is hosted in the UK, and every dial is screened against
        TPS, CTPS and your workspace do-not-call list.
      </p>
      <p>
        As a customer you are still a controller for your own outreach, so the LIA and the decisions in it are yours to own. The tools just make it easier to
        live up to them on every call.
      </p>
    </BlogArticle>
  );
}

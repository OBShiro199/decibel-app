import type { Metadata } from 'next';
import { BlogArticle, InlineCta } from '@/components/marketing/blog';
import { BLOG_AUTHOR, postBySlug } from '@/lib/blog';

const SLUG = 'spin-selling-cold-calling';
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

export default function Page() {
  return (
    <BlogArticle slug={SLUG}>
      <p>
        Most cold calls fail in the first thirty seconds, not because the product is wrong but because the caller starts pitching before the buyer has any
        reason to listen. SPIN selling is one of the best-researched answers to that problem. It replaces the pitch with a sequence of questions that lets the
        buyer describe their own problem and, ideally, their own reason to take a meeting.
      </p>
      <p>
        SPIN was designed for longer sales conversations, so it needs adapting for a two-minute cold call. This guide covers where it comes from, the four
        question types with examples for B2B outbound, and a call structure you can try this week.
      </p>

      <h2>Where SPIN comes from</h2>
      <p>
        SPIN comes from Neil Rackham’s book <em>SPIN Selling</em>, published in 1988. It drew on research by Rackham’s firm, Huthwaite, which analysed more than
        35,000 sales calls to work out what the most successful salespeople did differently. One of the clearest findings was that, in larger sales, top
        performers asked more questions, and different kinds of questions. Classic closing techniques mattered far less than people assumed.
      </p>
      <p>
        Rackham grouped the questions that worked into four types: Situation, Problem, Implication and Need-payoff. The research focused on complex,
        higher-value sales, and Rackham distinguished these from small, quick sales, which behave differently. A cold call sits somewhere in between: you are not
        trying to close a deal, you are trying to earn a meeting. That is the adaptation this guide makes.
      </p>

      <h2>The four question types</h2>
      <h3>Situation questions</h3>
      <p>
        Situation questions gather facts about the buyer’s current setup: tools, team size, process. They are necessary, but buyers find them tedious, and
        Rackham’s research found that less successful sellers asked far too many of them.
      </p>
      <p>
        On a cold call, research replaces most situation questions. You can usually find team size, recent hires, the tools they use and the job they do before
        you dial. Use situation questions only to confirm what you think you know:
      </p>
      <ul>
        <li>To a head of sales: “I can see you’ve hired four SDRs this year. Are they mostly on the phone, or mostly on email?”</li>
        <li>To an IT manager: “Am I right that you look after around 200 users across two offices?”</li>
        <li>To a recruitment agency owner: “Are your consultants still doing their own business development alongside delivery?”</li>
      </ul>

      <h3>Problem questions</h3>
      <p>
        Problem questions explore difficulties, dissatisfactions and things that are not working. They invite the buyer to name a problem, which Rackham calls an
        implied need. On a cold call, lead with a hypothesis rather than an open “any challenges at the moment?”, which invites a reflexive “no, we’re fine”.
      </p>
      <ul>
        <li>“Sales leaders with a newer SDR team often tell us reps spend more time finding numbers than calling them. Is that something you see?”</li>
        <li>“How are you finding patching across both sites with the team you have?”</li>
        <li>“Do your consultants struggle to find time for new client calls when they’re busy filling roles?”</li>
        <li>“How confident are you that the numbers in your CRM are still current?”</li>
      </ul>

      <h3>Implication questions</h3>
      <p>
        Implication questions take a problem and explore its consequences: cost, delay, risk and knock-on effects. This is where a minor irritation becomes
        something worth solving. Rackham found implication questions were strongly linked to success in larger sales, and they are the type most salespeople
        skip.
      </p>
      <ul>
        <li>“If each rep loses an hour a day to research, what does that do to the number of conversations you get each week?”</li>
        <li>“What happens to the pipeline target if the new hires take three months to ramp instead of one?”</li>
        <li>“When a patch is missed, who ends up dealing with it, and what does that pull them away from?”</li>
        <li>“If business development stops whenever the desk gets busy, what does that do to next quarter’s billings?”</li>
      </ul>
      <p>
        Keep implication questions concrete. Numbers, people and dates make the cost real. Two good implication questions are worth more than six vague ones.
      </p>

      <h3>Need-payoff questions</h3>
      <p>
        Need-payoff questions ask the buyer about the value of solving the problem. Rather than you explaining the benefit, the buyer states it in their own
        words, which is far more persuasive to them and gives you their language for the follow-up.
      </p>
      <ul>
        <li>“If your reps could get from a name to a live call in a few seconds, what would that mean for the team?”</li>
        <li>“How useful would it be to have every call recorded, so you could coach new starters on real conversations?”</li>
        <li>“If patching ran on its own overnight, what would you do with that time?”</li>
        <li>“What would two extra new client meetings a week be worth to the business?”</li>
      </ul>

      <InlineCta location={`blog_${SLUG}_inline`} />

      <h2>Adapting SPIN to a short cold call</h2>
      <p>On a cold call you have perhaps two minutes and no agreed agenda. The full SPIN sequence would take too long, so compress it:</p>
      <ol>
        <li>
          <strong>Open with permission.</strong> Say who you are and why you are calling, and ask for a moment. Being honest that it is a cold call tends to
          lower defences more than a clever hook does.
        </li>
        <li>
          <strong>Confirm one or two situation facts.</strong> Use your research and ask them to confirm it. It shows you have done your homework and costs them
          almost nothing.
        </li>
        <li>
          <strong>Offer a problem hypothesis.</strong> Describe a problem you see in similar companies and ask whether it applies. If they say no, ask what they
          are focused on instead, or try a second hypothesis.
        </li>
        <li>
          <strong>Ask one or two implication questions.</strong> Make the cost concrete. You are not diagnosing everything, just enough for the problem to feel
          worth a conversation.
        </li>
        <li>
          <strong>Ask a need-payoff question.</strong> Let them say why solving it would matter.
        </li>
        <li>
          <strong>Ask for the meeting.</strong> Tie it to what they just said and propose a specific time, rather than “sometime next week”.
        </li>
      </ol>

      <h2>A sample two-minute call</h2>
      <p>
        Here is how that might sound for a rep selling a sales tool to a head of sales. Treat it as a structure to adapt, not a script to read aloud.
      </p>
      <p>
        <strong>0:00, opener.</strong> “Hi James, it’s Priya from Northline. I’ll be honest, this is a cold call. Have you got thirty seconds? Feel free to tell
        me if it’s not relevant.”
      </p>
      <p>
        <strong>0:15, situation, confirmed.</strong> “I saw you’ve brought on a few new SDRs since the summer. Are they mainly working the phones?”
      </p>
      <p>
        <strong>0:30, problem hypothesis.</strong> “Teams in that position often tell us reps spend a big chunk of the day hunting for direct numbers instead of
        calling. Does that sound familiar?”
      </p>
      <p>
        <strong>0:50, implication.</strong> “Roughly how much time do you reckon that costs each rep? And what does it do to the number of conversations you’re
        getting against target?”
      </p>
      <p>
        <strong>1:20, need-payoff.</strong> “If they got that time back, what would you expect to see in the pipeline?”
      </p>
      <p>
        <strong>1:40, the ask.</strong> “That’s what we work on. Would 20 minutes on Tuesday or Wednesday be worth it, to see whether we could help?”
      </p>
      <p>
        Notice what is missing: no product tour, no feature list, and very little talking from the rep after the opener. The buyer has described the problem,
        the cost and the value. The meeting becomes the natural next step.
      </p>

      <h2>Handling “send me an email”</h2>
      <p>
        “Just send me an email” is often a polite way to end the call rather than a genuine request. Agree, then ask one question that makes the email useful
        and keeps the conversation going:
      </p>
      <blockquote>
        “Happy to. So I send you something relevant rather than a brochure, is the bigger issue finding numbers, or getting new reps up to speed?”
      </blockquote>
      <p>
        If they answer, you are back in a problem conversation and can often ask for the meeting there and then. If they do not, send a short email that
        references what they said, includes one specific suggestion and proposes a time. If they say they are not interested, respect it, and if they ask not to
        be called again, add them to your do-not-call list straight away.
      </p>

      <h2>Common mistakes</h2>
      <ul>
        <li>
          <strong>Interrogating.</strong> A string of questions with no reaction feels like a survey. Acknowledge each answer before asking the next question.
        </li>
        <li>
          <strong>Asking what you could have looked up.</strong> “So what does your company do?” tells the buyer you did no research.
        </li>
        <li>
          <strong>Leading questions.</strong> “Wouldn’t you agree that saving time is important?” is not a need-payoff question. It is a pitch with a question
          mark on the end.
        </li>
        <li>
          <strong>Skipping implication.</strong> Jumping from a problem straight to your solution leaves the problem feeling small.
        </li>
        <li>
          <strong>Forgetting the ask.</strong> A good conversation that ends with “I’ll follow up” is a missed meeting.
        </li>
      </ul>

      <h2>How to practise</h2>
      <p>Questioning is a skill, and it improves with deliberate review rather than with volume alone.</p>
      <ul>
        <li>
          <strong>Listen back to your calls.</strong> Recordings show how many situation questions you really asked, where you started pitching and where the
          buyer went quiet.
        </li>
        <li>
          <strong>Review calls weekly as a team.</strong> Pick two or three calls each week, one that booked a meeting and one that did not, and label each
          question S, P, I or N. Patterns appear quickly.
        </li>
        <li>
          <strong>Track which questions get meetings.</strong> Keep a shared list of problem hypotheses and implication questions, note which ones lead to booked
          meetings, and retire the ones that do not.
        </li>
        <li>
          <strong>Role-play the hard parts.</strong> Practise openers and the “send me an email” response until they sound natural rather than scripted.
        </li>
      </ul>

      <h2>How Decibel helps</h2>
      <p>
        SPIN works best when the research is done before you dial and the call is reviewed afterwards. In Decibel, the person’s record sits beside the
        softphone, so the situation facts are in front of you while you talk. You can take notes during the call, log the outcome with a single key and move on
        to the next person. Every call is recorded, so you and your team can review real conversations each week and see which questions earn meetings.
      </p>
      <p>The method is Rackham’s. The tool just keeps the research, the call and the review in one place.</p>
    </BlogArticle>
  );
}

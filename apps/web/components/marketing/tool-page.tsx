// Layout shared by the free tool pages: hero with the live checker, what the result means,
// how it works, FAQ (with FAQPage JSON-LD), related tools and the closing call to action.
import { TOOL_LINKS } from '@/lib/marketing-pages';
import { SITE_URL } from '@/lib/site';
import { Reveal } from './daygent';
import { Faq, type FaqItem } from './faq';
import { FreeTool, type ToolId } from './free-tool';
import { CtaStrip, FeatureGrid, JsonLd, Related, Section, Steps, type Feature } from './page-kit';

const Corner = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`pointer-events-none absolute tabular-nums text-xs tracking-[0.06em] text-faint max-md:hidden ${className}`}>{children}</span>
);

export function ToolPage({
  tool,
  path,
  name,
  title,
  lede,
  dailyLimit,
  corners,
  meanings,
  steps,
  faqs,
  cta,
}: {
  tool: ToolId;
  path: string;
  /** e.g. "TPS checker" (used in JSON-LD) */
  name: string;
  title: string;
  lede: React.ReactNode;
  dailyLimit: number;
  corners: [string, string];
  meanings: Feature[];
  steps: [string, string][];
  faqs: FaqItem[];
  cta: string;
}) {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'WebApplication', name: `${name} by Decibel`, url: `${SITE_URL}${path}`, applicationCategory: 'BusinessApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: 0, priceCurrency: 'GBP' } },
            { '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) },
          ],
        }}
      />
      <section className="rail dotgrid relative overflow-hidden">
        <Corner className="left-5 top-5">[ {corners[0]} ]</Corner>
        <Corner className="right-5 top-5">[ {corners[1]} ]</Corner>
        <div className="mx-auto max-w-[760px] px-5 pb-16 pt-16 text-center md:pb-20 md:pt-24">
          <Reveal eager>
            <p className="eyebrow">[ Free tool ]</p>
          </Reveal>
          <Reveal eager delay={80}>
            <h1 className="t-display mx-auto mt-6 max-w-[720px] text-black-400">{title}</h1>
          </Reveal>
          <Reveal eager delay={160}>
            <p className="mx-auto mt-5 max-w-[600px] text-md leading-[27px] text-black-700">{lede}</p>
          </Reveal>
          <Reveal eager delay={220} className="mt-10">
            <FreeTool tool={tool} dailyLimit={dailyLimit} />
          </Reveal>
        </div>
      </section>
      <Section eyebrow="Reading the result" title="What each answer means." flush>
        <FeatureGrid items={meanings} cols={meanings.length === 4 ? 4 : 3} />
      </Section>
      <Section eyebrow="How it works" title="What happens when you press check." flush>
        <Steps items={steps} />
      </Section>
      <section className="rail px-5 py-14 md:px-10 md:py-20">
        <div className="grid gap-10 md:grid-cols-[320px_1fr]">
          <Reveal>
            <p className="eyebrow">[ FAQ ]</p>
            <h2 className="t-h1 mt-4 text-black-400">Questions, answered.</h2>
          </Reveal>
          <Faq items={faqs} />
        </div>
      </section>
      <Related links={TOOL_LINKS.filter((l) => l.href !== path).concat([{ href: '/tools', label: 'All free tools', blurb: 'Every free checker in one place', glyph: '' }])} />
      <CtaStrip location={`tool_${tool}`} title={cta} />
    </>
  );
}

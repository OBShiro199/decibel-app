// The three free tools as cards, for the /tools hub and the landing page.
import Link from 'next/link';
import { TOOL_LINKS } from '@/lib/marketing-pages';
import { Reveal } from './daygent';
import { ASCII_FONT, SectionHead } from './page-kit';

const ART: Record<string, string> = {
  '/tools/tps-checker': ' 07700 900123\n ──────────────\n TPS    clear\n CTPS   clear',
  '/tools/email-verifier': ' name@company\n ──────────────\n mailbox   ok\n bounce    no',
  '/tools/phone-validator': ' +44 7700 900123\n ──────────────\n type   mobile\n valid  yes',
};

export function ToolCards() {
  return (
    <div className="grid border-t border-white-800 md:grid-cols-3">
      {TOOL_LINKS.map((t, i) => (
        <Reveal key={t.href} delay={i * 90} className="border-b border-white-800 md:border-b-0 md:border-r md:last:border-r-0">
          <Link href={t.href} className="group flex h-full flex-col transition-colors hover:bg-white-100">
            <div className="flex h-[150px] items-center justify-center border-b border-white-800 bg-white-100 transition-colors group-hover:bg-white-200">
              <pre aria-hidden className="select-none text-[12px] leading-[17px] text-black-700" style={{ fontFamily: ASCII_FONT }}>
                {ART[t.href]}
              </pre>
            </div>
            <div className="flex flex-1 flex-col px-5 py-6 md:px-8">
              <p className="tabular-nums text-xs tracking-[0.06em] text-success-500">✓ Free</p>
              <h3 className="mt-3 text-lg font-medium tracking-[-0.03em] text-black-400">{t.label}</h3>
              <p className="mt-1.5 text-base leading-[23px] text-black-700">{t.blurb}</p>
              <span className="mt-auto pt-5 text-[13px] text-black-700 transition-colors group-hover:text-black-400">Use the tool →</span>
            </div>
          </Link>
        </Reveal>
      ))}
    </div>
  );
}

/** Landing page section: free tools, no sign-up. */
export function FreeToolsSection() {
  return (
    <section id="tools" className="rail">
      <div className="px-5 py-14 md:px-10 md:py-20">
        <SectionHead eyebrow="Free tools" title="Check a number or an email, free.">
          Three quick checks for outbound teams, no sign-up needed: is a number on the TPS or CTPS, will an email bounce, and is a phone number real.
        </SectionHead>
      </div>
      <ToolCards />
    </section>
  );
}

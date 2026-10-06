import type { Metadata } from 'next';
import { CtaStrip, JsonLd, PageHero, Section } from '@/components/marketing/page-kit';
import { ToolCards } from '@/components/marketing/tools-section';
import { TOOL_LINKS } from '@/lib/marketing-pages';
import { SITE_URL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Free tools for outbound teams',
  description: 'Free TPS and CTPS checker, email verifier and phone number validator for UK and EU sales teams. No sign-up needed.',
  alternates: { canonical: '/tools' },
};

export default function ToolsPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'ItemList',
          name: 'Free tools for outbound teams',
          itemListElement: TOOL_LINKS.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.label, url: `${SITE_URL}${t.href}` })),
        }}
      />
      <PageHero
        eyebrow="Free tools"
        title="Free tools for teams that pick up the phone."
        lede="Check whether a number is on the TPS or CTPS, verify an email before you send and validate a phone number. Free, with no sign-up."
        location="tools_hub"
        corners={['No sign-up', 'UK + EU']}
      />
      <Section eyebrow="The tools" title="Three checks, one click each." flush>
        <ToolCards />
      </Section>
      <CtaStrip location="tools_hub" title="Need more than one check at a time? Try Decibel." />
    </>
  );
}

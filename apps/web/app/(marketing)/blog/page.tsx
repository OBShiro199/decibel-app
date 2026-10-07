import type { Metadata } from 'next';
import { BlogCard, dateText } from '@/components/marketing/blog';
import { Reveal } from '@/components/marketing/daygent';
import { CtaStrip, JsonLd } from '@/components/marketing/page-kit';
import { BLOG_AUTHOR, BLOG_POSTS } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';

const DESCRIPTION =
  'Practical guides for UK and EU outbound teams: TPS and CTPS screening, GDPR for B2B calling, and cold call playbooks you can use on your next dial.';

export const metadata: Metadata = {
  title: 'Cold calling and compliance guides',
  description: DESCRIPTION,
  alternates: { canonical: '/blog' },
  openGraph: { type: 'website', title: 'Cold calling and compliance guides | Decibel', description: DESCRIPTION, url: '/blog', siteName: 'Decibel', locale: 'en_GB' },
};

const TOPICS = [
  { tag: 'Compliance', blurb: 'TPS, CTPS, GDPR and call recording: what the rules say, and how to follow them on every dial.' },
  { tag: 'Playbooks', blurb: 'Call structures, questions and habits that turn cold calls into booked meetings.' },
] as const;

const Corner = ({ className, children }: { className: string; children: React.ReactNode }) => (
  <span className={`pointer-events-none absolute tabular-nums text-xs tracking-[0.06em] text-faint max-md:hidden ${className}`}>{children}</span>
);

export default function BlogIndexPage() {
  const [featured, ...rest] = BLOG_POSTS;
  const latest = BLOG_POSTS.map((p) => p.date).sort().reverse()[0];

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'Blog',
          name: 'Decibel blog',
          description: DESCRIPTION,
          url: `${SITE_URL}/blog`,
          inLanguage: 'en-GB',
          publisher: { '@type': 'Organization', name: 'Decibel', url: SITE_URL },
          blogPost: BLOG_POSTS.map((p) => ({
            '@type': 'BlogPosting',
            headline: p.title,
            description: p.description,
            datePublished: p.date,
            url: `${SITE_URL}/blog/${p.slug}`,
            author: { '@type': 'Person', name: BLOG_AUTHOR.name },
          })),
        }}
      />

      {/* header */}
      <section className="rail dotgrid relative overflow-hidden">
        <Corner className="left-5 top-5">[ UK + EU ]</Corner>
        <Corner className="right-5 top-5">[ Field notes ]</Corner>
        <div className="mx-auto max-w-[760px] px-5 pb-14 pt-16 text-center md:pb-20 md:pt-24">
          <Reveal eager>
            <p className="eyebrow">[ Blog ]</p>
          </Reveal>
          <Reveal eager delay={80}>
            <h1 className="t-display mx-auto mt-6 max-w-[700px] text-black-400">Practical guides for teams that pick up the phone.</h1>
          </Reveal>
          <Reveal eager delay={160}>
            <p className="mx-auto mt-5 max-w-[580px] text-md leading-[27px] text-black-700">
              Plain-English notes for UK and EU outbound teams: the calling rules that matter, how to stay on the right side of them, and how to run a better
              cold call.
            </p>
          </Reveal>
          <Reveal eager delay={220}>
            <p className="mt-7 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 tabular-nums text-xs tracking-[0.06em] text-white-900">
              <span>{BLOG_POSTS.length} guides</span>
              <span aria-hidden>·</span>
              <span>By {BLOG_AUTHOR.name}</span>
              <span aria-hidden>·</span>
              <span>Updated {dateText(latest)}</span>
            </p>
          </Reveal>
        </div>
      </section>

      {/* topics */}
      <section className="rail">
        <div className="grid sm:grid-cols-2">
          {TOPICS.map((t, i) => {
            const count = BLOG_POSTS.filter((p) => p.tag === t.tag).length;
            return (
              <Reveal key={t.tag} delay={i * 90} className={i === 0 ? 'border-b border-white-800 sm:border-b-0 sm:border-r' : undefined}>
                <div className="px-5 py-7 md:px-10">
                  <p className="flex items-center justify-between tabular-nums text-xs tracking-[0.06em] text-faint">
                    <span>[ {t.tag} ]</span>
                    <span>
                      {count} {count === 1 ? 'guide' : 'guides'}
                    </span>
                  </p>
                  <p className="mt-3 text-base leading-[23px] text-black-700">{t.blurb}</p>
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* featured */}
      <section className="rail">
        <p className="px-5 pt-10 tabular-nums text-xs tracking-[0.06em] text-faint md:px-10">[ Featured ]</p>
        <div className="-mb-px mt-6 grid border-t border-white-800 sm:[&>a]:border-r-0">
          <BlogCard post={featured} large />
        </div>
      </section>

      {/* the rest */}
      {rest.length ? (
        <section className="rail">
          <p className="px-5 pt-10 tabular-nums text-xs tracking-[0.06em] text-faint md:px-10">[ More guides ]</p>
          <div className="-mb-px mt-6 grid border-t border-white-800 sm:grid-cols-2 sm:[&>a:nth-child(2n)]:border-r-0">
            {rest.map((p) => (
              <BlogCard key={p.slug} post={p} />
            ))}
          </div>
        </section>
      ) : null}

      <CtaStrip location="blog_index" title="Put the guides into practice on your own leads." />
    </>
  );
}

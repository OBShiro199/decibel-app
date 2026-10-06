// Blog index cards and the article layout.
import Link from 'next/link';
import { BLOG_AUTHOR, BLOG_POSTS, type BlogPost } from '@/lib/blog';
import { SITE_URL } from '@/lib/site';
import { cn } from '@/lib/utils';
import { ASCII_FONT, CtaPair, CtaStrip, JsonLd } from './page-kit';
import { proseBody } from './prose';

const dateText = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** The ASCII cover, on a soft panel. */
export function BlogCover({ post, className }: { post: BlogPost; className?: string }) {
  return (
    <div className={cn('flex items-center justify-center overflow-hidden bg-white-100', className)}>
      <pre aria-hidden className="select-none whitespace-pre text-[11px] leading-[14px] text-black-700 sm:text-[12px] sm:leading-[15px]" style={{ fontFamily: ASCII_FONT }}>
        {post.cover}
      </pre>
    </div>
  );
}

export function BlogCard({ post, large }: { post: BlogPost; large?: boolean }) {
  return (
    <Link href={`/blog/${post.slug}`} className="group flex flex-col border-b border-white-800 transition-colors hover:bg-white-100 sm:border-r">
      <BlogCover post={post} className={cn('border-b border-white-800 transition-colors group-hover:bg-white-200', large ? 'h-[260px]' : 'h-[200px]')} />
      <div className="flex flex-1 flex-col px-5 py-6 md:px-7">
        <p className="tabular-nums text-xs tracking-[0.06em] text-faint">
          [ {post.tag} ] · {post.readMinutes} min read
        </p>
        <h2 className={cn('mt-3 font-medium tracking-[-0.03em] text-black-400', large ? 'text-xl leading-[28px]' : 'text-lg leading-[25px]')}>{post.title}</h2>
        <p className="mt-2 text-base leading-[23px] text-black-700">{post.description}</p>
        <span className="mt-auto pt-5 text-[13px] text-black-700 transition-colors group-hover:text-black-400">Read the guide →</span>
      </div>
    </Link>
  );
}

/** Mid-article call to action. */
export function InlineCta({ location }: { location: string }) {
  return (
    <aside className="not-prose my-10 rounded-[6px] border border-white-800 bg-white-100 p-6">
      <p className="text-md font-medium tracking-[-0.02em] text-black-400">Calling UK businesses? Decibel screens every dial against TPS and CTPS for you.</p>
      <p className="mt-1.5 text-base text-black-700">Verified mobiles, a browser dialler and call recording in one place.</p>
      <CtaPair location={location} size="default" className="mt-4" />
    </aside>
  );
}

export function BlogArticle({ slug, children }: { slug: string; children: React.ReactNode }) {
  const post = BLOG_POSTS.find((p) => p.slug === slug)!;
  const others = BLOG_POSTS.filter((p) => p.slug !== slug);
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          headline: post.title,
          description: post.description,
          datePublished: post.date,
          dateModified: post.date,
          author: { '@type': 'Person', name: BLOG_AUTHOR.name, jobTitle: BLOG_AUTHOR.role },
          publisher: { '@type': 'Organization', name: 'Decibel', url: SITE_URL },
          mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
        }}
      />
      <section className="rail">
        <BlogCover post={post} className="h-[220px] border-b border-white-800 md:h-[280px]" />
        <article className="mx-auto w-full max-w-[720px] px-5 pb-16 pt-12 md:pb-24 md:pt-16">
          <nav aria-label="Breadcrumb" className="tabular-nums text-xs tracking-[0.06em] text-faint">
            <Link href="/blog" className="hover:text-black-700">
              Blog
            </Link>{' '}
            / {post.tag}
          </nav>
          <h1 className="t-h1 mt-4 text-black-400">{post.title}</h1>
          <p className="mt-4 text-md leading-[27px] text-black-700">{post.description}</p>
          <p className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-white-800 py-3 text-[13px] text-black-700">
            <span className="text-black-400">{BLOG_AUTHOR.name}</span>
            <span>{BLOG_AUTHOR.role}</span>
            <span aria-hidden>·</span>
            <time dateTime={post.date}>{dateText(post.date)}</time>
            <span aria-hidden>·</span>
            <span>{post.readMinutes} min read</span>
          </p>
          <div className={cn(proseBody, 'mt-8 [&_blockquote]:mt-6 [&_blockquote]:border-l-2 [&_blockquote]:border-white-800 [&_blockquote]:pl-4 [&_blockquote]:text-black-500')}>{children}</div>
        </article>
      </section>
      <section className="rail">
        <p className="px-5 pt-10 tabular-nums text-xs tracking-[0.06em] text-faint md:px-10">[ Keep reading ]</p>
        <div className="mt-6 grid border-t border-white-800 sm:grid-cols-2">
          {others.map((p) => (
            <BlogCard key={p.slug} post={p} />
          ))}
        </div>
      </section>
      <CtaStrip location={`blog_${post.slug}`} title="Put the rules in the dialler, not in a PDF." />
    </>
  );
}

export { dateText };

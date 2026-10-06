import type { MetadataRoute } from 'next';
import { BLOG_POSTS } from '@/lib/blog';
import { PUBLIC_PAGES } from '@/lib/marketing-pages';
import { SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const pages = PUBLIC_PAGES.map(({ path, priority, changeFrequency }) => ({ url: `${SITE_URL}${path === '/' ? '' : path}`, lastModified, changeFrequency, priority }));
  const posts = BLOG_POSTS.map((p) => ({ url: `${SITE_URL}/blog/${p.slug}`, lastModified: new Date(p.date), changeFrequency: 'yearly' as const, priority: 0.6 }));
  return [...pages, ...posts];
}

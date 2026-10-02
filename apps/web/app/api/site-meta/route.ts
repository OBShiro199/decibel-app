import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// OpenGraph-style lookup for onboarding step 1: company name + favicon from a website.
// Signed-in users only, https only, public hostnames only, 4s timeout, 256 KB cap.
const PRIVATE = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$|^\d+\.\d+\.\d+\.\d+$|^\[/i;

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const raw = new URL(request.url).searchParams.get('url') ?? '';
  let target: URL;
  try {
    target = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return NextResponse.json({ error: 'invalid url' }, { status: 400 });
  }
  if (target.protocol !== 'https:' || PRIVATE.test(target.hostname) || !target.hostname.includes('.') || target.port) {
    return NextResponse.json({ error: 'unsupported url' }, { status: 400 });
  }

  try {
    const res = await fetch(target.origin, {
      signal: AbortSignal.timeout(4000),
      redirect: 'follow',
      headers: { 'user-agent': 'DecibelBot/1.0 (+https://decibel.io)', accept: 'text/html' },
    });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('text/html')) {
      return NextResponse.json({ name: null, icon: null });
    }
    const html = (await res.text()).slice(0, 262144);
    const meta = (prop: string) =>
      html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'))?.[1] ??
      html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i'))?.[1];
    const title = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const name = (meta('og:site_name') ?? title ?? '').split(/[|\-–—·:]/)[0].trim().slice(0, 80) || null;
    const iconHref = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i)?.[1] ??
      html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i)?.[1];
    let icon: string | null = null;
    try {
      const resolved = new URL(iconHref ?? '/favicon.ico', res.url || target.origin);
      if (resolved.protocol === 'https:') icon = resolved.toString();
    } catch {
      icon = null;
    }
    return NextResponse.json({ name, icon });
  } catch {
    return NextResponse.json({ name: null, icon: null });
  }
}

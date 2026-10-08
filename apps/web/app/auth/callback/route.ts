import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { HOME } from '@/lib/constants';

// Handles OAuth, magic-link and email-confirmation redirects (PKCE code exchange).
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type');
  const nextParam = url.searchParams.get('next') ?? HOME;
  const next = nextParam.startsWith('/') && !nextParam.startsWith('//') ? nextParam : HOME;
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: type as 'signup' | 'magiclink' | 'recovery' | 'email' });
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
  }
  const description = url.searchParams.get('error_description');
  return NextResponse.redirect(new URL(`/login${description ? `?error=${encodeURIComponent(description)}` : ''}`, url.origin));
}

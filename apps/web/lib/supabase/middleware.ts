import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/app', '/onboarding'];
const AUTH_PAGES = ['/login', '/signup'];

export async function updateSession(request: NextRequest) {
  // Never let the session check take the site down. If the Supabase env vars are missing or
  // the check throws, let the request through: the /app and /onboarding layouts verify the
  // session again on the server and redirect to /login, so nothing protected is exposed.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error('middleware: NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY is not set; skipping the session check');
    return NextResponse.next({ request });
  }
  try {
    return await check(request, url, key);
  } catch (error) {
    console.error('middleware: session check failed', error);
    return NextResponse.next({ request });
  }
}

async function check(request: NextRequest, supabaseUrl: string, supabaseKey: string) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // Runs on every navigation. getClaims() verifies the JWT locally against the project's
  // published ES256 keys (cached), refreshing the session if needed, instead of a round trip
  // to the auth server like getUser(). Pages still enforce access through RLS.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? { id: data.claims.sub } : null;
  const path = request.nextUrl.pathname;

  if (!user && PROTECTED.some((p) => path === p || path.startsWith(p + '/'))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(path + request.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }
  if (user && AUTH_PAGES.includes(path)) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.searchParams.get('next');
    url.pathname = next && next.startsWith('/') && !next.startsWith('//') ? next : '/app';
    url.search = '';
    return NextResponse.redirect(url);
  }
  return response;
}

import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // only routes that depend on the session; marketing pages stay static and fast
  matcher: ['/app/:path*', '/onboarding/:path*', '/login', '/signup'],
};

import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';

export const middleware = async (request: NextRequest) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session === null) {
    const redirectUri = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(new URL(`/auth/login?redirect=${redirectUri}`, request.url));
  }
  return NextResponse.next();
};

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!auth|api/trpc|_next|api/auth).*)'],
};

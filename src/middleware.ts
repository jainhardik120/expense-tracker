import { type NextRequest, NextResponse } from 'next/server';

import { getSessionCookie } from 'better-auth/cookies';

export const middleware = (request: NextRequest) => {
  const sessionCookie = getSessionCookie(request);
  if (sessionCookie === null || sessionCookie.length === 0) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
};

export const config = {
  matcher: ['/((?!login|register|api/trpc|_next|api/auth).*)'],
};

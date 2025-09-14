import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';

export const middleware = async (request: NextRequest) => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session === null) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
};

export const config = {
  runtime: 'nodejs',
  matcher: ['/((?!login|register|api/trpc|_next|api/auth).*)'],
};

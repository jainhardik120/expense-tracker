import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/lib/auth';

const publicPaths: Array<RegExp> = [
  /^\/auth(\/|$)/,
  /^\/api\/trpc(\/|$)/,
  /^\/_next(\/|$)/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/external(\/|$)/,
  /^\/.well-known(\/|$)/,
  /^\/public\//,
  /^\/favicon.ico$/,
];

const adminPaths: Array<RegExp> = [/^\/account\/admin(\/|$)/];

const matchesAny = (path: string, patterns: Array<RegExp>) => patterns.some((rx) => rx.test(path));

export const proxy = async (request: NextRequest) => {
  const path = request.nextUrl.pathname;
  const isPublic = matchesAny(path, publicPaths);
  const requiresAdmin = matchesAny(path, adminPaths);
  if (isPublic && !requiresAdmin) {
    return NextResponse.next();
  }
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (session === null) {
    const redirectUri = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(new URL(`/auth/login?redirect=${redirectUri}`, request.url));
  }
  if (requiresAdmin && session.user.role !== 'admin') {
    return NextResponse.redirect(new URL(`/403`, request.url));
  }
  return NextResponse.next();
};

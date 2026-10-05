import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import setCookieParser from 'set-cookie-parser';

import { auth } from '@/lib/auth';

const publicPaths: Array<RegExp> = [
  /^\/auth(\/|$)/,
  /^\/home$/,
  /^\/privacy$/,
  /^\/terms$/,
  /^\/support$/,
  /^\/delete-account$/,
  /^\/brand(\/|$)/,
  /^\/api\/trpc(\/|$)/,
  /^\/_next(\/|$)/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/external(\/|$)/,
  /^\/api\/pdf-report(\/|$)/,
  /^\/api\/reports(\/|$)/,
  /^\/api\/inbound\/ses$/,
  /^\/.well-known(\/|$)/,
  /^\/public\//,
  /^\/favicon.ico$/,
  /^\/icon\.svg$/,
  /^\/apple-icon[\w-]*\.(?:png|jpg|jpeg)$/,
  /^\/opengraph-image[\w-]*\.(?:png|jpg|jpeg)$/,
  /^\/twitter-image[\w-]*\.(?:png|jpg|jpeg)$/,
  /^\/manifest\.(?:json|webmanifest)$/,
  /^\/robots\.txt$/,
  /^\/sitemap\.xml$/,
];

const adminPaths: Array<RegExp> = [/^\/account\/admin(\/|$)/];

const matchesAny = (path: string, patterns: Array<RegExp>) => patterns.some((rx) => rx.test(path));

const forwardSessionCookies = (
  setCookie: string | null,
  request: NextRequest,
): { requestHeaders: Headers; apply: (response: NextResponse) => NextResponse } => {
  const requestHeaders = new Headers(request.headers);

  if (setCookie === null) {
    return { requestHeaders, apply: (response) => response };
  }

  const parsed = setCookieParser.parseSetCookie(setCookie, { split: true });

  const merged = new Map<string, string>();
  for (const { name, value } of request.cookies.getAll()) {
    merged.set(name, value);
  }
  for (const cookie of parsed) {
    merged.set(cookie.name, cookie.value);
  }
  requestHeaders.set(
    'cookie',
    [...merged.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
  );

  return {
    requestHeaders,
    apply: (response) => {
      for (const cookie of parsed) {
        response.cookies.set({
          name: cookie.name,
          value: cookie.value,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          path: cookie.path,
          expires: cookie.expires,
          maxAge: cookie.maxAge,
          sameSite: cookie.sameSite as 'lax' | 'strict' | 'none' | undefined,
        });
      }
      return response;
    },
  };
};

export const proxy = async (request: NextRequest) => {
  const path = request.nextUrl.pathname;
  const isPublic = matchesAny(path, publicPaths);
  const requiresAdmin = matchesAny(path, adminPaths);
  if (isPublic && !requiresAdmin) {
    return NextResponse.next();
  }
  const { response: session, headers: returnedHeaders } = await auth.api.getSession({
    headers: await headers(),
    returnHeaders: true,
  });
  const { requestHeaders, apply } = forwardSessionCookies(
    returnedHeaders.get('set-cookie'),
    request,
  );
  if (session === null) {
    if (path === '/') {
      return apply(NextResponse.redirect(new URL('/home', request.url)));
    }
    const redirectUri = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    return apply(
      NextResponse.redirect(new URL(`/auth/login?redirect=${redirectUri}`, request.url)),
    );
  }
  if (requiresAdmin && session.user.role !== 'admin') {
    return apply(NextResponse.redirect(new URL(`/403`, request.url)));
  }
  return apply(NextResponse.next({ request: { headers: requestHeaders } }));
};

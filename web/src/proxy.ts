import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import setCookieParser from 'set-cookie-parser';

import { auth } from '@/lib/auth';

const publicPaths: Array<RegExp> = [
  /^\/auth(\/|$)/,
  /^\/privacy$/,
  /^\/terms$/,
  /^\/support$/,
  /^\/delete-account$/,
  /^\/brand(\/|$)/,
  /^\/api\/trpc(\/|$)/,
  /^\/_next(\/|$)/,
  /^\/api\/auth(\/|$)/,
  /^\/api\/external(\/|$)/,
  // These check the session themselves and answer 401, which is what a fetch
  // client wants — a redirect to the login page would arrive as an HTML body.
  /^\/api\/pdf-report(\/|$)/,
  /^\/api\/reports(\/|$)/,
  /^\/.well-known(\/|$)/,
  /^\/public\//,
  /^\/favicon.ico$/,
  // Static metadata assets are served to unauthenticated clients anyway, and
  // routing them through a session lookup costs a database connection each.
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

// better-auth refreshes its signed session-cache cookie during getSession. If we
// drop that Set-Cookie, the cache never lands in the browser and every single
// request falls through to a database session lookup. Forward it onto the
// response, and also onto the request we hand downstream so the RSC render in
// this same request reads the fresh cookie instead of querying again.
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
    const redirectUri = encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search);
    return apply(NextResponse.redirect(new URL(`/auth/login?redirect=${redirectUri}`, request.url)));
  }
  if (requiresAdmin && session.user.role !== 'admin') {
    return apply(NextResponse.redirect(new URL(`/403`, request.url)));
  }
  return apply(NextResponse.next({ request: { headers: requestHeaders } }));
};

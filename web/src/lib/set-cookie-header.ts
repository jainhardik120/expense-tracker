import { cookies } from 'next/headers';

import setCookieParser from 'set-cookie-parser';

export const setCookieHeader = async (key: string, value: string, responseHeaders: Headers) => {
  if (key.toLowerCase() !== 'set-cookie') {
    responseHeaders.set(key, value);
    return;
  }

  const cookieStore = await cookies();
  const cookieObjects = setCookieParser.parseSetCookie(value, { split: true });
  for (const cookie of cookieObjects) {
    cookieStore.set({
      name: cookie.name,
      value: cookie.value,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      path: cookie.path,
      expires: cookie.expires,
      sameSite: cookie.sameSite as 'lax' | 'strict' | 'none' | undefined,
    });
  }
};

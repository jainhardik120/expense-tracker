import { passkeyClient } from '@better-auth/passkey/client';
import { twoFactorClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { getBaseUrl } from '@/lib/getBaseUrl';

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [passkeyClient(), twoFactorClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;

import { passkeyClient } from '@better-auth/passkey/client';
import { apiKeyClient, twoFactorClient, adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { getBaseUrl } from '@/lib/getBaseUrl';

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [passkeyClient(), twoFactorClient(), apiKeyClient(), adminClient()],
});

export const { signIn, signOut, signUp, useSession } = authClient;

import { apiKeyClient } from '@better-auth/api-key/client';
import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { passkeyClient } from '@better-auth/passkey/client';
import { twoFactorClient, adminClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { getBaseUrl } from '@/lib/get-base-url';

export const authClient = createAuthClient({
  baseURL: getBaseUrl(),
  plugins: [
    passkeyClient(),
    twoFactorClient(),
    apiKeyClient(),
    adminClient(),
    oauthProviderClient(),
  ],
});

export const { signIn, signOut, signUp } = authClient;

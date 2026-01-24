import { z } from 'zod';

import { auth } from '@/lib/auth';
import logger from '@/lib/logger';

import { adminProcedure, createTRPCRouter } from '../trpc';

export const adminRouter = createTRPCRouter({
  createTrustedOAuthClient: adminProcedure
    .meta({
      openapi: {
        method: 'POST',
        path: '/admin/oauth/client',
      },
    })
    .input(
      z.object({
        clientName: z.string().min(1),
        redirectUri: z.array(z.url()).min(1),
        tokenEndpointAuthMethod: z
          .enum(['client_secret_basic', 'client_secret_post', 'none'])
          .optional(),
      }),
    )
    .output(z.string())
    .mutation(async ({ ctx, input }) => {
      const result = await auth.api.adminCreateOAuthClient({
        headers: ctx.headers,
        body: {
          client_name: input.clientName,
          redirect_uris: input.redirectUri,
          client_secret_expires_at: 0,
          skip_consent: true,
          enable_end_session: true,
          token_endpoint_auth_method: input.tokenEndpointAuthMethod,
        },
      });
      logger.info(`Created trusted OAuth client ${JSON.stringify(result, null, 2)}`);
      return result.client_id;
    }),
});

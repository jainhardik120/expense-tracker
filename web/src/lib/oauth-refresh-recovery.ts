import { createHash } from 'crypto';

import { APIError } from 'better-auth/api';
import { and, eq, isNotNull } from 'drizzle-orm';

import { oauthRefreshToken } from '@/db/auth-schema';
import { db } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import logger from '@/lib/logger';
import { chainIsAlive } from '@/lib/oauth-refresh-chain';

const storedForm = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('base64url');

const isRefreshGrant = (body: unknown): body is { grant_type: string; refresh_token: string } =>
  typeof body === 'object' &&
  body !== null &&
  (body as { grant_type?: unknown }).grant_type === 'refresh_token' &&
  typeof (body as { refresh_token?: unknown }).refresh_token === 'string';

export const recoverRotatedRefreshToken = instrumentedFunction(
  'recoverRotatedRefreshToken',
  async (ctx: { path: string; body?: unknown }): Promise<void> => {
    if (ctx.path !== '/oauth2/token' || !isRefreshGrant(ctx.body)) {
      return;
    }
    const rows = await db
      .select()
      .from(oauthRefreshToken)
      .where(eq(oauthRefreshToken.token, storedForm(ctx.body.refresh_token)))
      .limit(1);
    const row = rows.at(0);
    const revokedAt = row?.revoked;
    if (row === undefined || revokedAt === null || revokedAt === undefined) {
      return;
    }
    const now = new Date();
    if (row.expiresAt === null || row.expiresAt <= now) {
      return;
    }
    const family = await db
      .select()
      .from(oauthRefreshToken)
      .where(
        and(eq(oauthRefreshToken.clientId, row.clientId), eq(oauthRefreshToken.userId, row.userId)),
      );
    if (!chainIsAlive(row, family, now)) {
      logger.warn('Refresh token replayed after its chain ended', {
        clientId: row.clientId,
        userId: row.userId,
        revokedAt: revokedAt.toISOString(),
      });
      throw new APIError('BAD_REQUEST', {
        error: 'invalid_grant',
        error_description: 'invalid refresh token',
      });
    }
    const revived = await db
      .update(oauthRefreshToken)
      .set({ revoked: null })
      .where(and(eq(oauthRefreshToken.id, row.id), isNotNull(oauthRefreshToken.revoked)))
      .returning({ id: oauthRefreshToken.id });
    if (revived.length === 0) {
      return;
    }
    logger.info('Revived a refresh token whose rotation the client never received', {
      clientId: row.clientId,
      userId: row.userId,
      revokedAt: revokedAt.toISOString(),
    });
  },
);

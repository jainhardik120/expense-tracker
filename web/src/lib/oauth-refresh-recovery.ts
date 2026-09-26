import { createHash } from 'crypto';

import { APIError } from 'better-auth/api';
import { and, eq, isNotNull } from 'drizzle-orm';

import { oauthRefreshToken } from '@/db/auth-schema';
import { db } from '@/lib/db';
import logger from '@/lib/logger';
import { chainIsAlive } from '@/lib/oauth-refresh-chain';

/**
 * How the provider stores a refresh token: SHA-256, base64url, unpadded. The
 * column holds only this, so a presented token has to be hashed to be looked
 * up — and the plaintext of any other token in the family is unknowable here,
 * which is why the recovery below works by reviving the presented token
 * rather than by substituting the current one.
 */
const storedForm = (token: string) =>
  createHash('sha256').update(token, 'utf8').digest('base64url');

const isRefreshGrant = (body: unknown): body is { grant_type: string; refresh_token: string } =>
  typeof body === 'object' &&
  body !== null &&
  (body as { grant_type?: unknown }).grant_type === 'refresh_token' &&
  typeof (body as { refresh_token?: unknown }).refresh_token === 'string';

/**
 * Lets a client recover from a rotation whose response it never stored.
 *
 * Refresh tokens rotate: the server revokes the presented token and issues a
 * new one in the same response. If that response never reaches the client —
 * the phone is killed mid-request, the radio drops, the write never lands —
 * the client is left holding a token the server has already retired.
 * Presenting it looks exactly like a stolen token being replayed, so the
 * provider treats it as theft: it deletes *every* refresh token that client
 * holds for the user, and the only way back is an interactive sign-in. On a
 * phone that uploads a transaction per SMS, one dropped response becomes
 * weeks of silence.
 *
 * So when a retired token arrives and the chain it started is still alive,
 * make that token current again and let the grant proceed: the provider
 * rotates it as usual and the client gets a working pair back. The token that
 * replaced it is left alone rather than killed, since another device may be
 * holding it.
 *
 * What this deliberately does not do:
 *  - resurrect a token revoked on purpose, which has no successor;
 *  - revive a family whose chain has been revoked or has expired — a sign-out
 *    stays a sign-out;
 *  - accept a token past its own expiry.
 *
 * A replayed token is therefore worth no more than the live token it was
 * rotated out of, and never outlives it.
 */
export const recoverRotatedRefreshToken = async (ctx: {
  path: string;
  body?: unknown;
}): Promise<void> => {
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
  // Unknown, or still the live one: the provider's own handling is right.
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
    // Answer here rather than letting the provider answer: its answer to a
    // replayed token is to delete every refresh token this client holds for
    // the user, which would take any other device down with it.
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
  // The `revoked is not null` guard keeps two racing replays from both
  // reviving the row; the loser falls through to the provider, which is the
  // behaviour that exists today.
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
};

import { randomBytes } from 'node:crypto';

import { and, eq, isNull } from 'drizzle-orm';

import { emailInboxes } from '@/db/schema';
import { type Database } from '@/lib/db';
import { env } from '@/lib/env';

const TOKEN_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const TOKEN_LENGTH = 20;

export const generateInboxToken = () =>
  [...randomBytes(TOKEN_LENGTH)]
    .map((byte) => TOKEN_ALPHABET[byte % TOKEN_ALPHABET.length])
    .join('');

export const inboundDomain = () => env.INBOUND_EMAIL_DOMAIN?.toLowerCase() ?? null;

export const inboxAddress = (token: string) => {
  const domain = inboundDomain();
  return domain === null ? null : `${token}@${domain}`;
};

export const tokenFromRecipient = (recipient: string) => {
  const domain = inboundDomain();
  const [local = '', host] = recipient.trim().toLowerCase().split('@');
  if (domain === null || host !== domain || local === '') {
    return null;
  }
  return local;
};

export const getActiveInbox = async (db: Database, userId: string) =>
  (
    await db
      .select()
      .from(emailInboxes)
      .where(and(eq(emailInboxes.userId, userId), isNull(emailInboxes.revokedAt)))
      .limit(1)
  ).at(0) ?? null;

export const findInboxByToken = async (db: Database, token: string) =>
  (
    await db
      .select()
      .from(emailInboxes)
      .where(and(eq(emailInboxes.token, token), isNull(emailInboxes.revokedAt)))
      .limit(1)
  ).at(0) ?? null;

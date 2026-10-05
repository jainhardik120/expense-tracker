import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

import { env } from '@/lib/env';

const ENCRYPTED_PART = 3;
const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;
const IV_BYTES = 12;
const VERSION = 'v1';

const key = () =>
  Buffer.from(
    hkdfSync('sha256', env.BETTER_AUTH_SECRET, 'expense-tracker', 'statement-passwords', KEY_BYTES),
  );

export const sealPassword = (password: string) => {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key(), iv);
  const encrypted = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()]);
  return [VERSION, iv, cipher.getAuthTag(), encrypted]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
};

export const openPassword = (sealed: string) => {
  const parts = sealed.split('.');
  const version = parts.at(0);
  const iv = parts.at(1);
  const tag = parts.at(2);
  const encrypted = parts.at(ENCRYPTED_PART);
  if (version !== VERSION || iv === undefined || tag === undefined || encrypted === undefined) {
    return null;
  }
  try {
    const decipher = createDecipheriv(ALGORITHM, key(), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
};

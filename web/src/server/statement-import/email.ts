import { and, eq } from 'drizzle-orm';
import PostalMime, { type Attachment } from 'postal-mime';

import { inboundEmails } from '@/db/schema';
import { type Database } from '@/lib/db';
import { env } from '@/lib/env';
import logger from '@/lib/logger';
import { readObject } from '@/server/helpers/inbound-email/storage';

import { ingestStatementFile, type IngestInput } from './ingest';

const isPdf = (attachment: { filename: string | null; mimeType: string }) =>
  attachment.mimeType === 'application/pdf' ||
  (attachment.filename ?? '').toLowerCase().endsWith('.pdf');

const bytesOf = (attachment: Attachment) =>
  typeof attachment.content === 'string'
    ? new TextEncoder().encode(attachment.content)
    : new Uint8Array(attachment.content);

export const autoImportStatements = async (
  db: Database,
  userId: string,
  inboundEmailId: string,
  attachments: Attachment[],
) => {
  for (const attachment of attachments.filter((candidate) =>
    isPdf({ filename: candidate.filename, mimeType: candidate.mimeType }),
  )) {
    try {
      await ingestStatementFile(db, userId, {
        data: bytesOf(attachment),
        fileName: attachment.filename ?? 'statement.pdf',
        rememberPassword: false,
        source: 'email',
        inboundEmailId,
      });
    } catch (error) {
      logger.info('Emailed PDF was not imported automatically', {
        inboundEmailId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }
};

export const importEmailAttachment = async (
  db: Database,
  userId: string,
  input: { inboundEmailId: string; attachment: number } & Pick<
    IngestInput,
    'password' | 'accountId' | 'rememberPassword'
  >,
) => {
  const found = await db
    .select({ objectKey: inboundEmails.objectKey })
    .from(inboundEmails)
    .where(and(eq(inboundEmails.id, input.inboundEmailId), eq(inboundEmails.userId, userId)))
    .limit(1);
  const objectKey = found.at(0)?.objectKey;
  const bucket = env.INBOUND_EMAIL_BUCKET;
  if (objectKey === undefined || objectKey === null || bucket === undefined) {
    throw new Error('The original email is no longer stored');
  }
  const parsed = await PostalMime.parse(await readObject(bucket, objectKey));
  const attachment = parsed.attachments.at(input.attachment);
  if (attachment === undefined || !isPdf(attachment)) {
    throw new Error('That attachment is not a PDF');
  }
  return ingestStatementFile(db, userId, {
    data: bytesOf(attachment),
    fileName: attachment.filename ?? 'statement.pdf',
    password: input.password,
    accountId: input.accountId,
    rememberPassword: input.rememberPassword,
    source: 'email',
    inboundEmailId: input.inboundEmailId,
  });
};

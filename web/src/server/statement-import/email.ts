import { and, eq } from 'drizzle-orm';
import PostalMime, { type Attachment } from 'postal-mime';

import { type EmailImportOutcome, type InboundEmailAttachment, inboundEmails } from '@/db/schema';
import { type Database } from '@/lib/db';
import { env } from '@/lib/env';
import logger from '@/lib/logger';
import { readObject } from '@/server/helpers/inbound-email/storage';

import { ingestStatementFile, type IngestInput, StatementAccountRequiredError } from './ingest';
import { PdfPasswordError } from './pdf/extract';
import { UnsupportedStatementError } from './pdf/parse';

const isPdf = (attachment: { filename: string | null; mimeType: string }) =>
  attachment.mimeType === 'application/pdf' ||
  (attachment.filename ?? '').toLowerCase().endsWith('.pdf');

const bytesOf = (attachment: Attachment) =>
  typeof attachment.content === 'string'
    ? new TextEncoder().encode(attachment.content)
    : new Uint8Array(attachment.content);

const outcomeOfError = (error: unknown): EmailImportOutcome => {
  if (error instanceof PdfPasswordError) {
    return 'password';
  }
  if (error instanceof StatementAccountRequiredError) {
    return 'account';
  }
  if (error instanceof UnsupportedStatementError) {
    return 'not_statement';
  }
  return 'failed';
};

const importOne = async (
  db: Database,
  userId: string,
  inboundEmailId: string,
  attachment: Attachment,
): Promise<{ importOutcome: EmailImportOutcome; importId?: string }> => {
  try {
    const result = await ingestStatementFile(db, userId, {
      data: bytesOf(attachment),
      fileName: attachment.filename ?? 'statement.pdf',
      rememberPassword: false,
      source: 'email',
      inboundEmailId,
    });
    return {
      importOutcome: result.duplicate ? 'duplicate' : 'imported',
      importId: result.importId,
    };
  } catch (error) {
    const outcome = outcomeOfError(error);
    if (outcome === 'failed') {
      logger.warn('Emailed PDF could not be imported', {
        inboundEmailId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
    return { importOutcome: outcome };
  }
};

export const autoImportStatements = async (
  db: Database,
  userId: string,
  inboundEmailId: string,
  attachments: Attachment[],
  stored: InboundEmailAttachment[],
) => {
  const outcomes = new Map<number, Awaited<ReturnType<typeof importOne>>>();
  for (const [index, attachment] of attachments.entries()) {
    if (isPdf({ filename: attachment.filename, mimeType: attachment.mimeType })) {
      outcomes.set(index, await importOne(db, userId, inboundEmailId, attachment));
    }
  }
  if (outcomes.size === 0) {
    return;
  }
  await db
    .update(inboundEmails)
    .set({
      attachments: stored.map((entry, index) => {
        const outcome = outcomes.get(index);
        return outcome === undefined ? entry : { ...entry, ...outcome };
      }),
    })
    .where(eq(inboundEmails.id, inboundEmailId));
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
    .select({ objectKey: inboundEmails.objectKey, attachments: inboundEmails.attachments })
    .from(inboundEmails)
    .where(and(eq(inboundEmails.id, input.inboundEmailId), eq(inboundEmails.userId, userId)))
    .limit(1);
  const email = found.at(0);
  const objectKey = email?.objectKey;
  const bucket = env.INBOUND_EMAIL_BUCKET;
  if (
    email === undefined ||
    objectKey === undefined ||
    objectKey === null ||
    bucket === undefined
  ) {
    throw new Error('The original email is no longer stored');
  }
  const raw = await readObject(bucket, objectKey).catch(() => null);
  if (raw === null) {
    throw new Error('The original email is no longer stored');
  }
  const parsed = await PostalMime.parse(raw);
  const attachment = parsed.attachments.at(input.attachment);
  if (attachment === undefined || !isPdf(attachment)) {
    throw new Error('That attachment is not a PDF');
  }
  const result = await ingestStatementFile(db, userId, {
    data: bytesOf(attachment),
    fileName: attachment.filename ?? 'statement.pdf',
    password: input.password,
    accountId: input.accountId,
    rememberPassword: input.rememberPassword,
    source: 'email',
    inboundEmailId: input.inboundEmailId,
  });
  await db
    .update(inboundEmails)
    .set({
      attachments: email.attachments.map((entry, index) =>
        index === input.attachment
          ? {
              ...entry,
              importOutcome: result.duplicate ? ('duplicate' as const) : ('imported' as const),
              importId: result.importId,
            }
          : entry,
      ),
    })
    .where(eq(inboundEmails.id, input.inboundEmailId));
  return result;
};

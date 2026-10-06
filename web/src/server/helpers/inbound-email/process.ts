import { eq } from 'drizzle-orm';
import PostalMime from 'postal-mime';
import { z } from 'zod';

import { emailInboxes, type InboundEmailAttachment, inboundEmails } from '@/db/schema';
import { type Database } from '@/lib/db';
import logger from '@/lib/logger';
import { autoImportStatements } from '@/server/statement-import/email';

import { findInboxByToken, tokenFromRecipient } from './inbox';
import { deleteObject, readObject } from './storage';

const verdictSchema = z.object({ status: z.string() });

export const sesNotificationSchema = z.object({
  notificationType: z.literal('Received'),
  mail: z.object({
    messageId: z.string(),
    timestamp: z.string(),
    commonHeaders: z
      .object({ from: z.array(z.string()).optional(), subject: z.string().optional() })
      .optional(),
  }),
  receipt: z.object({
    recipients: z.array(z.string()),
    spamVerdict: verdictSchema,
    virusVerdict: verdictSchema,
    dkimVerdict: verdictSchema,
    dmarcVerdict: verdictSchema,
    action: z.object({
      type: z.literal('S3'),
      bucketName: z.string(),
      objectKey: z.string(),
    }),
  }),
});

type SesNotification = z.infer<typeof sesNotificationSchema>;

const GMAIL_FORWARDING_SENDER = 'forwarding-noreply@google.com';
const CONFIRMATION_CODE = /confirmation code:\s*(\d{6,12})/i;
const CONFIRMATION_URL = /https:\/\/mail(?:-settings)?\.google\.com\/mail\/[^\s<>"]*vf-[^\s<>"]+/i;

const domainOf = (address: string) => address.split('@').at(1)?.toLowerCase() ?? '';

const rejectionReason = (receipt: SesNotification['receipt']) => {
  if (receipt.virusVerdict.status !== 'PASS') {
    return 'Failed the virus scan';
  }
  if (receipt.spamVerdict.status !== 'PASS') {
    return 'Marked as spam';
  }
  if (receipt.dkimVerdict.status !== 'PASS' && receipt.dmarcVerdict.status !== 'PASS') {
    return 'Sender could not be verified (DKIM and DMARC did not pass)';
  }
  return null;
};

const emailStatus = (isGmailConfirmation: boolean, rejectReason: string | null) => {
  if (isGmailConfirmation) {
    return 'confirmation' as const;
  }
  return rejectReason === null ? ('received' as const) : ('rejected' as const);
};

const recordConfirmation = async (db: Database, inboxId: string, text: string) => {
  const code = CONFIRMATION_CODE.exec(text)?.[1] ?? null;
  const url = CONFIRMATION_URL.exec(text)?.[0] ?? null;
  await db
    .update(emailInboxes)
    .set({ confirmationCode: code, confirmationUrl: url, confirmationReceivedAt: new Date() })
    .where(eq(emailInboxes.id, inboxId));
};

export const processInboundEmail = async (db: Database, notification: SesNotification) => {
  const { mail, receipt } = notification;
  const { bucketName, objectKey } = receipt.action;
  const token = receipt.recipients.map(tokenFromRecipient).find((value) => value !== null);
  const inbox = token === undefined ? null : await findInboxByToken(db, token);
  if (inbox === null) {
    logger.info('Inbound email for an unknown or revoked address dropped', {
      messageId: mail.messageId,
    });
    await deleteObject(bucketName, objectKey);
    return;
  }

  const parsed = await PostalMime.parse(await readObject(bucketName, objectKey));
  const fromAddress = (parsed.from?.address ?? mail.commonHeaders?.from?.at(0) ?? '').toLowerCase();
  const attachments: InboundEmailAttachment[] = parsed.attachments.map((attachment) => ({
    filename: attachment.filename ?? 'attachment',
    mimeType: attachment.mimeType,
    size:
      typeof attachment.content === 'string'
        ? attachment.content.length
        : attachment.content.byteLength,
  }));

  const isGmailConfirmation =
    fromAddress === GMAIL_FORWARDING_SENDER && receipt.dkimVerdict.status === 'PASS';
  const rejectReason = isGmailConfirmation ? null : rejectionReason(receipt);
  if (isGmailConfirmation) {
    await recordConfirmation(db, inbox.id, `${parsed.subject ?? ''}\n${parsed.text ?? ''}`);
  }
  const keepRaw = !isGmailConfirmation && rejectReason === null;

  const inserted = await db
    .insert(inboundEmails)
    .values({
      userId: inbox.userId,
      inboxId: inbox.id,
      sesMessageId: mail.messageId,
      receivedAt: new Date(mail.timestamp),
      fromAddress,
      fromDomain: domainOf(fromAddress),
      subject: parsed.subject ?? mail.commonHeaders?.subject ?? '',
      dkimVerdict: receipt.dkimVerdict.status,
      dmarcVerdict: receipt.dmarcVerdict.status,
      spamVerdict: receipt.spamVerdict.status,
      virusVerdict: receipt.virusVerdict.status,
      status: emailStatus(isGmailConfirmation, rejectReason),
      rejectReason,
      attachments,
      objectKey: keepRaw ? objectKey : null,
    })
    .onConflictDoNothing({ target: inboundEmails.sesMessageId })
    .returning({ id: inboundEmails.id });

  if (!keepRaw) {
    await deleteObject(bucketName, objectKey);
    return;
  }
  const emailId = inserted.at(0)?.id;
  if (emailId !== undefined) {
    await autoImportStatements(db, inbox.userId, emailId, parsed.attachments, attachments);
  }
};

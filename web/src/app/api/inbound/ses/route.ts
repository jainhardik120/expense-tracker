import { db } from '@/lib/db';
import { env } from '@/lib/env';
import logger from '@/lib/logger';
import { errorMessage } from '@/lib/utils';
import { processInboundEmail, sesNotificationSchema } from '@/server/helpers/inbound-email/process';
import { isSnsUrl, snsMessageSchema, verifySnsSignature } from '@/server/helpers/inbound-email/sns';

export const runtime = 'nodejs';

const OK = 200;
const BAD_GATEWAY = 502;

export const POST = async (request: Request) => {
  if (env.INBOUND_EMAIL_TOPIC_ARN === undefined) {
    return new Response('Inbound email is not configured', { status: 404 });
  }

  const parsed = snsMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || parsed.data.TopicArn !== env.INBOUND_EMAIL_TOPIC_ARN) {
    return new Response('Bad request', { status: 400 });
  }
  const message = parsed.data;
  if (!(await verifySnsSignature(message))) {
    logger.warn('Rejected an SNS message with an invalid signature', { id: message.MessageId });
    return new Response('Invalid signature', { status: 403 });
  }

  if (message.Type === 'SubscriptionConfirmation') {
    if (message.SubscribeURL === undefined || !isSnsUrl(message.SubscribeURL)) {
      return new Response('Bad subscribe URL', { status: 400 });
    }
    const confirmation = await fetch(message.SubscribeURL);
    logger.info('Confirmed the inbound email SNS subscription', { status: confirmation.status });
    return new Response(null, { status: confirmation.ok ? OK : BAD_GATEWAY });
  }

  if (message.Type === 'UnsubscribeConfirmation') {
    return new Response(null, { status: OK });
  }

  const notification = sesNotificationSchema.safeParse(JSON.parse(message.Message));
  if (!notification.success) {
    logger.warn('Ignored an SNS notification that is not an SES receipt', {
      id: message.MessageId,
    });
    return new Response(null, { status: OK });
  }

  try {
    await processInboundEmail(db, notification.data);
    return new Response(null, { status: OK });
  } catch (error) {
    logger.error('Failed to process an inbound email', {
      id: notification.data.mail.messageId,
      error: errorMessage(error),
    });
    return new Response('Processing failed', { status: 500 });
  }
};

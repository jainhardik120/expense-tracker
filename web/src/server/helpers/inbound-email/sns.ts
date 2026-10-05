import { createVerify } from 'node:crypto';

import { z } from 'zod';

const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com$/;

export const snsMessageSchema = z.object({
  Type: z.enum(['Notification', 'SubscriptionConfirmation', 'UnsubscribeConfirmation']),
  MessageId: z.string(),
  TopicArn: z.string(),
  Message: z.string(),
  Timestamp: z.string(),
  SignatureVersion: z.enum(['1', '2']),
  Signature: z.string(),
  SigningCertURL: z.string(),
  Subject: z.string().optional(),
  SubscribeURL: z.string().optional(),
  Token: z.string().optional(),
});

export type SnsMessage = z.infer<typeof snsMessageSchema>;

const certificateCache = new Map<string, string>();

export const isSnsUrl = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && SNS_HOST.test(url.hostname);
  } catch {
    return false;
  }
};

const signedFields = (message: SnsMessage): Array<keyof SnsMessage> =>
  message.Type === 'Notification'
    ? ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type']
    : ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'];

const stringToSign = (message: SnsMessage) =>
  signedFields(message)
    .filter((field) => message[field] !== undefined)
    .map((field) => `${field}\n${String(message[field])}\n`)
    .join('');

const signingCertificate = async (url: string) => {
  const cached = certificateCache.get(url);
  if (cached !== undefined) {
    return cached;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not fetch the SNS signing certificate (${String(response.status)})`);
  }
  const pem = await response.text();
  certificateCache.set(url, pem);
  return pem;
};

export const verifySnsSignature = async (message: SnsMessage) => {
  if (!isSnsUrl(message.SigningCertURL) || !message.SigningCertURL.endsWith('.pem')) {
    return false;
  }
  const certificate = await signingCertificate(message.SigningCertURL);
  const verifier = createVerify(message.SignatureVersion === '1' ? 'RSA-SHA1' : 'RSA-SHA256');
  verifier.update(stringToSign(message), 'utf8');
  return verifier.verify(certificate, message.Signature, 'base64');
};

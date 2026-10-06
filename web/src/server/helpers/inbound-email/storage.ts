import { DeleteObjectCommand, GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

import { config } from '@/lib/aws-config';

const CONNECTION_TIMEOUT_MS = 5000;
const REQUEST_TIMEOUT_MS = 30_000;

const s3 = new S3Client({
  ...config,
  requestHandler: { connectionTimeout: CONNECTION_TIMEOUT_MS, requestTimeout: REQUEST_TIMEOUT_MS },
});

export const readObject = async (bucket: string, key: string) => {
  const object = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  if (object.Body === undefined) {
    throw new Error(`Inbound email ${key} has no body`);
  }
  return object.Body.transformToByteArray();
};

export const deleteObject = (bucket: string, key: string) =>
  s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { serializeExport } from '@/server/data-transfer/codec';
import { exportUserData } from '@/server/data-transfer/database';

export const runtime = 'nodejs';

const ISO_DAY_LENGTH = 10;

export const GET = async (request: Request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    return new Response('Unauthorized', { status: 401 });
  }
  const file = await exportUserData(db, session.user.id);
  const body = await serializeExport(file);
  const day = file.exportedAt.slice(0, ISO_DAY_LENGTH);
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': 'application/octet-stream',
      'content-disposition': `attachment; filename="expense-tracker-${day}.json.br"`,
      'cache-control': 'no-store',
    },
  });
};

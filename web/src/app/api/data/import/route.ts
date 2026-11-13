import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { parseExport, type ExportFile } from '@/server/data-transfer/codec';
import { importUserData } from '@/server/data-transfer/database';

export const runtime = 'nodejs';

const MAX_FILE_BYTES = 52_428_800;

export const POST = async (request: Request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    return new Response('Unauthorized', { status: 401 });
  }
  const data = Buffer.from(await request.arrayBuffer());
  if (data.length === 0 || data.length > MAX_FILE_BYTES) {
    return Response.json({ error: 'Choose an export file under 50 MB' }, { status: 400 });
  }
  let file: ExportFile;
  try {
    file = await parseExport(data);
  } catch {
    return Response.json({ error: 'This is not an expense tracker export file' }, { status: 400 });
  }
  const dryRun = new URL(request.url).searchParams.get('dryRun') === '1';
  const summary = await importUserData(db, session.user.id, file, { dryRun });
  return Response.json(summary);
};

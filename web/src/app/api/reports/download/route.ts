import { z } from 'zod';

import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import logger from '@/lib/logger';
import { loadUserReport } from '@/server/reports/prepare';
import { renderOneAtATime } from '@/server/reports/render-queue';

export const runtime = 'nodejs';

const bodySchema = z.object({
  fromBoundaryId: z.string(),
  toBoundaryId: z.string(),
});

export const POST = async (request: Request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    return new Response('Unauthorized', { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response('Bad request', { status: 400 });
  }

  try {
    const { renderReportToBuffer } = await import('@helix-hq/pdf-report/server');
    const { template, input, branding } = await loadUserReport({
      db,
      userId: session.user.id,
      userName: session.user.name,
      fromBoundaryId: parsed.data.fromBoundaryId,
      toBoundaryId: parsed.data.toBoundaryId,
    });

    const pdf = await renderOneAtATime(() => renderReportToBuffer(template, { input, branding }));

    return new Response(Buffer.from(pdf) as unknown as BodyInit, {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': 'attachment; filename="money-report.pdf"',
      },
    });
  } catch (error) {
    logger.error('Report render failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return new Response(error instanceof Error ? error.message : 'Render failed', { status: 500 });
  }
};

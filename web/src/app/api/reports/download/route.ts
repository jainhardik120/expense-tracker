import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { reportTemplates } from '@/db/schema';
import { auth } from '@/lib/auth';
import { getTimezone } from '@/lib/date';
import { db } from '@/lib/db';
import logger from '@/lib/logger';
import { defaultExpenseReportTemplate } from '@/server/reports/default-template';
import { buildReportInput } from '@/server/reports/report-input';

export const runtime = 'nodejs';

const bodySchema = z.object({
  fromBoundaryId: z.string(),
  toBoundaryId: z.string(),
});

/**
 * The real download. The raw input is assembled server-side rather than round
 * tripping through the browser — a year of statements is a lot to ship out only
 * to post it straight back.
 */
export const POST = async (request: Request) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (session === null) {
    return new Response('Unauthorized', { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return new Response('Bad request', { status: 400 });
  }

  const { resolveReportTemplate } = await import('@helix-hq/pdf-report');
  const { renderReportToBuffer } = await import('@helix-hq/pdf-report/server');

  const stored = await db
    .select()
    .from(reportTemplates)
    .where(eq(reportTemplates.userId, session.user.id))
    .limit(1);

  const template = resolveReportTemplate(
    stored.length === 0
      ? defaultExpenseReportTemplate
      : {
          inputSchema: stored[0].inputSchema,
          code: stored[0].code,
          outputSchema: stored[0].outputSchema,
          spec: stored[0].spec,
          demoInput: defaultExpenseReportTemplate.demoInput,
        },
  );

  try {
    const input = await buildReportInput({
      db,
      userId: session.user.id,
      fromBoundaryId: parsed.data.fromBoundaryId,
      toBoundaryId: parsed.data.toBoundaryId,
      timezone: await getTimezone(),
    });

    const pdf = await renderReportToBuffer(template, {
      input,
      branding: {
        title: 'Money report',
        subtitle: session.user.name,
        generatedAt: new Date().toUTCString(),
      },
    });

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

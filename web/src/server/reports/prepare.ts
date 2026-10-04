import { eq } from 'drizzle-orm';

import { reportTemplates } from '@/db/schema';
import { getTimezone } from '@/lib/date';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { reportBranding } from '@/server/reports/branding';
import { defaultExpenseReportTemplate } from '@/server/reports/default-template';
import { buildReportInput } from '@/server/reports/report-input';

export const prepareUserReport = instrumentedFunction(
  'prepareUserReport',
  async ({
    db,
    userId,
    userName,
    fromBoundaryId,
    toBoundaryId,
  }: {
    db: Database;
    userId: string;
    userName: string;
    fromBoundaryId: string;
    toBoundaryId: string;
  }) => {
    const { prepareReport, resolveReportTemplate } = await import('@helix-hq/pdf-report');

    const stored = await db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.userId, userId))
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

    const timezone = await getTimezone();
    const input = await buildReportInput({
      db,
      userId,
      fromBoundaryId,
      toBoundaryId,
      timezone,
    });

    const { spec, data } = await prepareReport(template, {
      input,
      branding: reportBranding(userName, timezone),
    });

    return { spec, data };
  },
);

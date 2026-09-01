import { eq } from 'drizzle-orm';

import { reportTemplates } from '@/db/schema';
import { getTimezone } from '@/lib/date';
import type { Database } from '@/lib/db';
import { reportBranding } from '@/server/reports/branding';
import { defaultExpenseReportTemplate } from '@/server/reports/default-template';
import { buildReportInput } from '@/server/reports/report-input';

/**
 * Everything a report needs, short of drawing it.
 *
 * The template's code step runs here — server side, in the package's sandbox —
 * and produces the display values its spec binds to. What consumes the result
 * is left open: the download route hands it to react-pdf, and the reports page
 * hands the same spec and the same values to a DOM registry built from the same
 * catalog. Neither target re-derives anything, so the page and the PDF cannot
 * disagree about what a number is.
 */
export const prepareUserReport = async ({
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

  const input = await buildReportInput({
    db,
    userId,
    fromBoundaryId,
    toBoundaryId,
    timezone: await getTimezone(),
  });

  const { spec, data } = await prepareReport(template, {
    input,
    branding: reportBranding(userName),
  });

  return { spec, data };
};

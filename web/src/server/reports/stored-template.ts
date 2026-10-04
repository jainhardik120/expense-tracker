import { eq } from 'drizzle-orm';

import { reportTemplates } from '@/db/schema';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { defaultExpenseReportTemplate } from '@/server/reports/default-template';

export const getStoredReportTemplate = instrumentedFunction(
  'getStoredReportTemplate',
  async (db: Database, userId: string) => {
    const stored = await db
      .select()
      .from(reportTemplates)
      .where(eq(reportTemplates.userId, userId))
      .limit(1);
    const row = stored.at(0);
    if (row === undefined) {
      return { ...defaultExpenseReportTemplate, isDefault: true };
    }
    return {
      inputSchema: row.inputSchema,
      code: row.code,
      outputSchema: row.outputSchema,
      spec: row.spec,
      demoInput: defaultExpenseReportTemplate.demoInput,
      isDefault: false,
    };
  },
);

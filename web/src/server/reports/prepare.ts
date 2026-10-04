import { getTimezone } from '@/lib/date';
import type { Database } from '@/lib/db';
import { instrumentedFunction } from '@/lib/instrumentation';
import { reportBranding } from '@/server/reports/branding';
import { buildReportInput } from '@/server/reports/report-input';
import { getStoredReportTemplate } from '@/server/reports/stored-template';

type UserReportRequest = {
  db: Database;
  userId: string;
  userName: string;
  fromBoundaryId: string;
  toBoundaryId: string;
};

export const loadUserReport = instrumentedFunction(
  'loadUserReport',
  async ({ db, userId, userName, fromBoundaryId, toBoundaryId }: UserReportRequest) => {
    const { resolveReportTemplate } = await import('@helix-hq/pdf-report');
    const [{ isDefault: _isDefault, ...stored }, timezone] = await Promise.all([
      getStoredReportTemplate(db, userId),
      getTimezone(),
    ]);
    const input = await buildReportInput({ db, userId, fromBoundaryId, toBoundaryId, timezone });
    return {
      template: resolveReportTemplate(stored),
      input,
      branding: reportBranding(userName, timezone),
    };
  },
);

export const prepareUserReport = instrumentedFunction(
  'prepareUserReport',
  async (request: UserReportRequest) => {
    const { prepareReport } = await import('@helix-hq/pdf-report');
    const { template, input, branding } = await loadUserReport(request);
    const { spec, data } = await prepareReport(template, { input, branding });
    return { spec, data };
  },
);

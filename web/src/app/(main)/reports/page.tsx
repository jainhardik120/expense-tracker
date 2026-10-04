import { api } from '@/server/server';

import { ReportPanel } from './_components/report-panel';
import ReportsTable from './_components/reports-table';

export default async function ReportsPage() {
  const [reportData, boundaries] = await Promise.all([
    api.reports.getAggregatedReport(),
    api.reports.getBoundaries(),
  ]);
  return (
    <div className="flex flex-col gap-6">
      <ReportsTable
        initialBoundaries={boundaries}
        initialReport={reportData.periodAggregations.map(
          ({
            date,
            endDate,
            totalAccountsSummary,
            totalFriendsSummary,
            totalExpenses,
            categoryWiseSummary,
          }) => ({
            date,
            endDate,
            totalAccountsSummary,
            totalFriendsSummary,
            totalExpenses,
            categoryWiseSummary,
          }),
        )}
      />
      <ReportPanel boundaries={boundaries} />
    </div>
  );
}

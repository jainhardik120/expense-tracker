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
      {/* Only what a row draws: each period's per-account and per-friend
          balances are most of the aggregation, and the table reads none of it. */}
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

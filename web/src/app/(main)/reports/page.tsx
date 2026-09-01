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
      <ReportsTable initialBoundaries={boundaries} initialReport={reportData.periodAggregations} />
      {/* The report itself, rendered from the same spec the PDF is drawn from.
          It sits under the period table rather than replacing it: the table is
          how boundaries are managed and how a single period is drilled into. */}
      <ReportPanel boundaries={boundaries} />
    </div>
  );
}

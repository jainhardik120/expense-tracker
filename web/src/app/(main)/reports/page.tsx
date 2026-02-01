import { api } from '@/server/server';

import ReportsTable from './_components/reports-table';

export default async function ReportsPage() {
  const [reportData, boundaries] = await Promise.all([
    api.reports.getAggregatedReport(),
    api.reports.getBoundaries(),
  ]);

  return <ReportsTable initialBoundaries={boundaries} initialReport={reportData} />;
}

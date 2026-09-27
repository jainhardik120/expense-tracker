import { getFinancialYearStart } from '@/lib/salary';
import { api } from '@/server/server';
import { EARLIEST_FINANCIAL_YEAR, LATEST_FINANCIAL_YEAR } from '@/types';

import { SalaryDashboard } from './salary-dashboard';

export default async function SalaryPage({
  searchParams,
}: Readonly<{ searchParams: Promise<Record<string, string | string[] | undefined>> }>) {
  const params = await searchParams;
  const requestedYear = Number(Array.isArray(params.fy) ? params.fy[0] : params.fy);
  const financialYearStart =
    Number.isInteger(requestedYear) &&
    requestedYear >= EARLIEST_FINANCIAL_YEAR &&
    requestedYear <= LATEST_FINANCIAL_YEAR
      ? requestedYear
      : getFinancialYearStart(new Date());
  const data = await api.salary.getPageData({ financialYearStart });

  return <SalaryDashboard data={data} />;
}

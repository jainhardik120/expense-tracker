import { cookies } from 'next/headers';

import { createLoader, type SearchParams } from 'nuqs/server';

import { AsyncComponent } from '@/components/async-component';
import { ALL_EXPENSES, CHART_SCOPE_COOKIE, parseChartScope } from '@/lib/chart-scope';
import { getDefaultDateRange, getTimezone } from '@/lib/date';
import { api } from '@/server/server';
import { aggregationParser } from '@/types';

import AggregationTable from '../_components/aggregation-table';
import { CategoryExpensesPieChart, ExpensesLineChart, SummaryCard } from '../_components/charts';
import { CreditCardsCard } from '../_components/credit-cards-card';
import FilterPanel from '../_components/filter-panel';
import { FutureMonthsPaymentsCard } from '../_components/future-months-payments-card';
import { PeriodPaymentsCard } from '../_components/period-payments-card';
import SummaryTable from '../_components/summary-table';

const loader = createLoader(aggregationParser);

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const params = await loader(searchParams);
  const timezone = await getTimezone();
  const { start: defaultStart, end: defaultEnd, endOfYear } = getDefaultDateRange(timezone);
  const dateParams = {
    start: params.start ?? defaultStart,
    end: params.end ?? defaultEnd,
  };

  const aggregationPromise = api.summary.getAggregatedData({
    aggregateBy: params.period,
    ...dateParams,
  });

  // Which budget line the expenses chart opens on, remembered from last time.
  // Checked against the lines that still exist, so deleting the line you were
  // watching drops you back to everything rather than to an empty chart.
  const expenseLines = await api.budget.getExpenseLines();
  const storedScope = parseChartScope((await cookies()).get(CHART_SCOPE_COOKIE)?.value);
  const chartScope = expenseLines.some((line) => line.id === storedScope)
    ? storedScope
    : ALL_EXPENSES;
  // Only the expenses chart narrows. The cards and tables beside it are still
  // answering "where did everything go", which a single line cannot answer.
  const chartPromise =
    chartScope === ALL_EXPENSES
      ? aggregationPromise
      : api.summary.getAggregatedData({
          aggregateBy: params.period,
          budgetLineId: chartScope,
          ...dateParams,
        });
  const creditAccountsPromise = api.emis.getCreditCardsWithOutstandingBalance({
    uptoDate: endOfYear,
    rangeStart: dateParams.start,
    rangeEnd: dateParams.end,
  });

  return (
    <div className="flex flex-col gap-4">
      <FilterPanel />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AsyncComponent promise={chartPromise}>
          {(aggregationData) => (
            <ExpensesLineChart
              allCategories={Object.entries(aggregationData.categoryWiseTotals)
                .filter(([, amount]) => amount > 0)
                .map(([category]) => category)}
              data={aggregationData.periodAggregations.map((agg) => ({
                ...agg,
                expenses: agg.totalExpenses,
              }))}
              range={dateParams}
              scope={chartScope}
              scopeOptions={expenseLines}
              unit={params.period}
            />
          )}
        </AsyncComponent>
        <AsyncComponent promise={aggregationPromise}>
          {(aggregationData) => (
            <CategoryExpensesPieChart
              data={Object.entries(aggregationData.categoryWiseTotals)
                .filter(([, amount]) => amount > 0)
                .map(([category, amount]) => ({
                  category,
                  amount: parseFloat(amount.toFixed(2)),
                }))}
              range={dateParams}
            />
          )}
        </AsyncComponent>
        <AsyncComponent
          loadingFallbackClassName="col-span-1 md:col-span-2 xl:col-span-1"
          promise={aggregationPromise}
        >
          {(summaryData) => <SummaryCard data={summaryData} />}
        </AsyncComponent>
      </div>
      <AsyncComponent
        loadingFallbackClassName="h-[400]"
        promise={Promise.all([aggregationPromise, creditAccountsPromise])}
      >
        {([summaryData, creditData]) => (
          <SummaryTable creditData={creditData.cards} data={summaryData} />
        )}
      </AsyncComponent>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AsyncComponent promise={Promise.all([creditAccountsPromise, aggregationPromise])}>
          {([creditData, summaryData]) => (
            <CreditCardsCard creditData={creditData} summaryData={summaryData} />
          )}
        </AsyncComponent>
        <AsyncComponent promise={Promise.all([aggregationPromise, creditAccountsPromise])}>
          {([summaryData, creditData]) => (
            <PeriodPaymentsCard creditData={creditData} summaryData={summaryData} />
          )}
        </AsyncComponent>
        <AsyncComponent promise={creditAccountsPromise}>
          {(creditData) => <FutureMonthsPaymentsCard creditData={creditData} />}
        </AsyncComponent>
      </div>
      <AsyncComponent loadingFallbackClassName="h-[400]" promise={aggregationPromise}>
        {(aggregationData) => (
          <AggregationTable data={aggregationData.periodAggregations} unit={params.period} />
        )}
      </AsyncComponent>
    </div>
  );
}

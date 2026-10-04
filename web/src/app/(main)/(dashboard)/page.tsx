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

type Aggregation = Awaited<ReturnType<typeof api.summary.getAggregatedData>>;

const periodTotals = (aggregation: Aggregation) =>
  aggregation.periodAggregations.map(
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
  );

const cardSummary = (aggregation: Aggregation) => ({
  accountsSummary: aggregation.accountsSummary,
  friendsSummary: aggregation.friendsSummary,
  aggregatedAccountsSummaryData: aggregation.aggregatedAccountsSummaryData,
  aggregatedFriendsSummaryData: aggregation.aggregatedFriendsSummaryData,
  myExpensesTotal: aggregation.myExpensesTotal,
});

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

  const expenseLines = await api.budget.getExpenseLines();
  const storedScope = parseChartScope((await cookies()).get(CHART_SCOPE_COOKIE)?.value);
  const chartScope = expenseLines.some((line) => line.id === storedScope)
    ? storedScope
    : ALL_EXPENSES;
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
                date: agg.date,
                expenses: agg.totalExpenses,
                categoryWiseSummary: agg.categoryWiseSummary,
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
          {(summaryData) => <SummaryCard data={cardSummary(summaryData)} />}
        </AsyncComponent>
      </div>
      <AsyncComponent
        loadingFallbackClassName="h-[400]"
        promise={Promise.all([aggregationPromise, creditAccountsPromise])}
      >
        {([summaryData, creditData]) => (
          <SummaryTable creditData={creditData.cards} data={cardSummary(summaryData)} />
        )}
      </AsyncComponent>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AsyncComponent promise={Promise.all([creditAccountsPromise, aggregationPromise])}>
          {([creditData, summaryData]) => (
            <CreditCardsCard creditData={creditData} summaryData={cardSummary(summaryData)} />
          )}
        </AsyncComponent>
        <AsyncComponent promise={Promise.all([aggregationPromise, creditAccountsPromise])}>
          {([summaryData, creditData]) => (
            <PeriodPaymentsCard creditData={creditData} summaryData={cardSummary(summaryData)} />
          )}
        </AsyncComponent>
        <AsyncComponent promise={creditAccountsPromise}>
          {(creditData) => <FutureMonthsPaymentsCard creditData={creditData} />}
        </AsyncComponent>
      </div>
      <AsyncComponent loadingFallbackClassName="h-[400]" promise={aggregationPromise}>
        {(aggregationData) => (
          <AggregationTable data={periodTotals(aggregationData)} unit={params.period} />
        )}
      </AsyncComponent>
    </div>
  );
}

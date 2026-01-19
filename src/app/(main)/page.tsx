import { createLoader, type SearchParams } from 'nuqs/server';

import { AsyncComponent } from '@/components/async-component';
import { getDefaultDateRange, getTimezone } from '@/lib/date';
import { api } from '@/server/server';
import { aggregationParser } from '@/types';

import AggregationTable from './_components/aggregation-table';
import { CategoryExpensesPieChart, ExpensesLineChart, SummaryCard } from './_components/charts';
import { CreditCardsCard } from './_components/credit-cards-card';
import { CurrentMonthPaymentsCard } from './_components/current-month-payments-card';
import FilterPanel from './_components/filter-panel';
import { FutureMonthsPaymentsCard } from './_components/future-months-payments-card';
import SummaryTable from './_components/summary-table';

const loader = createLoader(aggregationParser);

export default async function Page({
  searchParams,
}: Readonly<{ searchParams: Promise<SearchParams> }>) {
  const params = await loader(searchParams);
  const timezone = await getTimezone();
  const { start: defaultStart, end: defaultEnd } = getDefaultDateRange(timezone);
  const dateParams = {
    start: params.start ?? defaultStart,
    end: params.end ?? defaultEnd,
  };
  const aggregationPromise = api.summary.getAggregatedData({
    aggregateBy: params.period,
    ...dateParams,
  });
  const summaryPromise = api.summary.getSummary(dateParams);

  // Calculate end of current year (December 31st at 23:59:59)
  const now = new Date();
  const DECEMBER = 11;
  const LAST_DAY = 31;
  const LAST_HOUR = 23;
  const LAST_MINUTE = 59;
  const LAST_SECOND = 59;
  const endOfYear = new Date(
    now.getFullYear(),
    DECEMBER,
    LAST_DAY,
    LAST_HOUR,
    LAST_MINUTE,
    LAST_SECOND,
  );

  const creditAccountsPromise = api.emis.getCreditCardsWithOutstandingBalance({
    uptoDate: endOfYear,
  });

  return (
    <div className="flex flex-col gap-4">
      <FilterPanel />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AsyncComponent promise={aggregationPromise}>
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
          promise={summaryPromise}
        >
          {(summaryData) => <SummaryCard data={summaryData} />}
        </AsyncComponent>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <AsyncComponent promise={Promise.all([creditAccountsPromise, summaryPromise])}>
          {([creditData, summaryData]) => (
            <CreditCardsCard creditData={creditData} summaryData={summaryData} />
          )}
        </AsyncComponent>
        <AsyncComponent promise={creditAccountsPromise}>
          {(creditData) => <CurrentMonthPaymentsCard creditData={creditData} />}
        </AsyncComponent>
        <AsyncComponent promise={creditAccountsPromise}>
          {(creditData) => <FutureMonthsPaymentsCard creditData={creditData} />}
        </AsyncComponent>
      </div>
      <AsyncComponent
        loadingFallbackClassName="h-[400]"
        promise={Promise.all([summaryPromise, creditAccountsPromise])}
      >
        {([summaryData, creditData]) => (
          <SummaryTable creditData={creditData.cards} data={summaryData} />
        )}
      </AsyncComponent>
      <AsyncComponent loadingFallbackClassName="h-[400]" promise={aggregationPromise}>
        {(aggregationData) => (
          <AggregationTable data={aggregationData.periodAggregations} unit={params.period} />
        )}
      </AsyncComponent>
    </div>
  );
}

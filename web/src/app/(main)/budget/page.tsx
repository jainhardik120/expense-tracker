import { api } from '@/server/server';

import { BudgetCycles } from './_components/budget-cycles';
import { BudgetHeadline } from './_components/budget-headline';
import { BudgetIncome } from './_components/budget-income';
import { BudgetVariance } from './_components/budget-variance';
import { BudgetWaterfall } from './_components/budget-waterfall';
import { BudgetYearPicker } from './_components/budget-year-picker';

export default async function BudgetPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ year?: string }> }>) {
  const { year } = await searchParams;
  const years = await api.budget.getYears();
  const selectedId = year ?? years.at(-1)?.id;

  if (selectedId === undefined) {
    return <BudgetYearPicker selectedId={null} years={years} />;
  }

  const detail = await api.budget.getYearDetail({ budgetYearId: selectedId });
  return (
    <div className="flex flex-col gap-4">
      <BudgetYearPicker selectedId={selectedId} years={years} />
      <BudgetHeadline detail={detail} />
      <BudgetVariance detail={detail} />
      <BudgetWaterfall detail={detail} />
      <BudgetIncome detail={detail} />
      <BudgetCycles detail={detail} />
    </div>
  );
}

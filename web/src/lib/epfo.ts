const MONTHS_PER_YEAR = 12;
const FINANCIAL_YEAR_START_MONTH = 3;
const PERCENT = 100;
const NOON_HOUR = 12;

export const EPFO_EMPLOYER_MATCH_MULTIPLIER = 2;

const epfoAnnualRates: Partial<Record<number, number>> = {
  2019: 8.5,
  2020: 8.5,
  2021: 8.1,
  2022: 8.15,
  2023: 8.25,
  2024: 8.25,
  2025: 8.25,
};

const declaredYears = Object.keys(epfoAnnualRates).map(Number);
const firstDeclaredYear = Math.min(...declaredYears);
const lastDeclaredYear = Math.max(...declaredYears);

export const getEpfoAnnualRate = (financialYearStart: number): number =>
  epfoAnnualRates[Math.min(Math.max(financialYearStart, firstDeclaredYear), lastDeclaredYear)] ?? 0;

export type EpfoContribution = {
  amount: number;
  dueMonth: Date;
};

export type EpfoInterestFactors = Partial<Record<number, number>>;

export type EpfoInterestCredit = {
  financialYearStart: number;
  amount: number;
};

type EpfoYearInterest = EpfoInterestCredit & { isCredited: boolean };

const monthIndex = (date: Date) => date.getUTCFullYear() * MONTHS_PER_YEAR + date.getUTCMonth();

const monthPosition = (date: Date) => {
  const daysInMonth = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return monthIndex(date) + (date.getUTCDate() - 1) / daysInMonth;
};

const financialYearOfMonth = (index: number) =>
  Math.floor((index - FINANCIAL_YEAR_START_MONTH) / MONTHS_PER_YEAR);

export const getEpfoInterestByYear = (
  { amount, dueMonth }: EpfoContribution,
  factors: EpfoInterestFactors,
  asOf: Date,
): EpfoYearInterest[] => {
  const accrualStart = monthIndex(dueMonth) + 1;
  const accrualEnd = monthPosition(asOf);
  const years: EpfoYearInterest[] = [];
  let balance = amount;
  const lastYear = financialYearOfMonth(Math.floor(accrualEnd));
  for (let year = financialYearOfMonth(accrualStart); year <= lastYear; year += 1) {
    const yearStart = year * MONTHS_PER_YEAR + FINANCIAL_YEAR_START_MONTH;
    const yearEnd = yearStart + MONTHS_PER_YEAR;
    const months = Math.min(accrualEnd, yearEnd) - Math.max(accrualStart, yearStart);
    if (months <= 0) {
      continue;
    }
    const factor = factors[year];
    const monthlyRate = getEpfoAnnualRate(year) / PERCENT / MONTHS_PER_YEAR;
    const interest = balance * monthlyRate * months * (factor ?? 1);
    years.push({ financialYearStart: year, amount: interest, isCredited: factor !== undefined });
    if (accrualEnd >= yearEnd) {
      balance += interest;
    }
  }
  return years;
};

export const getEpfoInterest = (
  contribution: EpfoContribution,
  factors: EpfoInterestFactors,
  asOf: Date,
) => {
  const years = getEpfoInterestByYear(contribution, factors, asOf);
  const sumWhere = (isCredited: boolean) =>
    years
      .filter((year) => year.isCredited === isCredited)
      .reduce((total, year) => total + year.amount, 0);
  return { credited: sumWhere(true), estimated: sumWhere(false) };
};

export const getEpfoInterestFactors = (
  contributions: EpfoContribution[],
  credits: EpfoInterestCredit[],
): EpfoInterestFactors => {
  const factors: EpfoInterestFactors = {};
  const ordered = [...credits].sort(
    (left, right) => left.financialYearStart - right.financialYearStart,
  );
  for (const credit of ordered) {
    const yearEnd = new Date(
      Date.UTC(credit.financialYearStart + 1, FINANCIAL_YEAR_START_MONTH, 1),
    );
    const computed = contributions
      .flatMap((contribution) => getEpfoInterestByYear(contribution, factors, yearEnd))
      .filter((year) => year.financialYearStart === credit.financialYearStart)
      .reduce((total, year) => total + year.amount, 0);
    if (computed > 0) {
      factors[credit.financialYearStart] = credit.amount / computed;
    }
  }
  return factors;
};

export const getEpfoDueMonth = (salaryPeriodStart: Date) =>
  new Date(
    Date.UTC(salaryPeriodStart.getUTCFullYear(), salaryPeriodStart.getUTCMonth() + 1, 1, NOON_HOUR),
  );

export const getEpfoCreditDate = (dueMonth: Date) =>
  new Date(Date.UTC(dueMonth.getUTCFullYear(), dueMonth.getUTCMonth() + 1, 0, NOON_HOUR));

import { and, desc, eq, isNull, sum } from 'drizzle-orm';

import {
  epfoInterestCredits,
  investments,
  salaryPaymentComponents,
  salaryPayments,
} from '@/db/schema';
import type { Database } from '@/lib/db';
import {
  EPFO_EMPLOYER_MATCH_MULTIPLIER,
  getEpfoDueMonth,
  getEpfoInterest,
  getEpfoInterestByYear,
  getEpfoInterestFactors,
  type EpfoContribution,
  type EpfoInterestFactors,
} from '@/lib/epfo';
import { normalizeInvestmentKind } from '@/lib/investments';

import { parseOptionalNumber } from './utils';

import type { EpfoSchedule, InvestmentRow } from './types';

const DEFAULT_ACCOUNT_LABEL = 'EPFO';

const contributionOf = (investment: InvestmentRow): EpfoContribution => ({
  amount: parseOptionalNumber(investment.investmentAmount) ?? 0,
  dueMonth: investment.epfoSchedule?.dueMonth ?? investment.investmentDate,
});

export const getEpfoValuationAtDate = (investment: InvestmentRow, date: Date): number => {
  const contribution = contributionOf(investment);
  const interest = getEpfoInterest(contribution, investment.epfoSchedule?.factors ?? {}, date);
  return contribution.amount + interest.credited + interest.estimated;
};

const loadEpfoLedger = async (db: Database, userId: string) => {
  const [rows, credits] = await Promise.all([
    db
      .select({
        id: investments.id,
        kind: investments.investmentKind,
        instrumentCode: investments.instrumentCode,
        investmentDate: investments.investmentDate,
        investmentAmount: investments.investmentAmount,
        salaryPeriodStart: salaryPayments.periodStart,
      })
      .from(investments)
      .leftJoin(salaryPayments, eq(investments.salaryPaymentId, salaryPayments.id))
      .where(eq(investments.userId, userId))
      .orderBy(desc(investments.investmentDate)),
    db
      .select({
        instrumentCode: epfoInterestCredits.instrumentCode,
        financialYearStart: epfoInterestCredits.financialYearStart,
        amount: epfoInterestCredits.amount,
      })
      .from(epfoInterestCredits)
      .where(eq(epfoInterestCredits.userId, userId)),
  ]);
  const accounts = new Map<string, { contributions: EpfoContribution[]; ids: string[] }>();
  const schedules = new Map<string, EpfoSchedule>();
  const ledgerRows = rows.filter((row) => normalizeInvestmentKind(row.kind) === 'epfo');
  for (const row of ledgerRows) {
    const dueMonth =
      row.salaryPeriodStart === null ? row.investmentDate : getEpfoDueMonth(row.salaryPeriodStart);
    const code = row.instrumentCode ?? DEFAULT_ACCOUNT_LABEL;
    const account = accounts.get(code) ?? { contributions: [], ids: [] };
    account.contributions.push({
      amount: parseOptionalNumber(row.investmentAmount) ?? 0,
      dueMonth,
    });
    account.ids.push(row.id);
    accounts.set(code, account);
    schedules.set(row.id, { salaryPeriodStart: row.salaryPeriodStart, dueMonth, factors: {} });
  }
  const factorsByAccount = new Map<string, EpfoInterestFactors>();
  for (const [code, account] of accounts) {
    const factors = getEpfoInterestFactors(
      account.contributions,
      credits
        .filter((credit) => credit.instrumentCode === code)
        .map((credit) => ({
          financialYearStart: credit.financialYearStart,
          amount: parseOptionalNumber(credit.amount) ?? 0,
        })),
    );
    factorsByAccount.set(code, factors);
    for (const id of account.ids) {
      const schedule = schedules.get(id);
      if (schedule !== undefined) {
        schedules.set(id, { ...schedule, factors });
      }
    }
  }
  return {
    accounts,
    schedules,
    factorsByAccount,
    latestAccount: ledgerRows.at(0)?.instrumentCode ?? DEFAULT_ACCOUNT_LABEL,
  };
};

export const withEpfoSchedules = async <Row extends InvestmentRow>(
  db: Database,
  userId: string,
  rows: Row[],
): Promise<Row[]> => {
  if (!rows.some((row) => normalizeInvestmentKind(row.investmentKind) === 'epfo')) {
    return rows;
  }
  const { schedules } = await loadEpfoLedger(db, userId);
  return rows.map((row) => {
    const epfoSchedule = schedules.get(row.id);
    return epfoSchedule === undefined ? row : { ...row, epfoSchedule };
  });
};

export const getEpfoAccountLabel = async (db: Database, userId: string) =>
  (await loadEpfoLedger(db, userId)).latestAccount;

const getPendingEpfoPayments = async (db: Database, userId: string) => {
  const rows = await db
    .select({
      salaryPaymentId: salaryPayments.id,
      periodStart: salaryPayments.periodStart,
      employeeShare: sum(salaryPaymentComponents.amount),
    })
    .from(salaryPayments)
    .innerJoin(salaryPaymentComponents, eq(salaryPaymentComponents.paymentId, salaryPayments.id))
    .leftJoin(investments, eq(investments.salaryPaymentId, salaryPayments.id))
    .where(
      and(
        eq(salaryPayments.userId, userId),
        eq(salaryPaymentComponents.classification, 'provident_fund'),
        isNull(investments.id),
      ),
    )
    .groupBy(salaryPayments.id, salaryPayments.periodStart)
    .orderBy(desc(salaryPayments.periodStart));
  return rows.map((row) => {
    const employeeShare = parseOptionalNumber(row.employeeShare) ?? 0;
    return {
      salaryPaymentId: row.salaryPaymentId,
      periodStart: row.periodStart,
      dueMonth: getEpfoDueMonth(row.periodStart),
      expectedAmount: employeeShare * EPFO_EMPLOYER_MATCH_MULTIPLIER,
    };
  });
};

export const getEpfoSummary = async (db: Database, userId: string, asOf = new Date()) => {
  const [ledger, pendingPayments] = await Promise.all([
    loadEpfoLedger(db, userId),
    getPendingEpfoPayments(db, userId),
  ]);
  const pending = pendingPayments.map((payment) => ({
    ...payment,
    estimatedInterest: getEpfoInterest(
      { amount: payment.expectedAmount, dueMonth: payment.dueMonth },
      {},
      asOf,
    ).estimated,
  }));
  const interestByYear = new Map<number, { amount: number; isCredited: boolean }>();
  for (const [code, account] of ledger.accounts) {
    const factors = ledger.factorsByAccount.get(code) ?? {};
    for (const contribution of account.contributions) {
      for (const year of getEpfoInterestByYear(contribution, factors, asOf)) {
        const existing = interestByYear.get(year.financialYearStart);
        interestByYear.set(year.financialYearStart, {
          amount: (existing?.amount ?? 0) + year.amount,
          isCredited: year.isCredited,
        });
      }
    }
  }
  return {
    accountLabel: ledger.latestAccount,
    pending,
    pendingAmount: pending.reduce((total, row) => total + row.expectedAmount, 0),
    pendingInterest: pending.reduce((total, row) => total + row.estimatedInterest, 0),
    interestYears: [...interestByYear.entries()]
      .map(([financialYearStart, year]) => ({ financialYearStart, ...year }))
      .sort((left, right) => right.financialYearStart - left.financialYearStart),
  };
};

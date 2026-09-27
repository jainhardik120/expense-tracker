export const INDIA_NEW_REGIME_STANDARD_DEDUCTION = 75_000;
export const INDIA_HEALTH_EDUCATION_CESS_RATE = 0.04;
export const SALARY_NET_MISMATCH_TOLERANCE = 10;

const REBATE_LIMIT = 1_200_000;
const REBATE_MAX = 60_000;

const PAISE_PER_RUPEE = 100;
/** April, zero-indexed: the Indian financial year runs April to March. */
const FINANCIAL_YEAR_START_MONTH = 3;
/** Salary dates are pinned to midday UTC so a timezone shift cannot move the day. */
export const MIDDAY_UTC_HOUR = 12;
const SUNDAY = 0;
const SATURDAY = 6;

export type SalaryComponentKind = 'earning' | 'deduction';

export type SalaryScheduleComponent = {
  componentId: string;
  name: string;
  kind: SalaryComponentKind;
  classification: 'regular' | 'tax_withholding' | 'provident_fund' | 'other';
  amount: number;
  affectsTaxableIncome: boolean;
  proratable: boolean;
};

export type SalaryScheduleRevision = {
  revisionId: string;
  revisionName: string;
  effectiveFrom: Date;
  effectiveUntil: Date | null;
  payDay: number;
  payDateRule: 'exact' | 'previous_weekday';
  components: SalaryScheduleComponent[];
};

export type SalaryScheduleRow = {
  revisionId: string;
  revisionName: string;
  periodStart: Date;
  paymentDate: Date;
  daysPaid: number;
  daysInPeriod: number;
  components: SalaryScheduleComponent[];
};

export type SalaryTaxResult = {
  salaryTaxableIncome: number;
  standardDeduction: number;
  otherTaxableIncome: number;
  otherDeductions: number;
  grossTaxableIncome: number;
  taxableIncome: number;
  slabs: SalaryTaxSlabBreakdown[];
  slabTax: number;
  rebate: number;
  surcharge: number;
  cess: number;
  totalTax: number;
  marginalRate: number;
};

export type SalaryTaxSlabBreakdown = {
  lower: number;
  upper: number | null;
  rate: number;
  taxableAmount: number;
  tax: number;
};

export type SalaryTdsForecastRow = {
  key: string;
  baseTds: number;
  bonusTds: number;
  reconciliationEligible: boolean;
};

export type ReconciledSalaryTdsRow = SalaryTdsForecastRow & {
  reconciliation: number;
  estimatedTds: number;
};

const roundMoney = (value: number) =>
  Math.round((value + Number.EPSILON) * PAISE_PER_RUPEE) / PAISE_PER_RUPEE;

export const hasMaterialSalaryNetMismatch = (
  statementAmount: number | null,
  calculatedNet: number,
) =>
  statementAmount !== null &&
  roundMoney(Math.abs(statementAmount - calculatedNet)) > SALARY_NET_MISMATCH_TOLERANCE;

export const getFinancialYearStart = (date: Date) => {
  const year = date.getUTCFullYear();
  return date.getUTCMonth() >= FINANCIAL_YEAR_START_MONTH ? year : year - 1;
};

/** Renders a financial year the way it is written in India: 2026 -> "2026-27". */
export const formatFinancialYearLabel = (financialYearStart: number) => {
  const SHORT_YEAR_DIGITS = 2;
  return `${financialYearStart}\u2013${String(financialYearStart + 1).slice(-SHORT_YEAR_DIGITS)}`;
};

export const getFinancialYearRange = (financialYearStart: number) => ({
  start: new Date(Date.UTC(financialYearStart, FINANCIAL_YEAR_START_MONTH, 1, MIDDAY_UTC_HOUR)),
  end: new Date(Date.UTC(financialYearStart + 1, FINANCIAL_YEAR_START_MONTH, 1, MIDDAY_UTC_HOUR)),
});

const lastDayOfMonth = (year: number, month: number) =>
  new Date(Date.UTC(year, month + 1, 0, MIDDAY_UTC_HOUR)).getUTCDate();

export const getEstimatedPayDate = (
  year: number,
  month: number,
  payDay: number,
  rule: SalaryScheduleRevision['payDateRule'],
) => {
  const safeDay = Math.min(Math.max(payDay, 1), lastDayOfMonth(year, month));
  const result = new Date(Date.UTC(year, month, safeDay, MIDDAY_UTC_HOUR));
  if (rule === 'previous_weekday') {
    while (result.getUTCDay() === SUNDAY || result.getUTCDay() === SATURDAY) {
      result.setUTCDate(result.getUTCDate() - 1);
    }
  }
  return result;
};

export const buildRevisionSchedule = (
  revision: SalaryScheduleRevision,
  financialYearStart: number,
): SalaryScheduleRow[] => {
  const financialYear = getFinancialYearRange(financialYearStart);
  const activeStart = new Date(
    Math.max(revision.effectiveFrom.getTime(), financialYear.start.getTime()),
  );
  const activeEnd = new Date(
    Math.min(
      revision.effectiveUntil?.getTime() ?? financialYear.end.getTime(),
      financialYear.end.getTime(),
    ),
  );
  if (activeStart >= activeEnd) {
    return [];
  }

  const rows: SalaryScheduleRow[] = [];
  let cursor = new Date(
    Date.UTC(activeStart.getUTCFullYear(), activeStart.getUTCMonth(), 1, MIDDAY_UTC_HOUR),
  );
  while (cursor < activeEnd) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const daysInPeriod = lastDayOfMonth(year, month);
    const monthStart = new Date(Date.UTC(year, month, 1, MIDDAY_UTC_HOUR));
    const monthEnd = new Date(Date.UTC(year, month + 1, 1, MIDDAY_UTC_HOUR));
    const intersectionStart = new Date(Math.max(monthStart.getTime(), activeStart.getTime()));
    const intersectionEnd = new Date(Math.min(monthEnd.getTime(), activeEnd.getTime()));
    const millisecondsPerDay = 86_400_000;
    const daysPaid = Math.max(
      0,
      Math.round((intersectionEnd.getTime() - intersectionStart.getTime()) / millisecondsPerDay),
    );

    if (daysPaid > 0) {
      rows.push({
        revisionId: revision.revisionId,
        revisionName: revision.revisionName,
        periodStart: monthStart,
        paymentDate: getEstimatedPayDate(year, month, revision.payDay, revision.payDateRule),
        daysPaid,
        daysInPeriod,
        components: revision.components.map((component) => ({
          ...component,
          amount: component.proratable
            ? roundMoney((component.amount * daysPaid) / daysInPeriod)
            : component.amount,
        })),
      });
    }
    cursor = monthEnd;
  }
  return rows;
};

export const getSalaryLineTotals = (
  components: Array<
    Pick<SalaryScheduleComponent, 'kind' | 'classification' | 'amount' | 'affectsTaxableIncome'>
  >,
) => {
  let earnings = 0;
  let deductions = 0;
  let taxableIncome = 0;
  let tds = 0;
  for (const component of components) {
    if (component.kind === 'earning') {
      earnings += component.amount;
      if (component.affectsTaxableIncome) {
        taxableIncome += component.amount;
      }
    } else {
      deductions += component.amount;
      if (component.affectsTaxableIncome) {
        taxableIncome -= component.amount;
      }
    }
    if (component.classification === 'tax_withholding') {
      tds += component.kind === 'deduction' ? component.amount : -component.amount;
    }
  }
  return {
    earnings: roundMoney(earnings),
    deductions: roundMoney(deductions),
    taxableIncome: roundMoney(Math.max(0, taxableIncome)),
    net: roundMoney(earnings - deductions),
    tds: roundMoney(tds),
  };
};

export const reconcileSalaryTdsForecast = ({
  annualTax,
  actualTds,
  rows,
}: {
  annualTax: number;
  actualTds: number;
  rows: SalaryTdsForecastRow[];
}): ReconciledSalaryTdsRow[] => {
  if (rows.length === 0) {
    return [];
  }
  const plannedTds = rows.reduce((total, row) => total + row.baseTds + row.bonusTds, 0);
  const reconciliation = roundMoney(annualTax - actualTds - plannedTds);
  const eligibleIndexes = rows.flatMap((row, index) => (row.reconciliationEligible ? [index] : []));
  if (eligibleIndexes.length === 0) {
    eligibleIndexes.push(rows.length - 1);
  }
  const totalCents = Math.round(reconciliation * PAISE_PER_RUPEE);
  const centsPerRow = Math.trunc(totalCents / eligibleIndexes.length);
  const remainder = totalCents - centsPerRow * eligibleIndexes.length;
  const reconciliationCentsByIndex = new Map(
    eligibleIndexes.map((rowIndex, eligibleIndex) => [
      rowIndex,
      centsPerRow + (eligibleIndex < Math.abs(remainder) ? Math.sign(remainder) : 0),
    ]),
  );

  return rows.map((row, index) => {
    const rowReconciliation = (reconciliationCentsByIndex.get(index) ?? 0) / PAISE_PER_RUPEE;
    return {
      ...row,
      reconciliation: rowReconciliation,
      estimatedTds: roundMoney(row.baseTds + row.bonusTds + rowReconciliation),
    };
  });
};

const INDIA_NEW_REGIME_SLABS = [
  { lower: 0, upper: 400_000, rate: 0 },
  { lower: 400_000, upper: 800_000, rate: 0.05 },
  { lower: 800_000, upper: 1_200_000, rate: 0.1 },
  { lower: 1_200_000, upper: 1_600_000, rate: 0.15 },
  { lower: 1_600_000, upper: 2_000_000, rate: 0.2 },
  { lower: 2_000_000, upper: 2_400_000, rate: 0.25 },
  { lower: 2_400_000, upper: null, rate: 0.3 },
] as const;

const getSlabBreakdown = (taxableIncome: number): SalaryTaxSlabBreakdown[] =>
  INDIA_NEW_REGIME_SLABS.map((slab) => {
    const upper = slab.upper ?? taxableIncome;
    const taxableAmount = Math.max(0, Math.min(taxableIncome, upper) - slab.lower);
    return {
      ...slab,
      taxableAmount: roundMoney(taxableAmount),
      tax: taxableAmount * slab.rate,
    };
  });

const calculateSlabTax = (taxableIncome: number) =>
  getSlabBreakdown(taxableIncome).reduce((total, slab) => total + slab.tax, 0);

const taxBeforeCess = (
  taxableIncome: number,
): { tax: number; rebate: number; surcharge: number } => {
  const slabTax = calculateSlabTax(taxableIncome);
  let rebate = taxableIncome <= REBATE_LIMIT ? Math.min(slabTax, REBATE_MAX) : 0;
  let taxAfterRebate = slabTax - rebate;

  if (taxableIncome > REBATE_LIMIT) {
    const excessOverRebateLimit = taxableIncome - REBATE_LIMIT;
    const marginallyRelievedTax = Math.min(taxAfterRebate, excessOverRebateLimit);
    rebate += taxAfterRebate - marginallyRelievedTax;
    taxAfterRebate = marginallyRelievedTax;
  }

  const surchargeBands = [
    { threshold: 20_000_000, rate: 0.25 },
    { threshold: 10_000_000, rate: 0.15 },
    { threshold: 5_000_000, rate: 0.1 },
  ];
  const band = surchargeBands.find(({ threshold }) => taxableIncome > threshold);
  if (band === undefined) {
    return { tax: taxAfterRebate, rebate, surcharge: 0 };
  }

  const rawSurcharge = taxAfterRebate * band.rate;
  const taxAtThreshold = taxBeforeCess(band.threshold).tax;
  const withMarginalRelief = Math.min(
    taxAfterRebate + rawSurcharge,
    taxAtThreshold + (taxableIncome - band.threshold),
  );
  return {
    tax: withMarginalRelief,
    rebate,
    surcharge: Math.max(0, withMarginalRelief - taxAfterRebate),
  };
};

export const calculateIndiaNewRegimeTax = ({
  salaryTaxableIncome,
  standardDeduction = INDIA_NEW_REGIME_STANDARD_DEDUCTION,
  otherTaxableIncome = 0,
  otherDeductions = 0,
}: {
  salaryTaxableIncome: number;
  standardDeduction?: number;
  otherTaxableIncome?: number;
  otherDeductions?: number;
}): SalaryTaxResult => {
  const grossTaxableIncome = Math.max(0, salaryTaxableIncome + otherTaxableIncome);
  const taxableIncome = Math.max(0, grossTaxableIncome - standardDeduction - otherDeductions);
  const slabs = getSlabBreakdown(taxableIncome);
  const slabTax = slabs.reduce((total, slab) => total + slab.tax, 0);
  const beforeCess = taxBeforeCess(taxableIncome);
  const cess = beforeCess.tax * INDIA_HEALTH_EDUCATION_CESS_RATE;
  const marginalProbe = calculateSlabTax(taxableIncome + 1) - slabTax;

  return {
    salaryTaxableIncome: roundMoney(Math.max(0, salaryTaxableIncome)),
    standardDeduction: roundMoney(Math.max(0, standardDeduction)),
    otherTaxableIncome: roundMoney(Math.max(0, otherTaxableIncome)),
    otherDeductions: roundMoney(Math.max(0, otherDeductions)),
    grossTaxableIncome: roundMoney(grossTaxableIncome),
    taxableIncome: roundMoney(taxableIncome),
    slabs,
    slabTax: roundMoney(slabTax),
    rebate: roundMoney(beforeCess.rebate),
    surcharge: roundMoney(beforeCess.surcharge),
    cess: roundMoney(cess),
    totalTax: roundMoney(beforeCess.tax + cess),
    marginalRate: roundMoney(marginalProbe),
  };
};

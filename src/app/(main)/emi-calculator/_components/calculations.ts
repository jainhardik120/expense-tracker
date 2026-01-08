import {
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
  type CalculationResult,
  type FormValues,
  type ScheduleRow,
} from './types';

export const calculateEMI = (principal: number, monthlyRate: number, tenure: number): number => {
  if (monthlyRate === 0) {
    return principal / tenure;
  }
  return (
    (principal * monthlyRate * Math.pow(1 + monthlyRate, tenure)) /
    (Math.pow(1 + monthlyRate, tenure) - 1)
  );
};

export const calculatePrincipalFromEMI = (
  emi: number,
  monthlyRate: number,
  tenure: number,
): number => {
  if (monthlyRate === 0) {
    return emi * tenure;
  }
  return (
    (emi * (Math.pow(1 + monthlyRate, tenure) - 1)) /
    (monthlyRate * Math.pow(1 + monthlyRate, tenure))
  );
};

export const calculateSchedule = (values: FormValues): CalculationResult => {
  const monthlyRate = values.annualRate / (MONTHS_PER_YEAR * PERCENTAGE_DIVISOR);

  let principal: number;
  let emi: number;

  if (values.calculationMode === 'principal') {
    principal = values.principalAmount ?? 0;
    emi = calculateEMI(principal, monthlyRate, values.tenureMonths);
  } else if (values.calculationMode === 'emi') {
    emi = values.emiAmount ?? 0;
    principal = calculatePrincipalFromEMI(emi, monthlyRate, values.tenureMonths);
  } else {
    // totalEmi mode - calculate monthly EMI from total
    const totalEmi = values.totalEmiAmount ?? 0;
    emi = totalEmi / values.tenureMonths;
    principal = calculatePrincipalFromEMI(emi, monthlyRate, values.tenureMonths);
  }

  const schedule: ScheduleRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  let totalGST = 0;

  for (let month = 1; month <= values.tenureMonths; month++) {
    const interest = balance * monthlyRate;
    const principalComponent = emi - interest;
    balance = Math.max(balance - principalComponent, 0);

    const gst = (interest * values.gstRate) / PERCENTAGE_DIVISOR;
    const totalPayment = emi + gst;

    totalInterest += interest;
    totalGST += gst;

    schedule.push({
      month,
      emi,
      interest,
      principal: principalComponent,
      gst,
      totalPayment,
      balance,
    });
  }

  const processingFeesGST = (values.processingFees * values.processingFeesGst) / PERCENTAGE_DIVISOR;
  const totalProcessingFees = values.processingFees + processingFeesGST;

  return {
    schedule,
    summary: {
      totalEMI: emi * values.tenureMonths,
      totalInterest,
      totalGST,
      totalPrincipal: principal,
      processingFees: values.processingFees,
      processingFeesGST,
      totalProcessingFees,
      totalAmount: emi * values.tenureMonths + totalGST + totalProcessingFees,
      effectivePrincipal: principal,
    },
  };
};

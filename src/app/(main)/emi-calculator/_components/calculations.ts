import {
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
  type EMICalculationResult,
  type EMICalculatorFormValues,
  type EMIScheduleRow,
} from '@/types';

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

const parseFloatSafe = (value: string | undefined): number => {
  if (value === '' || value === undefined || isNaN(Number.parseFloat(value))) {
    return 0;
  }
  return Number.parseFloat(value);
};

export const calculateSchedule = (
  inputValues: Partial<EMICalculatorFormValues>,
): EMICalculationResult => {
  const values = {
    ...inputValues,
    principalAmount: parseFloatSafe(inputValues.principalAmount),
    emiAmount: parseFloatSafe(inputValues.emiAmount),
    totalEmiAmount: parseFloatSafe(inputValues.totalEmiAmount),
    annualRate: parseFloatSafe(inputValues.annualRate),
    tenureMonths: parseFloatSafe(inputValues.tenureMonths),
    gstRate: parseFloatSafe(inputValues.gstRate),
    processingFees: parseFloatSafe(inputValues.processingFees),
    processingFeesGst: parseFloatSafe(inputValues.processingFeesGst),
  };
  const monthlyRate = values.annualRate / (MONTHS_PER_YEAR * PERCENTAGE_DIVISOR);

  let principal: number = 0;
  let emi: number = 0;

  if (values.calculationMode === 'principal') {
    principal = values.principalAmount;
    emi = calculateEMI(principal, monthlyRate, values.tenureMonths);
  } else if (values.calculationMode === 'emi') {
    emi = values.emiAmount;
    principal = calculatePrincipalFromEMI(emi, monthlyRate, values.tenureMonths);
  } else if (values.calculationMode === 'totalEmi') {
    const totalEmi = values.totalEmiAmount;
    emi = totalEmi / values.tenureMonths;
    principal = calculatePrincipalFromEMI(emi, monthlyRate, values.tenureMonths);
  }

  const schedule: EMIScheduleRow[] = [];
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

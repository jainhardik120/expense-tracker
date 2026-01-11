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

export const parseFloatSafe = (value: string | undefined | number): number => {
  if (typeof value === 'number') {
    return value;
  }
  if (value === '' || value === undefined || isNaN(Number.parseFloat(value))) {
    return 0;
  }
  return Number.parseFloat(value);
};

export const calculateEMIAndPrincipal = (values: {
  calculationMode?: EMICalculatorFormValues['calculationMode'];
  monthlyRate: number;
  tenureMonths: number;
  principalAmount: number;
  emiAmount: number;
  totalEmiAmount: number;
}) => {
  let principal: number = 0;
  let emi: number = 0;

  if (values.calculationMode === 'principal') {
    principal = values.principalAmount;
    emi = calculateEMI(principal, values.monthlyRate, values.tenureMonths);
  } else if (values.calculationMode === 'emi') {
    emi = values.emiAmount;
    principal = calculatePrincipalFromEMI(emi, values.monthlyRate, values.tenureMonths);
  } else {
    const totalEmi = values.totalEmiAmount;
    emi = totalEmi / values.tenureMonths;
    principal = calculatePrincipalFromEMI(emi, values.monthlyRate, values.tenureMonths);
  }
  return { emi, principal };
};

export const calculateSchedule = (
  inputValues: Partial<EMICalculatorFormValues>,
): EMICalculationResult => {
  const values = {
    ...inputValues,
    principalAmount: parseFloatSafe(inputValues.principalAmount),
    emiAmount: parseFloatSafe(inputValues.emiAmount),
    totalEmiAmount: parseFloatSafe(inputValues.totalEmiAmount),
    annualRate: parseFloatSafe(inputValues.annualInterestRate),
    tenureMonths: parseFloatSafe(inputValues.tenure),
    gstRate: parseFloatSafe(inputValues.gst),
    processingFees: parseFloatSafe(inputValues.processingFees),
    processingFeesGst: parseFloatSafe(inputValues.processingFeesGst),
  };
  const monthlyRate = values.annualRate / (MONTHS_PER_YEAR * PERCENTAGE_DIVISOR);

  const { emi, principal } = calculateEMIAndPrincipal({ ...values, monthlyRate });

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

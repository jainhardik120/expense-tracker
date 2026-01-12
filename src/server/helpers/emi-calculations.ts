import {
  type Emi,
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
  tenure: number;
  principal: number;
  emiAmount: number;
  totalEmiAmount: number;
}) => {
  let calculatedPrincipal: number = 0;
  let emi: number = 0;
  if (values.calculationMode === 'totalEmi') {
    const totalEmi = values.totalEmiAmount;
    emi = totalEmi / values.tenure;
    calculatedPrincipal = calculatePrincipalFromEMI(emi, values.monthlyRate, values.tenure);
  } else if (values.calculationMode === 'emi') {
    emi = values.emiAmount;
    calculatedPrincipal = calculatePrincipalFromEMI(emi, values.monthlyRate, values.tenure);
  } else {
    calculatedPrincipal = values.principal;
    emi = calculateEMI(calculatedPrincipal, values.monthlyRate, values.tenure);
  }
  return { emi, principal: calculatedPrincipal };
};

export const calculateSchedule = (
  inputValues: Partial<EMICalculatorFormValues>,
): EMICalculationResult => {
  const values = {
    ...inputValues,
    principal: parseFloatSafe(inputValues.principal),
    emiAmount: parseFloatSafe(inputValues.emiAmount),
    totalEmiAmount: parseFloatSafe(inputValues.totalEmiAmount),
    annualInterestRate: parseFloatSafe(inputValues.annualInterestRate),
    tenure: parseFloatSafe(inputValues.tenure),
    gst: parseFloatSafe(inputValues.gst),
    processingFees: parseFloatSafe(inputValues.processingFees),
    processingFeesGst: parseFloatSafe(inputValues.processingFeesGst),
  };
  const monthlyRate = values.annualInterestRate / (MONTHS_PER_YEAR * PERCENTAGE_DIVISOR);

  const { emi, principal } = calculateEMIAndPrincipal({ ...values, monthlyRate });

  const schedule: EMIScheduleRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  let totalGST = 0;

  for (let month = 1; month <= values.tenure; month++) {
    const interest = balance * monthlyRate;
    const principalComponent = emi - interest;
    balance = Math.max(balance - principalComponent, 0);

    const gst = (interest * values.gst) / PERCENTAGE_DIVISOR;
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
      totalEMI: emi * values.tenure,
      totalInterest,
      totalGST,
      totalPrincipal: principal,
      processingFees: values.processingFees,
      processingFeesGST,
      totalProcessingFees,
      totalAmount: emi * values.tenure + totalGST + totalProcessingFees,
      effectivePrincipal: principal,
    },
  };
};

export const getOutstandingBalanceOnInstallment = (emi: Emi, installmentNo: number | null) => {
  if (installmentNo === null || installmentNo === 0) {
    return parseFloatSafe(emi.principal);
  }
  if (installmentNo === parseFloatSafe(emi.tenure)) {
    return 0;
  }
  const schedule = calculateSchedule(emi);
  return schedule.schedule[installmentNo - 1].balance;
};

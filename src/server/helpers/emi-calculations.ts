import {
  type Emi,
  MONTHS_PER_YEAR,
  PERCENTAGE_DIVISOR,
  type EMICalculationResult,
  type EMICalculatorFormValues,
  type EMIScheduleRow,
  MS_PER_DAY,
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
  inputValues: Partial<EMICalculatorFormValues & Emi>,
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
    iafe: parseFloatSafe(inputValues.iafe),
  };
  const monthlyRate = values.annualInterestRate / (MONTHS_PER_YEAR * PERCENTAGE_DIVISOR);

  const { emi, principal } = calculateEMIAndPrincipal({ ...values, monthlyRate });

  const schedule: EMIScheduleRow[] = [];
  let balance = principal;
  let totalInterest = 0;
  let totalGST = 0;

  if (values.processingFees > 0) {
    schedule.push({
      installment: 0,
      emi: 0,
      interest: 0,
      principal: values.processingFees,
      gst: (values.processingFees * values.processingFeesGst) / PERCENTAGE_DIVISOR,
      totalPayment:
        values.processingFees +
        (values.processingFees * values.processingFeesGst) / PERCENTAGE_DIVISOR,
      balance,
      date: inputValues.processingFeesDate,
    });
  }

  for (let month = 1; month <= values.tenure; month++) {
    let interest = balance * monthlyRate;
    const principalComponent = emi - interest;
    balance = Math.max(balance - principalComponent, 0);
    if (month === 1) {
      interest += values.iafe;
    }
    const gst = (interest * values.gst) / PERCENTAGE_DIVISOR;
    const totalPayment = emi + gst;

    totalInterest += interest;
    totalGST += gst;
    const date =
      inputValues.firstInstallmentDate === undefined
        ? undefined
        : new Date(
            inputValues.firstInstallmentDate.getFullYear(),
            inputValues.firstInstallmentDate.getMonth() + month - 1,
            inputValues.firstInstallmentDate.getDate(),
          );
    schedule.push({
      installment: month,
      emi,
      interest,
      principal: principalComponent,
      gst,
      totalPayment,
      balance,
      date,
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
      totalAmount: emi * values.tenure + values.iafe + totalGST + totalProcessingFees,
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
  const { schedule } = calculateSchedule(emi);
  const payment = schedule.find((p) => p.installment === installmentNo);
  if (payment === undefined) {
    return 0;
  }
  return payment.balance;
};

export const getEMIBalances = (
  emi: Emi,
  installmentNo: number | null,
): {
  outstandingBalance: number;
  amountLeftToBePaid: number;
  monthlyEMI: number;
  nextPaymentOn: Date | null;
  nextPaymentAmount: number | null;
} => {
  const installmentPaidTill = installmentNo ?? -1;
  const tenure = parseFloatSafe(emi.tenure);
  const { summary, schedule } = calculateSchedule(emi);
  if (installmentNo === tenure) {
    return {
      outstandingBalance: 0,
      amountLeftToBePaid: 0,
      monthlyEMI: summary.totalEMI / tenure,
      nextPaymentOn: null,
      nextPaymentAmount: null,
    };
  }
  if (installmentPaidTill === -1 && parseFloatSafe(emi.processingFees) > 0) {
    const processingFeesPart = schedule[0];
    return {
      outstandingBalance: processingFeesPart.balance,
      amountLeftToBePaid: summary.totalAmount,
      monthlyEMI: summary.totalEMI / tenure,
      nextPaymentOn: processingFeesPart.date ?? null,
      nextPaymentAmount: processingFeesPart.totalPayment,
    };
  }
  if (installmentPaidTill === -1 || installmentPaidTill === 0) {
    const firstInstallment = schedule.find((p) => p.installment === 1);
    if (firstInstallment === undefined) {
      return {
        outstandingBalance: 0,
        amountLeftToBePaid: 0,
        monthlyEMI: summary.totalEMI / tenure,
        nextPaymentOn: null,
        nextPaymentAmount: null,
      };
    }
    return {
      outstandingBalance: summary.effectivePrincipal,
      amountLeftToBePaid: summary.totalAmount - summary.totalProcessingFees,
      monthlyEMI: summary.totalEMI / tenure,
      nextPaymentOn: firstInstallment.date ?? null,
      nextPaymentAmount: firstInstallment.totalPayment,
    };
  }
  const lastPayment = schedule.find((p) => p.installment === installmentPaidTill);
  const nextPayment = schedule.find((p) => p.installment === installmentPaidTill + 1);
  let amountLeftToBePaid = 0;
  for (const p of schedule) {
    if (p.installment > installmentPaidTill) {
      amountLeftToBePaid += p.totalPayment;
    }
  }
  return {
    outstandingBalance: lastPayment?.balance ?? 0,
    amountLeftToBePaid,
    monthlyEMI: summary.totalEMI / tenure,
    nextPaymentOn: nextPayment?.date ?? null,
    nextPaymentAmount: nextPayment?.totalPayment ?? null,
  };
};

const isDateWithinRange = (date1: Date, date2: Date, daysTolerance = 3): boolean => {
  const diffMs = Math.abs(date1.getTime() - date2.getTime());
  const diffDays = diffMs / MS_PER_DAY;
  return diffDays <= daysTolerance;
};

const isAmountWithinRange = (amount1: number, amount2: number, tolerance = 10): boolean => {
  return Math.abs(amount1 - amount2) <= tolerance;
};

export const confirmMatch = (
  payments: EMIScheduleRow[],
  statementAmount: number,
  statementDate: Date,
  installment: number,
): boolean => {
  const payment = payments.find((p) => p.installment === installment);
  if (payment === undefined) {
    return false;
  }
  const amountMatches = isAmountWithinRange(statementAmount, payment.totalPayment);
  const hasDate = payment.date !== undefined;
  const dateMatches =
    hasDate && payment.date !== undefined ? isDateWithinRange(statementDate, payment.date) : false;
  return (hasDate && dateMatches && amountMatches) || (!hasDate && amountMatches);
};

export type StatementAttributes = {
  emiId?: string;
  installmentNo?: number;
  recurringPaymentId?: string;
  salaryPaymentId?: string;
};

export type EmiSplit = { friendId: string; percentage: string };

export type EmiAttributes = { splits?: EmiSplit[] };

export type SmsAttributes = { statementId?: string };

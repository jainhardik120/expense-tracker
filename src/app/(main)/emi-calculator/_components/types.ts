import * as z from 'zod';

export const MONTHS_PER_YEAR = 12;
export const PERCENTAGE_DIVISOR = 100;
export const MAX_PERCENTAGE = 100;
export const MIN_PERCENTAGE = 0;

export const formSchema = z.object({
  calculationMode: z.enum(['principal', 'emi', 'totalEmi']),
  principalAmount: z.number().optional(),
  emiAmount: z.number().optional(),
  totalEmiAmount: z.number().optional(),
  annualRate: z.number().min(MIN_PERCENTAGE).max(MAX_PERCENTAGE),
  tenureMonths: z.number().int().positive(),
  gstRate: z.number().min(MIN_PERCENTAGE).max(MAX_PERCENTAGE),
  processingFees: z.number().min(MIN_PERCENTAGE),
  processingFeesGst: z.number().min(MIN_PERCENTAGE).max(MAX_PERCENTAGE),
});

export type FormValues = z.infer<typeof formSchema>;

export interface ScheduleRow {
  month: number;
  emi: number;
  interest: number;
  principal: number;
  gst: number;
  totalPayment: number;
  balance: number;
}

export interface CalculationResult {
  schedule: ScheduleRow[];
  summary: {
    totalEMI: number;
    totalInterest: number;
    totalGST: number;
    totalPrincipal: number;
    processingFees: number;
    processingFeesGST: number;
    totalProcessingFees: number;
    totalAmount: number;
    effectivePrincipal: number;
  };
}

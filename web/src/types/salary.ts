import { z } from 'zod';

const NAME_MAX_LENGTH = 80;
const REVISION_NAME_MAX_LENGTH = 100;
const NOTES_MAX_LENGTH = 500;
const MAX_DAYS_IN_MONTH = 31;
export const EARLIEST_FINANCIAL_YEAR = 2000;
export const LATEST_FINANCIAL_YEAR = 2200;

const moneyString = z
  .string()
  .trim()
  .min(1, 'Amount is required')
  .refine((value) => Number.isFinite(Number(value)), 'Enter a valid amount');

export const salaryComponentKindSchema = z.enum(['earning', 'deduction']);
export const salaryComponentFrequencySchema = z.enum(['monthly', 'one_time']);
export const salaryComponentClassificationSchema = z.enum([
  'regular',
  'tax_withholding',
  'provident_fund',
  'other',
]);
export const salaryPayDateRuleSchema = z.enum(['exact', 'previous_weekday']);

export const createSalaryComponentSchema = z.object({
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  kind: salaryComponentKindSchema,
  frequency: salaryComponentFrequencySchema,
  classification: salaryComponentClassificationSchema,
  affectsTaxableIncome: z.boolean(),
  proratable: z.boolean(),
});

export const salaryRevisionComponentInputSchema = z.object({
  componentId: z.uuidv4(),
  amount: moneyString,
});

export const createSalaryRevisionSchema = z.object({
  name: z.string().trim().min(1).max(REVISION_NAME_MAX_LENGTH),
  effectiveFrom: z.date(),
  payDay: z.number().int().min(1).max(MAX_DAYS_IN_MONTH),
  payDateRule: salaryPayDateRuleSchema,
  components: z.array(salaryRevisionComponentInputSchema).min(1),
});

export const updateSalaryRevisionSchema = createSalaryRevisionSchema.extend({
  id: z.uuidv4(),
});

export const createSalaryBonusSchema = z.object({
  componentId: z.uuidv4(),
  expectedDate: z.date(),
  estimatedAmount: moneyString,
  notes: z.string().trim().max(NOTES_MAX_LENGTH).optional(),
});

export const salaryPaymentLineSchema = z.object({
  componentId: z.uuidv4().nullable(),
  bonusId: z.uuidv4().nullable(),
  name: z.string().trim().min(1).max(NAME_MAX_LENGTH),
  kind: salaryComponentKindSchema,
  classification: salaryComponentClassificationSchema,
  affectsTaxableIncome: z.boolean(),
  amount: moneyString,
});

export const updateSalaryPaymentSchema = z.object({
  paymentId: z.uuidv4(),
  paymentDate: z.date(),
  daysPaid: z.number().int().min(0).max(MAX_DAYS_IN_MONTH),
  daysInPeriod: z.number().int().min(1).max(MAX_DAYS_IN_MONTH),
  notes: z.string().trim().max(NOTES_MAX_LENGTH).nullable(),
  lines: z.array(salaryPaymentLineSchema).min(1),
});

export const updateSalaryTaxSettingsSchema = z.object({
  financialYearStart: z.number().int().min(EARLIEST_FINANCIAL_YEAR).max(LATEST_FINANCIAL_YEAR),
  standardDeduction: moneyString,
  otherTaxableIncome: moneyString,
  otherDeductions: moneyString,
});

export type SalaryPaymentLineInput = z.infer<typeof salaryPaymentLineSchema>;

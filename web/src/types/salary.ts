import { z } from 'zod';

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
  name: z.string().trim().min(1).max(80),
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
  name: z.string().trim().min(1).max(100),
  effectiveFrom: z.date(),
  payDay: z.number().int().min(1).max(31),
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
  notes: z.string().trim().max(500).optional(),
});

export const salaryPaymentLineSchema = z.object({
  componentId: z.uuidv4().nullable(),
  bonusId: z.uuidv4().nullable(),
  name: z.string().trim().min(1).max(80),
  kind: salaryComponentKindSchema,
  classification: salaryComponentClassificationSchema,
  affectsTaxableIncome: z.boolean(),
  amount: moneyString,
});

export const updateSalaryPaymentSchema = z.object({
  paymentId: z.uuidv4(),
  paymentDate: z.date(),
  daysPaid: z.number().int().min(0).max(31),
  daysInPeriod: z.number().int().min(1).max(31),
  notes: z.string().trim().max(500).nullable(),
  lines: z.array(salaryPaymentLineSchema).min(1),
});

export const updateSalaryTaxSettingsSchema = z.object({
  financialYearStart: z.number().int().min(2000).max(2200),
  standardDeduction: moneyString,
  otherTaxableIncome: moneyString,
  otherDeductions: moneyString,
});

export type SalaryPaymentLineInput = z.infer<typeof salaryPaymentLineSchema>;

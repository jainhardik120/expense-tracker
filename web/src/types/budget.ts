import { z } from 'zod';

import { statementKinds } from '@/db/enums';

export const budgetRuleSchema = z.object({
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  accounts: z.array(z.string()).default([]),
  statementKinds: z.array(z.enum(statementKinds)).default([]),
  maxAmount: z.number().nullable().default(null),
  minAmount: z.number().nullable().default(null),
});

export type BudgetRule = z.infer<typeof budgetRuleSchema>;
export type StoredBudgetRule = z.input<typeof budgetRuleSchema>;

export const emptyBudgetRule: BudgetRule = {
  categories: [],
  tags: [],
  accounts: [],
  statementKinds: [],
  maxAmount: null,
  minAmount: null,
};

export const budgetAllocationKinds = [
  'monthly',
  'annual',
  'residual',
  'earmarked',
  'schedule',
] as const;
export const budgetIncomeDestinations = ['waterfall', 'line', 'excluded'] as const;
export const budgetIncomeSources = ['statements', 'pending_salary', 'pending_bonus'] as const;

const NAME_REQUIRED = 'Name is required';

export const budgetYearSchema = z.object({
  name: z.string().min(1, NAME_REQUIRED),
  startDate: z.date(),
  endDate: z.date(),
  openingBalanceLineId: z.string().nullable().default(null),
});

export const budgetLineSchema = z.object({
  name: z.string().min(1, NAME_REQUIRED),
  rule: budgetRuleSchema,
  allocationKind: z.enum(budgetAllocationKinds),
  allocationAmount: z.string().default('0'),
  discretionary: z.boolean().default(true),
  closed: z.boolean().default(false),
});

export const budgetIncomeLineSchema = z.object({
  name: z.string().min(1, NAME_REQUIRED),
  rule: budgetRuleSchema,
  source: z.enum(budgetIncomeSources).default('statements'),
  destination: z.enum(budgetIncomeDestinations),
  destinationLineId: z.string().nullable().default(null),
});

export const budgetLineFormSchema = budgetLineSchema.extend({ budgetYearId: z.string() });

export type BudgetYearInput = z.infer<typeof budgetYearSchema>;
export type BudgetLineInput = z.infer<typeof budgetLineSchema>;
export type BudgetIncomeLineInput = z.infer<typeof budgetIncomeLineSchema>;

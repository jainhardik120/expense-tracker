import { z } from 'zod';

import { statementKindEnum } from '@/db/schema';

/**
 * Which statements a budget line claims.
 *
 * Every field is a set, and an empty set means "no constraint" -- so an empty
 * rule matches everything, which is exactly what a catch-all line at the bottom
 * of the waterfall needs. Fields are ANDed; values within a field are ORed.
 */
export const budgetRuleSchema = z.object({
  categories: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
  /** Account or friend ids, matched the same way the statements filter does. */
  accounts: z.array(z.string()).default([]),
  statementKinds: z.array(z.enum(statementKindEnum.enumValues)).default([]),
  /**
   * Bounds on the amount, which is how a bonus is told apart from the salary it
   * arrives with: both are salary, only one is regular.
   */
  maxAmount: z.number().nullable().default(null),
  minAmount: z.number().nullable().default(null),
});

export type BudgetRule = z.infer<typeof budgetRuleSchema>;

export const emptyBudgetRule: BudgetRule = {
  categories: [],
  tags: [],
  accounts: [],
  statementKinds: [],
  maxAmount: null,
  minAmount: null,
};

export const budgetAllocationKinds = ['monthly', 'annual', 'residual', 'earmarked'] as const;
export const budgetIncomeDestinations = ['waterfall', 'line', 'excluded'] as const;

const NAME_REQUIRED = 'Name is required';

export const budgetYearSchema = z.object({
  name: z.string().min(1, NAME_REQUIRED),
  startDate: z.date(),
  endDate: z.date(),
});

export const budgetLineSchema = z.object({
  name: z.string().min(1, NAME_REQUIRED),
  rule: budgetRuleSchema,
  allocationKind: z.enum(budgetAllocationKinds),
  allocationAmount: z.string().default('0'),
  discretionary: z.boolean().default(true),
});

export const budgetIncomeLineSchema = z.object({
  name: z.string().min(1, NAME_REQUIRED),
  rule: budgetRuleSchema,
  destination: z.enum(budgetIncomeDestinations),
  destinationLineId: z.string().nullable().default(null),
});

/** The line schema as the form posts it: the year it belongs to rides along. */
export const budgetLineFormSchema = budgetLineSchema.extend({ budgetYearId: z.string() });

export type BudgetYearInput = z.infer<typeof budgetYearSchema>;
export type BudgetLineInput = z.infer<typeof budgetLineSchema>;
export type BudgetIncomeLineInput = z.infer<typeof budgetIncomeLineSchema>;

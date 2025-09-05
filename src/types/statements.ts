import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
} from 'nuqs/server';
import { z } from 'zod';

const DEFAULT_PER_PAGE = 10;

export const statementsSearchParamsCache = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(DEFAULT_PER_PAGE),
  category: parseAsString.withDefault(''),
  statementKind: parseAsArrayOf(
    z.enum(['expense', 'outside_transaction', 'friend_transaction', 'self_transfer']),
  ).withDefault([]),
  fromAccountId: parseAsString.withDefault(''),
  toAccountId: parseAsString.withDefault(''),
  tags: parseAsArrayOf(parseAsString).withDefault([]),
});

export type GetStatementsSchema = Awaited<ReturnType<typeof statementsSearchParamsCache.parse>>;

// Equivalent Zod schema that matches the NuQS schema structure
export const statementsZodSchema = z.object({
  page: z.number().int().default(1),
  perPage: z.number().int().default(DEFAULT_PER_PAGE),
  category: z.string().default(''),
  statementKind: z
    .array(z.enum(['expense', 'outside_transaction', 'friend_transaction', 'self_transfer']))
    .default([]),
  fromAccountId: z.string().default(''),
  toAccountId: z.string().default(''),
  tags: z.array(z.string()).default([]),
});

export type StatementsZodSchema = z.infer<typeof statementsZodSchema>;

import { z } from 'zod';

import { getTimezone } from '@/lib/date';
import {
  deleteInterestRate,
  getInterestOverview,
  saveInterestRate,
  setInterestPeriods,
} from '@/server/helpers/interest';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

const MAX_RATE = 100;
const MAX_PERIOD_DAYS = 370;
const DAY_MS = 86_400_000;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const annualRate = z
  .string()
  .trim()
  .refine((value) => value !== '' && Number(value) >= 0 && Number(value) < MAX_RATE, {
    message: 'Enter a rate between 0 and 100',
  });

const period = z
  .object({ start: isoDay, end: isoDay })
  .refine((value) => value.start <= value.end, { message: 'The period must end after it starts' })
  .refine(
    (value) => (Date.parse(value.end) - Date.parse(value.start)) / DAY_MS <= MAX_PERIOD_DAYS,
    { message: 'The period can be at most a year' },
  );

export const interestRouter = createTRPCRouter({
  getOverview: protectedProcedure.query(async ({ ctx }) =>
    getInterestOverview(ctx.db, ctx.user.id, await getTimezone()),
  ),

  saveRate: protectedProcedure
    .input(z.object({ accountId: z.uuid(), effectiveFrom: isoDay, annualRate }))
    .mutation(({ ctx, input }) => saveInterestRate(ctx.db, ctx.user.id, input)),

  deleteRate: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) => deleteInterestRate(ctx.db, ctx.user.id, input.id)),

  setPeriods: protectedProcedure
    .input(
      z.object({
        entries: z.array(z.object({ statementId: z.uuid(), period: period.nullable() })).min(1),
      }),
    )
    .mutation(({ ctx, input }) => setInterestPeriods(ctx.db, ctx.user.id, input.entries)),
});

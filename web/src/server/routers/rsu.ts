import { z } from 'zod';

import {
  addRsuVests,
  deleteRsuVest,
  editRsuRelease,
  editRsuVest,
  getRsuSummary,
  releaseRsuVest,
  undoRsuRelease,
} from '@/server/helpers/investment/rsu';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

const positiveNumber = z
  .string()
  .trim()
  .refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, {
    message: 'Enter a number above 0',
  });

const nonNegativeNumber = z
  .string()
  .trim()
  .refine((value) => value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0, {
    message: 'Enter 0 or more',
  });

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

export const rsuRouter = createTRPCRouter({
  getSummary: protectedProcedure.query(({ ctx }) => getRsuSummary(ctx.db, ctx.user.id)),

  addVests: protectedProcedure
    .input(
      z.object({
        grantId: z.uuid(),
        tranches: z.array(z.object({ vestDate: isoDay, units: positiveNumber })).min(1),
      }),
    )
    .mutation(({ ctx, input }) => addRsuVests(ctx.db, ctx.user.id, input.grantId, input.tranches)),

  deleteVest: protectedProcedure
    .input(z.object({ vestId: z.uuid() }))
    .mutation(({ ctx, input }) => deleteRsuVest(ctx.db, ctx.user.id, input.vestId)),

  release: protectedProcedure
    .input(
      z.object({
        vestId: z.uuid(),
        unitPrice: positiveNumber,
        fxRateToInr: positiveNumber,
        unitsWithheld: nonNegativeNumber,
      }),
    )
    .mutation(({ ctx, input }) => releaseRsuVest(ctx.db, ctx.user.id, input)),

  editRelease: protectedProcedure
    .input(
      z.object({
        vestId: z.uuid(),
        unitPrice: positiveNumber,
        fxRateToInr: positiveNumber,
        unitsWithheld: nonNegativeNumber,
      }),
    )
    .mutation(({ ctx, input }) => editRsuRelease(ctx.db, ctx.user.id, input)),

  editVest: protectedProcedure
    .input(z.object({ vestId: z.uuid(), vestDate: isoDay, units: positiveNumber }))
    .mutation(({ ctx, input }) => editRsuVest(ctx.db, ctx.user.id, input)),

  undoRelease: protectedProcedure
    .input(z.object({ vestId: z.uuid() }))
    .mutation(({ ctx, input }) => undoRsuRelease(ctx.db, ctx.user.id, input.vestId)),
});

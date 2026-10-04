import { and, asc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { reportBoundaries, reportTemplates } from '@/db/schema';
import { startOfDayLocal, getTimezone } from '@/lib/date';
import { type Database, lockUser } from '@/lib/db';
import { getRawDataForCustomAggregation, processAggregatedData } from '@/server/helpers/summary';
import { buildReportInput } from '@/server/reports/report-input';
import { getStoredReportTemplate } from '@/server/reports/stored-template';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

import { getAccounts, getFriends } from '../helpers/account';
import { parseFloatSafe } from '../helpers/emi-calculations';

const createBoundarySchema = z.object({
  boundaryDate: z.date(),
});

const assertBoundaryDateFree = async (
  tx: Database,
  userId: string,
  boundaryDate: Date,
  exceptId?: string,
) => {
  await lockUser(tx, 'report-boundaries', userId);
  const taken = await tx
    .select({ id: reportBoundaries.id })
    .from(reportBoundaries)
    .where(
      and(
        eq(reportBoundaries.userId, userId),
        eq(reportBoundaries.boundaryDate, boundaryDate),
        exceptId === undefined ? undefined : ne(reportBoundaries.id, exceptId),
      ),
    )
    .limit(1);
  if (taken.length > 0) {
    throw new Error('A boundary with this date already exists');
  }
};

export const reportsRouter = createTRPCRouter({
  getBoundaries: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db
      .select()
      .from(reportBoundaries)
      .where(eq(reportBoundaries.userId, ctx.user.id))
      .orderBy(asc(reportBoundaries.boundaryDate));
  }),

  createBoundary: protectedProcedure
    .input(createBoundarySchema)
    .mutation(async ({ ctx, input }) => {
      const boundaryDate = startOfDayLocal(input.boundaryDate, await getTimezone());
      return ctx.db.transaction(async (tx) => {
        await assertBoundaryDateFree(tx, ctx.user.id, boundaryDate);
        return tx
          .insert(reportBoundaries)
          .values({ userId: ctx.user.id, boundaryDate })
          .returning();
      });
    }),

  deleteBoundary: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db
        .delete(reportBoundaries)
        .where(and(eq(reportBoundaries.id, input.id), eq(reportBoundaries.userId, ctx.user.id)))
        .returning();
    }),

  updateBoundary: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        boundaryDate: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const boundaryDate = startOfDayLocal(input.boundaryDate, await getTimezone());
      return ctx.db.transaction(async (tx) => {
        await assertBoundaryDateFree(tx, ctx.user.id, boundaryDate, input.id);
        return tx
          .update(reportBoundaries)
          .set({ boundaryDate })
          .where(and(eq(reportBoundaries.id, input.id), eq(reportBoundaries.userId, ctx.user.id)))
          .returning();
      });
    }),

  renderReport: protectedProcedure
    .input(z.object({ fromBoundaryId: z.string(), toBoundaryId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { prepareUserReport } = await import('@/server/reports/prepare');
      return prepareUserReport({
        db: ctx.db,
        userId: ctx.user.id,
        userName: ctx.user.name,
        fromBoundaryId: input.fromBoundaryId,
        toBoundaryId: input.toBoundaryId,
      });
    }),

  getTemplate: protectedProcedure.query(({ ctx }) => getStoredReportTemplate(ctx.db, ctx.user.id)),

  saveTemplate: protectedProcedure
    .input(
      z.object({
        inputSchema: z.unknown(),
        code: z.string(),
        outputSchema: z.unknown(),
        spec: z.unknown(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const values = {
        userId: ctx.user.id,
        inputSchema: input.inputSchema,
        code: input.code,
        outputSchema: input.outputSchema,
        spec: input.spec,
        updatedAt: new Date(),
      };
      return ctx.db
        .insert(reportTemplates)
        .values(values)
        .onConflictDoUpdate({ target: reportTemplates.userId, set: values })
        .returning();
    }),

  getReportInput: protectedProcedure
    .input(z.object({ fromBoundaryId: z.string(), toBoundaryId: z.string() }))
    .query(async ({ ctx, input }) => {
      return buildReportInput({
        db: ctx.db,
        userId: ctx.user.id,
        fromBoundaryId: input.fromBoundaryId,
        toBoundaryId: input.toBoundaryId,
        timezone: await getTimezone(),
      });
    }),

  getAggregatedReport: protectedProcedure.query(async ({ ctx }) => {
    const rawData = await getRawDataForCustomAggregation(ctx.db, ctx.user.id);
    const friends = await getFriends(ctx.db, ctx.user.id);
    const accounts = await getAccounts(ctx.db, ctx.user.id);
    return processAggregatedData({
      ...rawData,
      friendsSummary: friends.map((friend) => ({
        friend: {
          id: friend.id,
        },
        startingBalance: 0,
      })),
      accountsSummary: accounts.map((account) => ({
        account: {
          id: account.id,
        },
        startingBalance: parseFloatSafe(account.startingBalance),
      })),
    });
  }),
});

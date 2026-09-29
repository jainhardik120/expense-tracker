import {
  and,
  asc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from 'drizzle-orm';
import { z } from 'zod';

import {
  bankAccount,
  salaryBonuses,
  salaryComponents,
  salaryPaymentComponents,
  salaryPayments,
  salaryRevisionComponents,
  salaryRevisions,
  salaryTaxSettings,
  statements,
} from '@/db/schema';
import { type Database } from '@/lib/db';
import {
  buildRevisionSchedule,
  calculateIndiaNewRegimeTax,
  getFinancialYearRange,
  getFinancialYearStart,
  getSalaryLineTotals,
  MIDDAY_UTC_HOUR,
  reconcileSalaryTdsForecast,
  type SalaryScheduleComponent,
} from '@/lib/salary';
import { getStatementAttributes } from '@/server/helpers/emi';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';
import {
  createSalaryBonusSchema,
  createSalaryComponentSchema,
  EARLIEST_FINANCIAL_YEAR,
  LATEST_FINANCIAL_YEAR,
  createSalaryRevisionSchema,
  updateSalaryPaymentSchema,
  updateSalaryRevisionSchema,
  updateSalaryTaxSettingsSchema,
} from '@/types';

const financialYearInput = z.object({
  financialYearStart: z.number().int().min(EARLIEST_FINANCIAL_YEAR).max(LATEST_FINANCIAL_YEAR),
});
const monthKey = (date: Date) =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
const paymentKey = (revisionId: string, periodStart: Date) =>
  `${revisionId}:${monthKey(periodStart)}`;
const toNumber = (value: string | number | null) => (value === null ? 0 : Number(value));

const validateRevisionComponents = async (
  db: Database,
  userId: string,
  components: Array<{ componentId: string }>,
) => {
  const componentIds = components.map((component) => component.componentId);
  const uniqueComponentIds = new Set(componentIds);
  const ownedComponents = await db
    .select({ id: salaryComponents.id, frequency: salaryComponents.frequency })
    .from(salaryComponents)
    .where(and(eq(salaryComponents.userId, userId), inArray(salaryComponents.id, componentIds)));
  if (
    uniqueComponentIds.size !== componentIds.length ||
    ownedComponents.length !== componentIds.length ||
    ownedComponents.some((component) => component.frequency !== 'monthly')
  ) {
    throw new Error('Every revision component must be a unique monthly component owned by you');
  }
};

export const getSalaryPageData = async (
  db: Database,
  userId: string,
  financialYearStart: number,
) => {
  const financialYear = getFinancialYearRange(financialYearStart);
  const [
    components,
    revisions,
    revisionAmounts,
    payments,
    paymentLines,
    bonuses,
    settingsRows,
    taxableStatementRows,
  ] = await Promise.all([
    db
      .select()
      .from(salaryComponents)
      .where(eq(salaryComponents.userId, userId))
      .orderBy(asc(salaryComponents.createdAt)),
    db
      .select()
      .from(salaryRevisions)
      .where(eq(salaryRevisions.userId, userId))
      .orderBy(asc(salaryRevisions.effectiveFrom)),
    db
      .select({
        revisionId: salaryRevisionComponents.revisionId,
        componentId: salaryRevisionComponents.componentId,
        amount: salaryRevisionComponents.amount,
      })
      .from(salaryRevisionComponents)
      .innerJoin(salaryRevisions, eq(salaryRevisionComponents.revisionId, salaryRevisions.id))
      .where(eq(salaryRevisions.userId, userId)),
    db
      .select({
        ...getTableColumns(salaryPayments),
        // A month's pay does not always arrive as one credit: a bonus can land
        // beside the salary on the same day. Every statement linked to a payment
        // already carries its id, so they are summed rather than the single
        // statement named on the payment being taken as the whole of it.
        statementAmount: sql<string | null>`(
          SELECT SUM(credit.amount) FROM ${statements} credit
          WHERE credit.user_id = ${salaryPayments.userId}
            AND credit.additional_attributes->>'salaryPaymentId' = ${salaryPayments.id}::text
        )`,
      })
      .from(salaryPayments)
      .leftJoin(statements, eq(salaryPayments.statementId, statements.id))
      .where(eq(salaryPayments.userId, userId))
      .orderBy(asc(salaryPayments.periodStart)),
    db
      .select({
        id: salaryPaymentComponents.id,
        paymentId: salaryPaymentComponents.paymentId,
        componentId: salaryPaymentComponents.componentId,
        bonusId: salaryPaymentComponents.bonusId,
        name: salaryPaymentComponents.name,
        kind: salaryPaymentComponents.kind,
        classification: salaryPaymentComponents.classification,
        affectsTaxableIncome: salaryPaymentComponents.affectsTaxableIncome,
        amount: salaryPaymentComponents.amount,
      })
      .from(salaryPaymentComponents)
      .innerJoin(salaryPayments, eq(salaryPaymentComponents.paymentId, salaryPayments.id))
      .where(eq(salaryPayments.userId, userId)),
    db
      .select({
        id: salaryBonuses.id,
        componentId: salaryBonuses.componentId,
        expectedDate: salaryBonuses.expectedDate,
        estimatedAmount: salaryBonuses.estimatedAmount,
        actualAmount: salaryBonuses.actualAmount,
        notes: salaryBonuses.notes,
        createdAt: salaryBonuses.createdAt,
        componentName: salaryComponents.name,
        affectsTaxableIncome: salaryComponents.affectsTaxableIncome,
      })
      .from(salaryBonuses)
      .innerJoin(salaryComponents, eq(salaryBonuses.componentId, salaryComponents.id))
      .where(eq(salaryBonuses.userId, userId))
      .orderBy(asc(salaryBonuses.expectedDate)),
    db
      .select()
      .from(salaryTaxSettings)
      .where(
        and(
          eq(salaryTaxSettings.userId, userId),
          eq(salaryTaxSettings.financialYearStart, financialYearStart),
        ),
      )
      .limit(1),
    db
      .select({
        id: statements.id,
        createdAt: statements.createdAt,
        category: statements.category,
        creditedAmount: statements.amount,
        taxableAmount: statements.taxableAmount,
        accountName: bankAccount.accountName,
      })
      .from(statements)
      .leftJoin(salaryPayments, eq(salaryPayments.statementId, statements.id))
      .leftJoin(bankAccount, eq(bankAccount.id, statements.accountId))
      .where(
        and(
          eq(statements.userId, userId),
          gte(statements.createdAt, financialYear.start),
          lt(statements.createdAt, financialYear.end),
          isNotNull(statements.taxableAmount),
          isNull(salaryPayments.id),
          // Already part of a month's pay, so not income from outside it.
          sql`${statements.additionalAttributes}->>'salaryPaymentId' IS NULL`,
        ),
      )
      .orderBy(asc(statements.createdAt)),
  ]);

  const componentById = new Map(components.map((component) => [component.id, component]));
  const bonusesInYear = bonuses.filter(
    (bonus) => bonus.expectedDate >= financialYear.start && bonus.expectedDate < financialYear.end,
  );
  const amountsByRevision = new Map<string, typeof revisionAmounts>();
  for (const amount of revisionAmounts) {
    const rows = amountsByRevision.get(amount.revisionId) ?? [];
    rows.push(amount);
    amountsByRevision.set(amount.revisionId, rows);
  }

  const scheduledRows = revisions.flatMap((revision, index) => {
    const scheduleComponents: SalaryScheduleComponent[] = (
      amountsByRevision.get(revision.id) ?? []
    ).flatMap((amount) => {
      const component = componentById.get(amount.componentId);
      if (component?.frequency !== 'monthly') {
        return [];
      }
      return [
        {
          componentId: component.id,
          name: component.name,
          kind: component.kind,
          classification: component.classification,
          amount: toNumber(amount.amount),
          affectsTaxableIncome: component.affectsTaxableIncome,
          proratable: component.proratable,
        },
      ];
    });
    return buildRevisionSchedule(
      {
        revisionId: revision.id,
        revisionName: revision.name,
        effectiveFrom: revision.effectiveFrom,
        effectiveUntil: revisions[index + 1]?.effectiveFrom ?? null,
        payDay: revision.payDay,
        payDateRule: revision.payDateRule,
        components: scheduleComponents,
      },
      financialYearStart,
    );
  });

  const paymentLinesByPayment = new Map<string, typeof paymentLines>();
  for (const line of paymentLines) {
    const rows = paymentLinesByPayment.get(line.paymentId) ?? [];
    rows.push(line);
    paymentLinesByPayment.set(line.paymentId, rows);
  }
  const paymentsBySchedule = new Map(
    payments.map((payment) => [paymentKey(payment.revisionId, payment.periodStart), payment]),
  );
  const revisionIdsWithPayments = new Set(payments.map((payment) => payment.revisionId));
  const unresolvedBonuses = bonusesInYear.filter((bonus) => bonus.actualAmount === null);
  const bonusTargetById = new Map(
    unresolvedBonuses.flatMap((bonus) => {
      const candidates = scheduledRows.filter(
        (row) => monthKey(row.periodStart) === monthKey(bonus.expectedDate),
      );
      const target = candidates
        .toSorted(
          (left, right) =>
            Math.abs(left.paymentDate.getTime() - bonus.expectedDate.getTime()) -
            Math.abs(right.paymentDate.getTime() - bonus.expectedDate.getTime()),
        )
        .at(0);
      return target === undefined
        ? []
        : ([[bonus.id, paymentKey(target.revisionId, target.periodStart)]] as const);
    }),
  );
  const now = new Date();
  const currentMonthStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, MIDDAY_UTC_HOUR),
  );

  const baseRows = scheduledRows.map((scheduled) => {
    const actualPayment = paymentsBySchedule.get(
      paymentKey(scheduled.revisionId, scheduled.periodStart),
    );
    if (actualPayment !== undefined) {
      const lines = (paymentLinesByPayment.get(actualPayment.id) ?? []).map((line) => ({
        ...line,
        amount: toNumber(line.amount),
        proratable: false,
      }));
      return {
        ...scheduled,
        paymentId: actualPayment.id,
        statementId: actualPayment.statementId,
        statementAmount:
          actualPayment.statementAmount === null ? null : toNumber(actualPayment.statementAmount),
        paymentDate: actualPayment.paymentDate,
        daysPaid: actualPayment.daysPaid,
        daysInPeriod: actualPayment.daysInPeriod,
        notes: actualPayment.notes,
        status: 'actual' as const,
        components: lines,
        totals: getSalaryLineTotals(lines),
      };
    }

    const bonusLines = unresolvedBonuses
      .filter(
        (bonus) =>
          bonusTargetById.get(bonus.id) === paymentKey(scheduled.revisionId, scheduled.periodStart),
      )
      .map((bonus) => ({
        componentId: bonus.componentId,
        bonusId: bonus.id,
        name: bonus.componentName,
        kind: 'earning' as const,
        classification: 'other' as const,
        amount: toNumber(bonus.estimatedAmount),
        affectsTaxableIncome: bonus.affectsTaxableIncome,
        proratable: false,
      }));
    const lines = [...scheduled.components, ...bonusLines];
    return {
      ...scheduled,
      paymentId: null,
      statementId: null,
      statementAmount: null,
      notes: null,
      status: scheduled.paymentDate < now ? ('awaiting' as const) : ('forecast' as const),
      components: lines,
      totals: getSalaryLineTotals(lines),
    };
  });

  const settings = settingsRows[0] ?? {
    userId,
    financialYearStart,
    standardDeduction: '75000',
    otherTaxableIncome: '0',
    otherDeductions: '0',
    updatedAt: new Date(),
  };
  const baseActualRows = baseRows.filter((row) => row.status === 'actual');
  const baseFutureRows = baseRows
    .filter((row) => row.status !== 'actual' && row.paymentDate >= now)
    .toSorted((left, right) => left.paymentDate.getTime() - right.paymentDate.getTime());
  const annualTaxableIncome = [...baseActualRows, ...baseFutureRows].reduce(
    (total, row) => total + row.totals.taxableIncome,
    0,
  );
  const actualTdsBeforeForecast = baseActualRows.reduce((total, row) => total + row.totals.tds, 0);
  const statementTaxableIncome = taxableStatementRows.reduce(
    (total, statement) => total + toNumber(statement.taxableAmount),
    0,
  );
  const additionalEstimatedTaxableIncome = toNumber(settings.otherTaxableIncome);
  const outsideTaxableIncome = statementTaxableIncome + additionalEstimatedTaxableIncome;
  const salaryOnlyTaxSettings = {
    standardDeduction: toNumber(settings.standardDeduction),
    otherTaxableIncome: 0,
    otherDeductions: toNumber(settings.otherDeductions),
  };
  const salaryTax = calculateIndiaNewRegimeTax({
    salaryTaxableIncome: annualTaxableIncome,
    ...salaryOnlyTaxSettings,
  });
  const tax = calculateIndiaNewRegimeTax({
    salaryTaxableIncome: annualTaxableIncome,
    ...salaryOnlyTaxSettings,
    otherTaxableIncome: outsideTaxableIncome,
  });
  const estimatedOutsideIncomeTax = Number(
    Math.max(0, tax.totalTax - salaryTax.totalTax).toFixed(2),
  );
  const futureScheduleKeys = new Set(
    baseFutureRows.map((row) => paymentKey(row.revisionId, row.periodStart)),
  );
  const forecastBonuses = unresolvedBonuses
    .filter((bonus) => {
      const target = bonusTargetById.get(bonus.id);
      return target !== undefined && futureScheduleKeys.has(target);
    })
    .toSorted((left, right) => left.expectedDate.getTime() - right.expectedDate.getTime());
  const forecastBonusTaxable = forecastBonuses.reduce(
    (total, bonus) => total + (bonus.affectsTaxableIncome ? toNumber(bonus.estimatedAmount) : 0),
    0,
  );
  const taxWithoutPendingBonuses = calculateIndiaNewRegimeTax({
    salaryTaxableIncome: Math.max(0, annualTaxableIncome - forecastBonusTaxable),
    ...salaryOnlyTaxSettings,
  });
  const bonusTdsBySchedule = new Map<string, number>();
  const bonusTaxById = new Map<string, number>();
  let cumulativeBonusTaxable = 0;
  let taxBeforeNextBonus = taxWithoutPendingBonuses.totalTax;
  for (const bonus of forecastBonuses) {
    bonusTaxById.set(bonus.id, 0);
    if (!bonus.affectsTaxableIncome) {
      continue;
    }
    cumulativeBonusTaxable += toNumber(bonus.estimatedAmount);
    const taxIncludingBonus = calculateIndiaNewRegimeTax({
      salaryTaxableIncome: annualTaxableIncome - forecastBonusTaxable + cumulativeBonusTaxable,
      ...salaryOnlyTaxSettings,
    }).totalTax;
    const incrementalTax = Math.max(0, taxIncludingBonus - taxBeforeNextBonus);
    bonusTaxById.set(bonus.id, incrementalTax);
    const target = bonusTargetById.get(bonus.id);
    if (target !== undefined) {
      bonusTdsBySchedule.set(target, (bonusTdsBySchedule.get(target) ?? 0) + incrementalTax);
    }
    taxBeforeNextBonus = taxIncludingBonus;
  }
  const tdsForecast = reconcileSalaryTdsForecast({
    annualTax: salaryTax.totalTax,
    actualTds: actualTdsBeforeForecast,
    rows: baseFutureRows.map((row) => {
      const key = paymentKey(row.revisionId, row.periodStart);
      return {
        key,
        baseTds: row.totals.tds,
        bonusTds: bonusTdsBySchedule.get(key) ?? 0,
        reconciliationEligible: row.periodStart > currentMonthStart,
      };
    }),
  });
  const tdsForecastBySchedule = new Map(tdsForecast.map((row) => [row.key, row]));
  const rows = baseRows.map((row) => {
    const forecast = tdsForecastBySchedule.get(paymentKey(row.revisionId, row.periodStart));
    if (forecast === undefined) {
      return row;
    }
    const adjustments = [];
    if (forecast.bonusTds !== 0) {
      adjustments.push({
        componentId: null,
        bonusId: null,
        name: 'Estimated bonus TDS',
        kind: 'deduction' as const,
        classification: 'tax_withholding' as const,
        amount: forecast.bonusTds,
        affectsTaxableIncome: false,
        proratable: false,
        forecastAdjustment: 'bonus_tds' as const,
      });
    }
    if (forecast.reconciliation !== 0) {
      adjustments.push({
        componentId: null,
        bonusId: null,
        name:
          forecast.reconciliation > 0
            ? 'Estimated TDS balance adjustment'
            : 'Estimated TDS balance credit',
        kind: 'deduction' as const,
        classification: 'tax_withholding' as const,
        amount: forecast.reconciliation,
        affectsTaxableIncome: false,
        proratable: false,
        forecastAdjustment: 'year_end_reconciliation' as const,
      });
    }
    const adjustedComponents = [...row.components, ...adjustments];
    return {
      ...row,
      components: adjustedComponents,
      totals: getSalaryLineTotals(adjustedComponents),
    };
  });
  const actualRows = rows.filter((row) => row.status === 'actual');
  const futureRows = rows.filter((row) => row.status !== 'actual' && row.paymentDate >= now);
  const actualTds = actualRows.reduce((total, row) => total + row.totals.tds, 0);
  const projectedTds = futureRows.reduce((total, row) => total + row.totals.tds, 0);

  return {
    financialYearStart,
    components,
    revisions: revisions.map((revision) => ({
      ...revision,
      hasLinkedPayments: revisionIdsWithPayments.has(revision.id),
      components: (amountsByRevision.get(revision.id) ?? []).map((amount) => ({
        ...amount,
        component: componentById.get(amount.componentId) ?? null,
      })),
    })),
    bonuses: bonusesInYear.map((bonus) => {
      const estimatedTax =
        bonus.actualAmount === null ? (bonusTaxById.get(bonus.id) ?? null) : null;
      const grossAmount = toNumber(bonus.actualAmount ?? bonus.estimatedAmount);
      return {
        ...bonus,
        estimatedTax,
        estimatedNet: estimatedTax === null ? null : grossAmount - estimatedTax,
      };
    }),
    taxableStatements: taxableStatementRows.map((statement) => ({
      ...statement,
      taxableAmount: statement.taxableAmount ?? '0',
    })),
    taxSettings: settings,
    rows,
    summary: {
      actualReceived: actualRows.reduce((total, row) => total + row.totals.net, 0),
      actualTaxableIncome: actualRows.reduce((total, row) => total + row.totals.taxableIncome, 0),
      actualTds,
      actualPf: actualRows.reduce(
        (total, row) =>
          total +
          row.components
            .filter((line) => line.classification === 'provident_fund')
            .reduce((lineTotal, line) => lineTotal + line.amount, 0),
        0,
      ),
      statementTaxableIncome,
      additionalEstimatedTaxableIncome,
      outsideTaxableIncome,
      estimatedOutsideIncomeTax,
      projectedRemainingNet: futureRows.reduce((total, row) => total + row.totals.net, 0),
      projectedAnnualNet: [...actualRows, ...futureRows].reduce(
        (total, row) => total + row.totals.net,
        0,
      ),
      projectedAnnualTaxableIncome: annualTaxableIncome,
      projectedTds,
      projectedTotalTax: tax.totalTax,
      projectedSalaryTax: salaryTax.totalTax,
      projectedTaxBalance: Math.max(0, salaryTax.totalTax - actualTds),
      projectedYearEndTaxPayable: Math.max(0, tax.totalTax - actualTds - projectedTds),
      estimatedBonusTax: Math.max(0, salaryTax.totalTax - taxWithoutPendingBonuses.totalTax),
      tax,
      salaryTax,
    },
  };
};

export const salaryRouter = createTRPCRouter({
  getPageData: protectedProcedure
    .input(financialYearInput)
    .query(({ ctx, input }) => getSalaryPageData(ctx.db, ctx.user.id, input.financialYearStart)),

  getLinkCandidates: protectedProcedure
    .input(z.object({ statementDate: z.date() }))
    .query(async ({ ctx, input }) => {
      const data = await getSalaryPageData(
        ctx.db,
        ctx.user.id,
        getFinancialYearStart(input.statementDate),
      );
      return data.rows
        .filter((row) => row.status !== 'actual')
        .sort(
          (left, right) =>
            Math.abs(left.paymentDate.getTime() - input.statementDate.getTime()) -
            Math.abs(right.paymentDate.getTime() - input.statementDate.getTime()),
        )
        .slice(0, 1);
    }),

  createComponent: protectedProcedure
    .input(createSalaryComponentSchema)
    .mutation(({ ctx, input }) =>
      ctx.db
        .insert(salaryComponents)
        .values({ userId: ctx.user.id, ...input })
        .returning(),
    ),

  deleteComponent: protectedProcedure
    .input(z.object({ id: z.uuidv4() }))
    .mutation(({ ctx, input }) =>
      ctx.db
        .delete(salaryComponents)
        .where(and(eq(salaryComponents.id, input.id), eq(salaryComponents.userId, ctx.user.id)))
        .returning({ id: salaryComponents.id }),
    ),

  createRevision: protectedProcedure
    .input(createSalaryRevisionSchema)
    .mutation(async ({ ctx, input }) => {
      await validateRevisionComponents(ctx.db, ctx.user.id, input.components);
      return ctx.db.transaction(async (tx) => {
        const [revision] = await tx
          .insert(salaryRevisions)
          .values({
            userId: ctx.user.id,
            name: input.name,
            effectiveFrom: input.effectiveFrom,
            payDay: input.payDay,
            payDateRule: input.payDateRule,
          })
          .returning();
        await tx.insert(salaryRevisionComponents).values(
          input.components.map((component) => ({
            revisionId: revision.id,
            componentId: component.componentId,
            amount: component.amount,
          })),
        );
        return revision;
      });
    }),

  updateRevision: protectedProcedure
    .input(updateSalaryRevisionSchema)
    .mutation(async ({ ctx, input }) => {
      await validateRevisionComponents(ctx.db, ctx.user.id, input.components);
      return ctx.db.transaction(async (tx) => {
        const linkedPayments = await tx
          .select({ id: salaryPayments.id })
          .from(salaryPayments)
          .where(
            and(eq(salaryPayments.revisionId, input.id), eq(salaryPayments.userId, ctx.user.id)),
          )
          .limit(1);
        if (linkedPayments.length > 0) {
          throw new Error(
            'A revision with linked salary payments cannot be edited. Create a new revision for future changes.',
          );
        }
        const revisionRows = await tx
          .update(salaryRevisions)
          .set({
            name: input.name,
            effectiveFrom: input.effectiveFrom,
            payDay: input.payDay,
            payDateRule: input.payDateRule,
          })
          .where(and(eq(salaryRevisions.id, input.id), eq(salaryRevisions.userId, ctx.user.id)))
          .returning();
        const revision = revisionRows.at(0);
        if (revision === undefined) {
          throw new Error('Salary revision not found');
        }
        await tx
          .delete(salaryRevisionComponents)
          .where(eq(salaryRevisionComponents.revisionId, input.id));
        await tx.insert(salaryRevisionComponents).values(
          input.components.map((component) => ({
            revisionId: input.id,
            componentId: component.componentId,
            amount: component.amount,
          })),
        );
        return revision;
      });
    }),

  deleteRevision: protectedProcedure
    .input(z.object({ id: z.uuidv4() }))
    .mutation(({ ctx, input }) =>
      ctx.db
        .delete(salaryRevisions)
        .where(and(eq(salaryRevisions.id, input.id), eq(salaryRevisions.userId, ctx.user.id)))
        .returning({ id: salaryRevisions.id }),
    ),

  createBonus: protectedProcedure
    .input(createSalaryBonusSchema)
    .mutation(async ({ ctx, input }) => {
      const componentRows = await ctx.db
        .select({ id: salaryComponents.id, frequency: salaryComponents.frequency })
        .from(salaryComponents)
        .where(
          and(eq(salaryComponents.id, input.componentId), eq(salaryComponents.userId, ctx.user.id)),
        )
        .limit(1);
      const component = componentRows.at(0);
      if (component?.frequency !== 'one_time') {
        throw new Error('Choose a one-time salary component for a bonus');
      }
      return ctx.db
        .insert(salaryBonuses)
        .values({ userId: ctx.user.id, ...input, notes: input.notes ?? null })
        .returning();
    }),

  deleteBonus: protectedProcedure.input(z.object({ id: z.uuidv4() })).mutation(({ ctx, input }) =>
    ctx.db
      .delete(salaryBonuses)
      .where(and(eq(salaryBonuses.id, input.id), eq(salaryBonuses.userId, ctx.user.id)))
      .returning({ id: salaryBonuses.id }),
  ),

  updateTaxSettings: protectedProcedure
    .input(updateSalaryTaxSettingsSchema)
    .mutation(({ ctx, input }) =>
      ctx.db
        .insert(salaryTaxSettings)
        .values({ userId: ctx.user.id, ...input, updatedAt: new Date() })
        .onConflictDoUpdate({
          target: [salaryTaxSettings.userId, salaryTaxSettings.financialYearStart],
          set: {
            standardDeduction: input.standardDeduction,
            otherTaxableIncome: input.otherTaxableIncome,
            otherDeductions: input.otherDeductions,
            updatedAt: new Date(),
          },
        })
        .returning(),
    ),

  linkStatement: protectedProcedure
    .input(
      z.object({
        statementId: z.uuidv4(),
        revisionId: z.uuidv4(),
        periodStart: z.date(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const statement = await getStatementAttributes(ctx.db, ctx.user.id, input.statementId);
      const attributes = statement.attributes as Record<string, unknown>;
      if (
        attributes['recurringPaymentId'] !== undefined ||
        attributes['emiId'] !== undefined ||
        attributes['salaryPaymentId'] !== undefined
      ) {
        throw new Error('This statement is already linked');
      }
      const data = await getSalaryPageData(
        ctx.db,
        ctx.user.id,
        getFinancialYearStart(input.periodStart),
      );
      const candidate = data.rows.find(
        (row) =>
          row.revisionId === input.revisionId &&
          monthKey(row.periodStart) === monthKey(input.periodStart) &&
          row.status !== 'actual',
      );
      if (candidate === undefined) {
        throw new Error('Salary period not found or already linked');
      }

      return ctx.db.transaction(async (tx) => {
        const [payment] = await tx
          .insert(salaryPayments)
          .values({
            userId: ctx.user.id,
            revisionId: input.revisionId,
            statementId: input.statementId,
            periodStart: candidate.periodStart,
            paymentDate: statement.createdAt,
            daysPaid: candidate.daysPaid,
            daysInPeriod: candidate.daysInPeriod,
          })
          .returning();
        await tx.insert(salaryPaymentComponents).values(
          candidate.components.map((component) => ({
            paymentId: payment.id,
            componentId: component.componentId,
            bonusId: 'bonusId' in component ? (component.bonusId ?? null) : null,
            name: component.name,
            kind: component.kind,
            classification: component.classification,
            affectsTaxableIncome: component.affectsTaxableIncome,
            amount: String(component.amount),
          })),
        );
        for (const component of candidate.components) {
          if ('bonusId' in component && component.bonusId !== null) {
            await tx
              .update(salaryBonuses)
              .set({ actualAmount: String(component.amount) })
              .where(
                and(eq(salaryBonuses.id, component.bonusId), eq(salaryBonuses.userId, ctx.user.id)),
              );
          }
        }
        await tx
          .update(statements)
          .set({
            additionalAttributes: { ...attributes, salaryPaymentId: payment.id },
            taxableAmount: null,
          })
          .where(and(eq(statements.id, input.statementId), eq(statements.userId, ctx.user.id)));
        return payment;
      });
    }),

  unlinkStatement: protectedProcedure
    .input(z.object({ statementId: z.uuidv4() }))
    .mutation(async ({ ctx, input }) => {
      const statement = await getStatementAttributes(ctx.db, ctx.user.id, input.statementId);
      const attributes = statement.attributes as Record<string, unknown>;
      const paymentId = attributes['salaryPaymentId'];
      if (typeof paymentId !== 'string') {
        throw new Error('Statement is not linked to a salary payment');
      }
      const { salaryPaymentId: _removed, ...remainingAttributes } = attributes;
      return ctx.db.transaction(async (tx) => {
        const linkedBonusLines = await tx
          .select({ bonusId: salaryPaymentComponents.bonusId })
          .from(salaryPaymentComponents)
          .innerJoin(salaryPayments, eq(salaryPaymentComponents.paymentId, salaryPayments.id))
          .where(and(eq(salaryPayments.id, paymentId), eq(salaryPayments.userId, ctx.user.id)));
        const bonusIds = linkedBonusLines.flatMap((line) =>
          line.bonusId === null ? [] : [line.bonusId],
        );
        if (bonusIds.length > 0) {
          await tx
            .update(salaryBonuses)
            .set({ actualAmount: null })
            .where(and(eq(salaryBonuses.userId, ctx.user.id), inArray(salaryBonuses.id, bonusIds)));
        }
        await tx
          .delete(salaryPayments)
          .where(and(eq(salaryPayments.id, paymentId), eq(salaryPayments.userId, ctx.user.id)));
        await tx
          .update(statements)
          .set({ additionalAttributes: remainingAttributes })
          .where(and(eq(statements.id, input.statementId), eq(statements.userId, ctx.user.id)));
        return { success: true };
      });
    }),

  updatePayment: protectedProcedure
    .input(updateSalaryPaymentSchema)
    .mutation(async ({ ctx, input }) => {
      const paymentRows = await ctx.db
        .select({ id: salaryPayments.id })
        .from(salaryPayments)
        .where(and(eq(salaryPayments.id, input.paymentId), eq(salaryPayments.userId, ctx.user.id)))
        .limit(1);
      const payment = paymentRows.at(0);
      if (payment === undefined) {
        throw new Error('Salary payment not found or access denied');
      }
      const componentIds = input.lines.flatMap((line) =>
        line.componentId === null ? [] : [line.componentId],
      );
      if (componentIds.length > 0) {
        const owned = await ctx.db
          .select({ id: salaryComponents.id })
          .from(salaryComponents)
          .where(
            and(
              eq(salaryComponents.userId, ctx.user.id),
              inArray(salaryComponents.id, componentIds),
            ),
          );
        if (owned.length !== new Set(componentIds).size) {
          throw new Error('One or more salary components are invalid');
        }
      }
      const bonusIds = input.lines.flatMap((line) => (line.bonusId === null ? [] : [line.bonusId]));
      if (bonusIds.length > 0) {
        const owned = await ctx.db
          .select({ id: salaryBonuses.id })
          .from(salaryBonuses)
          .where(and(eq(salaryBonuses.userId, ctx.user.id), inArray(salaryBonuses.id, bonusIds)));
        if (owned.length !== new Set(bonusIds).size) {
          throw new Error('One or more bonuses are invalid');
        }
      }

      return ctx.db.transaction(async (tx) => {
        const oldBonusRows = await tx
          .select({ bonusId: salaryPaymentComponents.bonusId })
          .from(salaryPaymentComponents)
          .where(eq(salaryPaymentComponents.paymentId, input.paymentId));
        const oldBonusIds = oldBonusRows.flatMap((line) =>
          line.bonusId === null ? [] : [line.bonusId],
        );
        if (oldBonusIds.length > 0) {
          await tx
            .update(salaryBonuses)
            .set({ actualAmount: null })
            .where(
              and(eq(salaryBonuses.userId, ctx.user.id), inArray(salaryBonuses.id, oldBonusIds)),
            );
        }
        await tx
          .update(salaryPayments)
          .set({
            paymentDate: input.paymentDate,
            daysPaid: input.daysPaid,
            daysInPeriod: input.daysInPeriod,
            notes: input.notes,
          })
          .where(eq(salaryPayments.id, input.paymentId));
        await tx
          .delete(salaryPaymentComponents)
          .where(eq(salaryPaymentComponents.paymentId, input.paymentId));
        await tx.insert(salaryPaymentComponents).values(
          input.lines.map((line) => ({
            paymentId: input.paymentId,
            ...line,
          })),
        );
        for (const line of input.lines) {
          if (line.bonusId !== null) {
            await tx
              .update(salaryBonuses)
              .set({ actualAmount: line.amount })
              .where(
                and(eq(salaryBonuses.id, line.bonusId), eq(salaryBonuses.userId, ctx.user.id)),
              );
          }
        }
        return { success: true };
      });
    }),
});

import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { z } from 'zod';

import {
  bankAccount,
  inboundEmails,
  smsNotifications,
  statementImports,
  statementSources,
} from '@/db/schema';
import { getTimezone } from '@/lib/date';
import { type Database } from '@/lib/db';
import { assertOwnsAccountsAndFriends } from '@/server/helpers/account';
import { getBalanceChecks } from '@/server/helpers/balance-checks';
import { applyImport, ISSUER_NAMES } from '@/server/statement-import/apply';
import {
  refreshAccountChecks,
  refreshChecksForImports,
  refreshStaleChecks,
} from '@/server/statement-import/check';
import { importEmailAttachment } from '@/server/statement-import/email';
import {
  ingestStatementFile,
  type IngestResult,
  StatementAccountRequiredError,
} from '@/server/statement-import/ingest';
import { PdfPasswordError } from '@/server/statement-import/pdf/extract';
import { UnsupportedStatementError } from '@/server/statement-import/pdf/parse';
import { getImportReview } from '@/server/statement-import/review';
import { SheetLayoutError } from '@/server/statement-import/sheet/parse';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

const KIB = 1024;
const MAX_FILE_MB = 15;
const MAX_FILE_BYTES = MAX_FILE_MB * KIB * KIB;
const MAX_FILE_NAME_LENGTH = 255;
const BASE64_CHARS_PER_CHUNK = 4;
const BASE64_BYTES_PER_CHUNK = 3;

const unlockSchema = z.object({
  password: z.string().optional(),
  accountId: z.uuid().optional(),
  rememberPassword: z.boolean().default(true),
});

const decisionSchema = z.object({
  id: z.string(),
  mode: z.enum(['new', 'fold']),
  statementKind: z.enum(['expense', 'outside_transaction', 'self_transfer']),
  category: z.string(),
  tags: z.array(z.string()),
  counterpartyAccountId: z.uuid().nullable(),
});

const outcomeOf = async (run: () => Promise<IngestResult>) => {
  try {
    return { status: 'imported' as const, ...(await run()) };
  } catch (error) {
    if (error instanceof PdfPasswordError) {
      return { status: 'password' as const, incorrect: !error.needsPassword };
    }
    if (error instanceof StatementAccountRequiredError) {
      return {
        status: 'account' as const,
        issuer: ISSUER_NAMES[error.issuer] ?? error.issuer,
        cardLast4: error.accountLast4,
      };
    }
    if (error instanceof UnsupportedStatementError || error instanceof SheetLayoutError) {
      return { status: 'unsupported' as const };
    }
    throw error;
  }
};

const withFreshCheck = async <T extends { status: string }>(
  db: Database,
  userId: string,
  outcome: T,
) => {
  if ('importId' in outcome && typeof outcome.importId === 'string') {
    await refreshChecksForImports(db, userId, [outcome.importId], await getTimezone());
  }
  return outcome;
};

const ownedImport = (id: string, userId: string) =>
  and(eq(statementImports.id, id), eq(statementImports.userId, userId));

export const statementImportsRouter = createTRPCRouter({
  getOverview: protectedProcedure.query(async ({ ctx }) => {
    const [smsRows, reviewRows, emailRows, balances] = await Promise.all([
      ctx.db
        .select({ value: count() })
        .from(smsNotifications)
        .where(
          and(eq(smsNotifications.userId, ctx.user.id), eq(smsNotifications.status, 'pending')),
        ),
      ctx.db
        .select({ value: count() })
        .from(statementImports)
        .where(
          and(eq(statementImports.userId, ctx.user.id), eq(statementImports.status, 'review')),
        ),
      ctx.db
        .select({ value: count() })
        .from(inboundEmails)
        .where(
          and(
            eq(inboundEmails.userId, ctx.user.id),
            eq(inboundEmails.status, 'received'),
            sql`${inboundEmails.attachments} @> '[{"mimeType":"application/pdf"}]'::jsonb`,
            sql`NOT EXISTS (SELECT 1 FROM statement_imports i WHERE i.inbound_email_id = ${inboundEmails.id})`,
          ),
        ),
      getBalanceChecks(ctx.db, ctx.user.id),
    ]);
    return {
      pendingSms: smsRows.at(0)?.value ?? 0,
      statementsToReview: reviewRows.at(0)?.value ?? 0,
      emailsNotImported: emailRows.at(0)?.value ?? 0,
      balanceMismatches: balances.filter((account) => account.status === 'mismatch').length,
      uncheckedAccounts: balances.filter((account) => account.status === 'unchecked').length,
    };
  }),
  list: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: statementImports.id,
        accountId: statementImports.accountId,
        accountName: bankAccount.accountName,
        issuer: statementImports.issuer,
        source: statementImports.source,
        fileName: statementImports.fileName,
        periodStart: statementImports.periodStart,
        periodEnd: statementImports.periodEnd,
        totalDue: statementImports.totalDue,
        kind: sql<
          'credit_card' | 'bank_account'
        >`COALESCE(${statementImports.summary}->>'kind', 'credit_card')`,
        status: statementImports.status,
        rowCount: sql<number>`jsonb_array_length(${statementImports.rows})`,
        outcome: statementImports.outcome,
        check: statementImports.check,
        createdAt: statementImports.createdAt,
        appliedAt: statementImports.appliedAt,
      })
      .from(statementImports)
      .innerJoin(bankAccount, eq(bankAccount.id, statementImports.accountId))
      .where(eq(statementImports.userId, ctx.user.id))
      .orderBy(desc(statementImports.periodEnd), desc(statementImports.createdAt)),
  ),
  upload: protectedProcedure
    .input(
      unlockSchema.extend({
        fileName: z.string().min(1).max(MAX_FILE_NAME_LENGTH),
        data: z
          .base64()
          .max(Math.ceil((MAX_FILE_BYTES * BASE64_CHARS_PER_CHUNK) / BASE64_BYTES_PER_CHUNK)),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      withFreshCheck(
        ctx.db,
        ctx.user.id,
        await outcomeOf(() =>
          ingestStatementFile(ctx.db, ctx.user.id, {
            data: new Uint8Array(Buffer.from(input.data, 'base64')),
            fileName: input.fileName,
            password: input.password,
            accountId: input.accountId,
            rememberPassword: input.rememberPassword,
            source: 'upload',
          }),
        ),
      ),
    ),
  importFromEmail: protectedProcedure
    .input(
      unlockSchema.extend({
        inboundEmailId: z.uuid(),
        attachment: z.number().int().min(0),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      withFreshCheck(
        ctx.db,
        ctx.user.id,
        await outcomeOf(() => importEmailAttachment(ctx.db, ctx.user.id, input)),
      ),
    ),
  getReview: protectedProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) =>
      getImportReview(ctx.db, ctx.user.id, input.id, await getTimezone()),
    ),
  applyChanges: protectedProcedure
    .input(
      z.object({
        id: z.uuid(),
        decisions: z.array(decisionSchema),
        finish: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const timeZone = await getTimezone();
      const result = await applyImport(
        ctx.db,
        ctx.user.id,
        input.id,
        input.decisions,
        timeZone,
        input.finish,
      );
      await refreshChecksForImports(ctx.db, ctx.user.id, [input.id], timeZone);
      return result;
    }),
  setStatus: protectedProcedure
    .input(z.object({ id: z.uuid(), status: z.enum(['review', 'discarded']) }))
    .mutation(async ({ ctx, input }) => {
      const updated = await ctx.db
        .update(statementImports)
        .set({ status: input.status })
        .where(
          and(
            ownedImport(input.id, ctx.user.id),
            inArray(statementImports.status, ['review', 'discarded']),
          ),
        )
        .returning({ id: statementImports.id });
      if (updated.length === 0) {
        throw new Error('Applied statements cannot be reopened');
      }
      await refreshChecksForImports(ctx.db, ctx.user.id, [input.id], await getTimezone());
    }),
  refreshChecks: protectedProcedure.mutation(async ({ ctx }) =>
    refreshStaleChecks(ctx.db, ctx.user.id, await getTimezone()),
  ),
  delete: protectedProcedure.input(z.object({ id: z.uuid() })).mutation(async ({ ctx, input }) => {
    const deleted = await ctx.db
      .delete(statementImports)
      .where(ownedImport(input.id, ctx.user.id))
      .returning({ accountId: statementImports.accountId });
    const accountId = deleted.at(0)?.accountId;
    if (accountId !== undefined) {
      await refreshAccountChecks(ctx.db, ctx.user.id, accountId, await getTimezone());
    }
  }),
  listSources: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        accountId: statementSources.accountId,
        accountName: bankAccount.accountName,
        issuer: statementSources.issuer,
        cardLast4: statementSources.cardLast4,
        hasPassword: sql<boolean>`${statementSources.password} IS NOT NULL`,
      })
      .from(statementSources)
      .innerJoin(bankAccount, eq(bankAccount.id, statementSources.accountId))
      .where(eq(statementSources.userId, ctx.user.id))
      .orderBy(bankAccount.accountName),
  ),
  forgetPassword: protectedProcedure
    .input(z.object({ accountId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnsAccountsAndFriends(ctx.db, ctx.user.id, { accountIds: [input.accountId] });
      await ctx.db
        .update(statementSources)
        .set({ password: null, updatedAt: new Date() })
        .where(
          and(
            eq(statementSources.accountId, input.accountId),
            eq(statementSources.userId, ctx.user.id),
          ),
        );
    }),
});

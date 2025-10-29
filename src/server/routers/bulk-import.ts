import { parse } from 'date-fns';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { bankAccount, friendsProfiles, statements } from '@/db/schema';
import { createTRPCRouter, protectedProcedure } from '@/server/trpc';

const csvRowSchema = z.object({
  amount: z.string(),
  category: z.string(),
  date: z.string(),
  statementKind: z.enum(['expense', 'outside_transaction', 'friend_transaction']),
  accountName: z.string().optional(),
  friendName: z.string().optional(),
  tag: z.string().optional(),
});

const bulkImportSchema = z.object({
  rows: z.array(csvRowSchema),
  dateFormat: z.string(),
});

type CsvRow = z.infer<typeof csvRowSchema>;
type RowValidation = {
  errors: string[];
  data?: { accounts: string[]; friends: string[]; categories: string[]; tags: string[] };
};

const validateCsvRow = (row: CsvRow, dateFormat: string): RowValidation => {
  const rowErrors: string[] = [];
  const data = {
    accounts: [] as string[],
    friends: [] as string[],
    categories: [] as string[],
    tags: [] as string[],
  };

  if (Number.isNaN(Number.parseFloat(row.amount))) {
    rowErrors.push('Invalid amount format');
  }

  try {
    const parsedDate = parse(row.date, dateFormat, new Date());
    if (Number.isNaN(parsedDate.getTime())) {
      rowErrors.push(`Invalid date format (expected: ${dateFormat})`);
    }
  } catch {
    rowErrors.push(`Cannot parse date with format ${dateFormat}`);
  }

  const hasAccount = row.accountName !== undefined && row.accountName.length > 0;
  const hasFriend = row.friendName !== undefined && row.friendName.length > 0;

  if (row.statementKind === 'expense') {
    if (!hasAccount && !hasFriend) {
      rowErrors.push('Expense requires either accountName or friendName');
    } else if (hasAccount && hasFriend) {
      rowErrors.push('Expense cannot have both accountName and friendName');
    }
  } else if (row.statementKind === 'friend_transaction') {
    if (!hasAccount || !hasFriend) {
      rowErrors.push('Friend transaction requires both accountName and friendName');
    }
  } else if (hasFriend || !hasAccount) {
    rowErrors.push('Outside transaction cannot have friendName and must have accountName');
  }

  if (rowErrors.length === 0) {
    if (hasAccount && row.accountName !== undefined) {
      data.accounts.push(row.accountName);
    }
    if (hasFriend && row.friendName !== undefined) {
      data.friends.push(row.friendName);
    }
    data.categories.push(row.category);
    if (row.tag !== undefined && row.tag.length > 0) {
      data.tags.push(row.tag);
    }
  }

  return { errors: rowErrors, data: rowErrors.length === 0 ? data : undefined };
};

type ImportRow = {
  row: CsvRow;
  rowNumber: number;
  accountId: string | null;
  friendId: string | null;
};

const processImportRow = (
  { row, accountId, friendId }: ImportRow,
  userId: string,
  dateFormat: string,
): { errors: string[]; statement?: typeof statements.$inferInsert } => {
  const rowErrors: string[] = [];
  let parsedDate: Date;

  try {
    parsedDate = parse(row.date, dateFormat, new Date());
    if (Number.isNaN(parsedDate.getTime())) {
      rowErrors.push(`Invalid date: ${row.date}`);
      return { errors: rowErrors };
    }
  } catch {
    rowErrors.push(`Cannot parse date: ${row.date}`);
    return { errors: rowErrors };
  }

  const { amount } = row;
  if (Number.isNaN(Number.parseFloat(amount))) {
    rowErrors.push(`Invalid amount: ${amount}`);
  }

  const hasAccount = accountId !== null && accountId.length > 0;
  const hasFriend = friendId !== null && friendId.length > 0;

  if (row.statementKind === 'expense') {
    if (!hasAccount && !hasFriend) {
      rowErrors.push('Expense requires either account or friend');
    } else if (hasAccount && hasFriend) {
      rowErrors.push('Expense cannot have both account and friend');
    }
  } else if (row.statementKind === 'friend_transaction') {
    if (!hasAccount || !hasFriend) {
      rowErrors.push('Friend transaction requires both account and friend');
    }
  } else if (hasFriend || !hasAccount) {
    rowErrors.push('Outside transaction cannot have friendName and must have accountName');
  }

  if (rowErrors.length > 0) {
    return { errors: rowErrors };
  }

  return {
    errors: [],
    statement: {
      userId,
      accountId,
      friendId,
      amount,
      category: row.category,
      tags: row.tag !== undefined && row.tag.length > 0 ? [row.tag] : [],
      statementKind: row.statementKind,
      createdAt: parsedDate,
    },
  };
};

export const bulkImportRouter = createTRPCRouter({
  validateCsv: protectedProcedure.input(bulkImportSchema).mutation(({ input }) => {
    const errors: Array<{ row: number; errors: string[] }> = [];
    const accountsSet = new Set<string>();
    const friendsSet = new Set<string>();
    const categoriesSet = new Set<string>();
    const tagsSet = new Set<string>();

    for (let i = 0; i < input.rows.length; i++) {
      const validation = validateCsvRow(input.rows[i], input.dateFormat);

      if (validation.errors.length > 0) {
        errors.push({ row: i + 1, errors: validation.errors });
      } else if (validation.data !== undefined) {
        validation.data.accounts.forEach((acc) => accountsSet.add(acc));
        validation.data.friends.forEach((friend) => friendsSet.add(friend));
        validation.data.categories.forEach((cat) => categoriesSet.add(cat));
        validation.data.tags.forEach((tag) => tagsSet.add(tag));
      }
    }

    return {
      valid: input.rows.length - errors.length,
      invalid: errors,
      summary: {
        accounts: Array.from(accountsSet),
        friends: Array.from(friendsSet),
        categories: Array.from(categoriesSet),
        tags: Array.from(tagsSet),
      },
    };
  }),

  importStatements: protectedProcedure.input(bulkImportSchema).mutation(async ({ ctx, input }) => {
    const userId = ctx.session.user.id;

    const userAccounts = await ctx.db
      .select()
      .from(bankAccount)
      .where(eq(bankAccount.userId, userId));

    const userFriends = await ctx.db
      .select()
      .from(friendsProfiles)
      .where(eq(friendsProfiles.userId, userId));

    const accountMap = new Map<string, string>(
      userAccounts.map((acc) => [acc.accountName.toLowerCase(), acc.id]),
    );
    const friendMap = new Map<string, string>(
      userFriends.map((friend) => [friend.name.toLowerCase(), friend.id]),
    );

    const statementsToInsert: Array<typeof statements.$inferInsert> = [];
    const errors: Array<{ row: number; errors: string[] }> = [];

    for (let i = 0; i < input.rows.length; i++) {
      const row = input.rows[i];

      const accountId =
        row.accountName !== undefined && row.accountName.length > 0
          ? (accountMap.get(row.accountName.toLowerCase()) ?? null)
          : null;

      const friendId =
        row.friendName !== undefined && row.friendName.length > 0
          ? (friendMap.get(row.friendName.toLowerCase()) ?? null)
          : null;

      if (row.accountName !== undefined && row.accountName.length > 0 && accountId === null) {
        errors.push({ row: i + 1, errors: [`Account not found: ${row.accountName}`] });
        continue;
      }

      if (row.friendName !== undefined && row.friendName.length > 0 && friendId === null) {
        errors.push({ row: i + 1, errors: [`Friend not found: ${row.friendName}`] });
        continue;
      }

      const result = processImportRow(
        { row, rowNumber: i + 1, accountId, friendId },
        userId,
        input.dateFormat,
      );

      if (result.errors.length > 0) {
        errors.push({ row: i + 1, errors: result.errors });
      } else if (result.statement !== undefined) {
        statementsToInsert.push(result.statement);
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Import failed with ${errors.length} errors. First error (row ${errors[0].row}): ${errors[0].errors.join(', ')}`,
      );
    }

    const result = await ctx.db.insert(statements).values(statementsToInsert).returning();

    return {
      imported: result.length,
      failed: errors.length,
    };
  }),
});

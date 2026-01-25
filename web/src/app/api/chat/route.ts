import { headers } from 'next/headers';

import { streamText, convertToModelMessages, type UIMessage, tool, stepCountIs } from 'ai';
import { z } from 'zod';

import { statementKindEnum } from '@/db/schema';
import { db } from '@/lib/db';
import { createCaller } from '@/server/routers';

export const maxDuration = 30;

const tools = (caller: ReturnType<typeof createCaller>) => {
  return {
    'get-accounts-summary': tool({
      description: 'Get a summary of all accounts including balances, expenses, and transfers',
      inputSchema: z.object({
        start: z.string().optional().describe('Start date filter (ISO 8601 format)'),
        end: z.string().optional().describe('End date filter (ISO 8601 format)'),
      }),
      execute: async (input) => {
        const start =
          input.start !== undefined && input.start.length > 0 ? new Date(input.start) : undefined;
        const end =
          input.end !== undefined && input.end.length > 0 ? new Date(input.end) : undefined;
        const result = await caller.summary.getSummary({ start, end });
        return { accounts: result.accountsSummaryData, friends: result.friendsSummaryData };
      },
    }),
    'get-accounts': tool({
      description: 'Get list of all bank accounts with their names and starting balances',
      inputSchema: z.object({}),
      execute: async () => {
        const accounts = await caller.accounts.getAccounts();
        return { accounts };
      },
    }),
    'get-friends': tool({
      description: 'Get list of all friends profiles used for expense sharing and tracking',
      inputSchema: z.object({}),
      execute: async () => {
        const friends = await caller.friends.getFriends();
        return { friends };
      },
    }),
    'get-statements': tool({
      description:
        'Get list of statements (transactions) with filtering options for accounts, categories, tags, and date range',
      inputSchema: z.object({
        page: z.number().optional().describe('Page number for pagination (default: 1)'),
        perPage: z
          .number()
          .optional()
          .describe('Number of results per page (default: 10, max: 100)'),
        start: z.string().optional().describe('Start date filter (ISO 8601 format)'),
        end: z.string().optional().describe('End date filter (ISO 8601 format)'),
        account: z.array(z.string()).optional().describe('Filter by account IDs'),
        category: z.array(z.string()).optional().describe('Filter by categories'),
        tags: z.array(z.string()).optional().describe('Filter by tags'),
        statementKind: z
          .array(z.enum(statementKindEnum.enumValues))
          .optional()
          .describe(
            'Filter by statement type: expense, outside_transaction, friend_transaction, self_transfer',
          ),
      }),
      execute: async (input) => {
        const start =
          input.start !== undefined && input.start.length > 0 ? new Date(input.start) : undefined;
        const end =
          input.end !== undefined && input.end.length > 0 ? new Date(input.end) : undefined;
        const result = await caller.statements.getStatements({
          page: input.page,
          perPage: input.perPage,
          start,
          end,
          account: input.account ?? [],
          category: input.category ?? [],
          tags: input.tags ?? [],
          statementKind: input.statementKind ?? [],
        });
        return {
          statements: result.statements,
          pageCount: result.pageCount,
          rowsCount: result.rowsCount,
        };
      },
    }),
    'get-categories': tool({
      description: 'Get list of all unique categories used in statements',
      inputSchema: z.object({}),
      execute: async () => {
        const categories = await caller.statements.getCategories({});
        return { categories };
      },
    }),
    'get-tags': tool({
      description: 'Get list of all unique tags used in statements',
      inputSchema: z.object({}),
      execute: async () => {
        const tags = await caller.statements.getTags({});
        return { tags };
      },
    }),
    'get-emis': tool({
      description:
        'Get list of EMIs (Equated Monthly Installments) with their details, balances, and payment status',
      inputSchema: z.object({
        page: z.number().optional().describe('Page number for pagination (default: 1)'),
        perPage: z
          .number()
          .optional()
          .describe('Number of results per page (default: 10, max: 100)'),
        creditId: z.array(z.string()).optional().describe('Filter by credit card IDs'),
        accountId: z.array(z.string()).optional().describe('Filter by account IDs'),
        completed: z
          .boolean()
          .optional()
          .describe('Filter by completion status (true for completed, false for pending)'),
      }),
      execute: async (input) => {
        const result = await caller.emis.getEmis({
          page: input.page,
          perPage: input.perPage,
          creditId: input.creditId ?? [],
          accountId: input.accountId ?? [],
          completed: input.completed,
        });
        return {
          emis: result.emis,
          pageCount: result.pageCount,
          rowsCount: result.rowsCount,
        };
      },
    }),
    'get-credit-cards': tool({
      description: 'Get list of credit cards with their limits and associated accounts',
      inputSchema: z.object({}),
      execute: async () => {
        const creditCards = await caller.accounts.getCreditCards();
        return { creditCards };
      },
    }),
    'get-credit-cards-outstanding': tool({
      description:
        'Get credit cards with outstanding balances, current month payments, and future EMI payment schedules',
      inputSchema: z.object({
        uptoDate: z.string().optional().describe('Calculate balances up to this date (ISO 8601)'),
      }),
      execute: async (input) => {
        const result = await caller.emis.getCreditCardsWithOutstandingBalance({
          uptoDate:
            input.uptoDate !== undefined && input.uptoDate.length > 0
              ? new Date(input.uptoDate)
              : undefined,
        });
        return {
          cards: result.cards,
          cardDetails: result.cardDetails,
          currentMonthPayments: result.currentMonthPayments,
          paymentsByMonth: result.paymentsByMonth,
        };
      },
    }),
    'add-statement': tool({
      description:
        'Add a new expense or transaction statement. Use this to record expenses, income from friends, or transactions.',
      inputSchema: z.object({
        amount: z
          .string()
          .min(1, 'Amount is required')
          .describe(
            'The amount for the statement as a numeric string (positive for expenses, negative for income). Example: "100.50" or "-50"',
          ),
        category: z.string().describe('Category of the expense (e.g., Food, Transport, Shopping)'),
        tags: z.array(z.string()).optional().describe('Optional tags for the statement'),
        accountId: z
          .string()
          .optional()
          .describe(
            'Account ID to associate with the statement. Required for expense and outside_transaction types. Optional for friend_transaction.',
          ),
        friendId: z
          .string()
          .optional()
          .describe(
            'Friend ID to associate with the statement. Required for friend_transaction type. Must be null for expense and outside_transaction types.',
          ),
        statementKind: z
          .enum(statementKindEnum.enumValues)
          .describe(
            'Type of statement: expense (regular expense from account), outside_transaction (external income to account), friend_transaction (transaction involving a friend)',
          ),
        createdAt: z
          .string()
          .optional()
          .describe('Date of the transaction (ISO 8601 format, defaults to current date)'),
      }),
      execute: async (input) => {
        const result = await caller.statements.addStatement({
          amount: input.amount,
          category: input.category,
          tags: input.tags ?? [],
          accountId: input.accountId,
          friendId: input.friendId,
          statementKind: input.statementKind,
          createdAt:
            input.createdAt !== undefined && input.createdAt.length > 0
              ? new Date(input.createdAt)
              : new Date(),
        });
        if (result.length === 0) {
          return {
            success: false,
            message: 'Failed to add statement',
          };
        }
        return {
          success: true,
          statementId: result[0].id,
          message: 'Statement added successfully',
        };
      },
    }),
  };
};

export const POST = async (req: Request) => {
  const heads = await headers();
  const caller = createCaller({
    headers: heads,
    db: db,
  });

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const {
    messages,
  }: {
    messages: UIMessage[];
  } = await req.json();
  const modelMessages = await convertToModelMessages(messages);
  const result = streamText({
    model: 'google/gemini-3-flash',
    messages: modelMessages,
    tools: tools(caller),
    stopWhen: stepCountIs(20),
    system: `You are an accounting expert. You are helpful and honest. You will answer questions about accounting and finance. You will also provide financial advice and guidance. Your answers should be helpful, honest, and informative. You should not provide any financial advice that is not related to the question. If you are unsure of the answer, you should say "I'm not sure" and not "I don't know". You can only answer questions related to accounting and finance. If you are asked about a topic that is not related to accounting or finance, you should say "I'm not sure" and not "I don't know". You should not answer questions that are not related to accounting or finance.`,
  });
  return result.toUIMessageStreamResponse({
    sendSources: true,
    sendReasoning: true,
  });
};

/* eslint-disable no-magic-numbers */
import { createHmac } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { getTableColumns, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import type { PgTable } from 'drizzle-orm/pg-core';

import { session, user } from '../src/db/auth-schema';
import {
  accountBalanceChecks,
  bankAccount,
  budgetIncomeLines,
  budgetLines,
  budgetYears,
  creditCardAccounts,
  emis,
  friendsProfiles,
  investments,
  recurringPayments,
  reportBoundaries,
  selfTransferStatements,
  smsNotifications,
  splits,
  statements,
} from '../src/db/schema';

const CONFIG = {
  users: Number(process.env.LOAD_TEST_USERS ?? '200'),
  years: Number(process.env.LOAD_TEST_YEARS ?? '5'),
  out: process.env.LOAD_TEST_OUT ?? 'load-test-users.json',
  databaseUrl: process.env.DATABASE_URL ?? '',
  secret: process.env.BETTER_AUTH_SECRET ?? '',
};

const LIMITS = {
  postgresParameters: 60_000,
  sessionDays: 30,
  smsHistoryDays: 365,
  reportBoundaryMonths: 24,
  budgetLeadMonths: 6,
  budgetSpanMonths: 12,
  pendingSms: 8,
  daysPerYear: 365,
  monthsPerYear: 12,
  dayMs: 86_400_000,
  hourMs: 3_600_000,
  hoursPerDay: 24,
  paise: 100,
  balanceCheckEveryMonths: 3,
};

const SPENDING = {
  dailyExpenses: 2.4,
  paidByFriendShare: 0.03,
  splitShare: 0.15,
  splitMinimum: 400,
  tagShare: 0.1,
  smsShare: 0.6,
  bigPurchaseShare: 0.02,
  bigPurchaseMin: 5_000,
  bigPurchaseMax: 50_000,
};

const MONTHLY = {
  salaryDay: 1,
  rentDay: 3,
  billsDay: 10,
  billPaymentDay: 18,
  savingsTransferDay: 5,
  salaryMin: 80_000,
  salaryMax: 200_000,
  rentMin: 15_000,
  rentMax: 35_000,
  friendSettlements: 2,
  refunds: 1,
  savingsTransferMin: 10_000,
  savingsTransferMax: 30_000,
};

const EMI = {
  perUser: 2,
  principalMin: 20_000,
  principalMax: 90_000,
  tenures: [6, 9, 12],
  annualRate: 15,
  processingFees: 199,
  gstRate: 18,
};

const CATEGORIES: Array<{ name: string; weight: number; min: number; max: number }> = [
  { name: 'Food', weight: 30, min: 80, max: 900 },
  { name: 'Groceries', weight: 15, min: 150, max: 3_000 },
  { name: 'Transport', weight: 15, min: 40, max: 800 },
  { name: 'Shopping', weight: 12, min: 300, max: 6_000 },
  { name: 'Entertainment', weight: 8, min: 150, max: 2_000 },
  { name: 'Health', weight: 5, min: 100, max: 4_000 },
  { name: 'Travel', weight: 5, min: 500, max: 12_000 },
  { name: 'Others', weight: 10, min: 50, max: 2_500 },
];

const TAGS = ['Trip', 'Gift', 'Office', 'Party'];

const RECURRING = [
  { name: 'Phone', category: 'Bills', min: 299, max: 799 },
  { name: 'Internet', category: 'Bills', min: 599, max: 1_499 },
  { name: 'Gym', category: 'Health', min: 999, max: 2_499 },
];

const ACCOUNTS = [
  { name: 'Savings', kind: 'savings', bank: 'HDFC', balance: [50_000, 250_000] },
  { name: 'Salary', kind: 'savings', bank: 'ICICI', balance: [20_000, 150_000] },
  { name: 'Cash', kind: 'cash', bank: 'Cash', balance: [1_000, 5_000] },
  { name: 'Wallet', kind: 'wallet', bank: 'Paytm', balance: [0, 2_000] },
  { name: 'HDFC Card', kind: 'card', bank: 'HDFC', balance: [0, 0] },
  { name: 'SBI Card', kind: 'card', bank: 'SBI', balance: [0, 0] },
  { name: 'Axis Card', kind: 'card', bank: 'Axis', balance: [0, 0] },
] as const;

const CARD_LIMIT = { min: 100_000, max: 400_000, billingDayMax: 28 };
const FRIENDS = ['Aarav', 'Diya', 'Kabir', 'Meera', 'Rohan', 'Tara'];
const INVESTMENT_KINDS = [
  { kind: 'fd', count: 4, min: 50_000, max: 250_000, rate: [6.5, 7.75] },
  { kind: 'epfo', count: 2, min: 20_000, max: 120_000, rate: [8.1, 8.25] },
  { kind: 'other', count: 2, min: 10_000, max: 60_000, rate: [5, 9] },
] as const;

type Rng = () => number;

const rngFor = (seed: number): Rng => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
};

const between = (rng: Rng, min: number, max: number): number => min + rng() * (max - min);
const money = (value: number): string =>
  (Math.round(value * LIMITS.paise) / LIMITS.paise).toFixed(2);
const pick = <T>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length)];

const poisson = (rng: Rng, mean: number): number => {
  const limit = Math.exp(-mean);
  let count = 0;
  let product = rng();
  while (product > limit) {
    count += 1;
    product *= rng();
  }
  return count;
};

const weighted = <T extends { weight: number }>(rng: Rng, items: readonly T[]): T => {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let roll = rng() * total;
  for (const item of items) {
    roll -= item.weight;
    if (roll <= 0) {
      return item;
    }
  }
  return items[items.length - 1];
};

const startOfUtcDay = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const addMonths = (date: Date, months: number): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, date.getUTCDate()));

const atDay = (monthStart: Date, day: number, rng: Rng): Date =>
  new Date(
    Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth(), day) +
      Math.floor(rng() * LIMITS.hoursPerDay) * LIMITS.hourMs,
  );

const userKey = (index: number): string => String(index).padStart(6, '0');

const signedCookie = (token: string): string =>
  encodeURIComponent(
    `${token}.${createHmac('sha256', CONFIG.secret).update(token).digest('base64')}`,
  );

const insertBatched = async <T extends PgTable>(
  db: ReturnType<typeof drizzle>,
  table: T,
  rows: Array<T['$inferInsert']>,
): Promise<void> => {
  const columns = Object.keys(getTableColumns(table)).length;
  const chunk = Math.max(1, Math.floor(LIMITS.postgresParameters / columns));
  for (let offset = 0; offset < rows.length; offset += chunk) {
    await db.insert(table).values(rows.slice(offset, offset + chunk));
  }
};

type Plan = {
  users: Array<typeof user.$inferInsert>;
  sessions: Array<typeof session.$inferInsert>;
  accounts: Array<typeof bankAccount.$inferInsert>;
  cards: Array<typeof creditCardAccounts.$inferInsert>;
  friends: Array<typeof friendsProfiles.$inferInsert>;
  statements: Array<typeof statements.$inferInsert>;
  splits: Array<typeof splits.$inferInsert>;
  transfers: Array<typeof selfTransferStatements.$inferInsert>;
  emis: Array<typeof emis.$inferInsert>;
  recurring: Array<typeof recurringPayments.$inferInsert>;
  investments: Array<typeof investments.$inferInsert>;
  sms: Array<typeof smsNotifications.$inferInsert>;
  boundaries: Array<typeof reportBoundaries.$inferInsert>;
  budgetYears: Array<typeof budgetYears.$inferInsert>;
  budgetLines: Array<typeof budgetLines.$inferInsert>;
  budgetIncomeLines: Array<typeof budgetIncomeLines.$inferInsert>;
  balanceChecks: Array<typeof accountBalanceChecks.$inferInsert>;
};

const emptyPlan = (): Plan => ({
  users: [],
  sessions: [],
  accounts: [],
  cards: [],
  friends: [],
  statements: [],
  splits: [],
  transfers: [],
  emis: [],
  recurring: [],
  investments: [],
  sms: [],
  boundaries: [],
  budgetYears: [],
  budgetLines: [],
  budgetIncomeLines: [],
  balanceChecks: [],
});

const planUser = (index: number, now: Date, plan: Plan): { email: string; cookie: string } => {
  const rng = rngFor(index);
  const key = userKey(index);
  const userId = `loadtest-${key}`;
  const email = `${userId}@loadtest.invalid`;
  const historyStart = startOfUtcDay(
    new Date(now.getTime() - CONFIG.years * LIMITS.daysPerYear * LIMITS.dayMs),
  );
  const token = `loadtest-token-${key}`;

  plan.users.push({
    id: userId,
    name: `Load Test ${index}`,
    email,
    emailVerified: true,
    role: 'user',
    createdAt: historyStart,
    updatedAt: now,
  });
  plan.sessions.push({
    id: `loadtest-session-${key}`,
    token,
    userId,
    expiresAt: new Date(now.getTime() + LIMITS.sessionDays * LIMITS.dayMs),
    createdAt: now,
    updatedAt: now,
    ipAddress: '127.0.0.1',
    userAgent: 'k6',
  });

  const accounts = ACCOUNTS.map((account) => ({
    ...account,
    id: crypto.randomUUID(),
    last4: String(Math.floor(between(rng, 1_000, 9_999))),
  }));
  for (const account of accounts) {
    plan.accounts.push({
      id: account.id,
      userId,
      accountName: account.name,
      startingBalance: money(between(rng, account.balance[0], account.balance[1])),
      createdAt: historyStart,
    });
  }
  const cards = accounts
    .filter((account) => account.kind === 'card')
    .map((account) => ({ ...account, cardId: crypto.randomUUID() }));
  for (const card of cards) {
    plan.cards.push({
      id: card.cardId,
      accountId: card.id,
      cardLimit: money(between(rng, CARD_LIMIT.min, CARD_LIMIT.max)),
      billingDate: 1 + Math.floor(rng() * CARD_LIMIT.billingDayMax),
    });
  }
  const savings = accounts[0];
  const salaryAccount = accounts[1];
  const spendingAccounts = accounts.filter(
    (account) => account.kind !== 'savings' || account === savings,
  );

  const friendIds = FRIENDS.map((name) => {
    const id = crypto.randomUUID();
    plan.friends.push({ id, userId, name, createdAt: historyStart });
    return id;
  });

  const recurring = RECURRING.map((item) => {
    const id = crypto.randomUUID();
    plan.recurring.push({
      id,
      userId,
      name: item.name,
      amount: money(between(rng, item.min, item.max)),
      frequency: 'monthly',
      startDate: historyStart,
      category: item.category,
      createdAt: historyStart,
    });
    return { ...item, id };
  });
  const rentId = crypto.randomUUID();
  const rent = money(between(rng, MONTHLY.rentMin, MONTHLY.rentMax));
  plan.recurring.push({
    id: rentId,
    userId,
    name: 'Rent',
    amount: rent,
    frequency: 'monthly',
    startDate: historyStart,
    category: 'Rent',
    createdAt: historyStart,
  });

  const statementRow = (
    row: Omit<typeof statements.$inferInsert, 'id' | 'userId'>,
  ): typeof statements.$inferInsert & { id: string } => {
    const full = { ...row, id: crypto.randomUUID(), userId };
    plan.statements.push(full);
    return full;
  };

  const smsSince = now.getTime() - LIMITS.smsHistoryDays * LIMITS.dayMs;
  const cardSpend = new Map<string, number>();
  for (let day = historyStart.getTime(); day <= now.getTime(); day += LIMITS.dayMs) {
    const count = poisson(rng, SPENDING.dailyExpenses);
    for (let n = 0; n < count; n++) {
      const category = weighted(rng, CATEGORIES);
      const big = rng() < SPENDING.bigPurchaseShare;
      const amount = big
        ? between(rng, SPENDING.bigPurchaseMin, SPENDING.bigPurchaseMax)
        : between(rng, category.min, category.max);
      const createdAt = new Date(day + Math.floor(rng() * LIMITS.hoursPerDay) * LIMITS.hourMs);
      const paidByFriend = rng() < SPENDING.paidByFriendShare;
      const account = pick(rng, spendingAccounts);
      const statement = statementRow({
        accountId: paidByFriend ? null : account.id,
        friendId: paidByFriend ? pick(rng, friendIds) : null,
        amount: money(amount),
        category: category.name,
        tags: rng() < SPENDING.tagShare ? [pick(rng, TAGS)] : [],
        statementKind: 'expense',
        createdAt,
      });
      if (!paidByFriend && account.kind === 'card') {
        const monthKey = `${account.id}:${createdAt.getUTCFullYear()}-${createdAt.getUTCMonth()}`;
        cardSpend.set(monthKey, (cardSpend.get(monthKey) ?? 0) + amount);
      }
      if (!paidByFriend && amount >= SPENDING.splitMinimum && rng() < SPENDING.splitShare) {
        const sharers = 1 + Math.floor(rng() * 2);
        const share = amount / (sharers + 1);
        for (let s = 0; s < sharers; s++) {
          plan.splits.push({
            id: crypto.randomUUID(),
            userId,
            statementId: statement.id,
            amount: money(share),
            friendId: friendIds[(s + n) % friendIds.length],
            createdAt,
          });
        }
      }
      if (!paidByFriend && createdAt.getTime() >= smsSince && rng() < SPENDING.smsShare) {
        plan.sms.push({
          id: crypto.randomUUID(),
          userId,
          amount: money(amount),
          type: 'expense',
          merchant: `${category.name} store`,
          accountLast4: account.last4,
          smsBody: `Rs.${money(amount)} spent on your ${account.bank} account XX${account.last4} at ${category.name} store.`,
          sender: `AD-${account.bank.toUpperCase()}BK`,
          createdAt,
          bankName: account.bank,
          isFromCard: account.kind === 'card',
          status: 'inserted',
          additionalAttributes: { statementId: statement.id },
        });
      }
    }
  }

  for (
    let month = new Date(Date.UTC(historyStart.getUTCFullYear(), historyStart.getUTCMonth(), 1));
    month <= now;
    month = addMonths(month, 1)
  ) {
    const salaryAt = atDay(month, MONTHLY.salaryDay, rng);
    if (salaryAt >= historyStart && salaryAt <= now) {
      statementRow({
        accountId: salaryAccount.id,
        amount: money(between(rng, MONTHLY.salaryMin, MONTHLY.salaryMax)),
        category: 'Salary',
        statementKind: 'outside_transaction',
        createdAt: salaryAt,
      });
    }
    const rentAt = atDay(month, MONTHLY.rentDay, rng);
    if (rentAt >= historyStart && rentAt <= now) {
      statementRow({
        accountId: savings.id,
        amount: rent,
        category: 'Rent',
        statementKind: 'expense',
        createdAt: rentAt,
        additionalAttributes: { recurringPaymentId: rentId },
      });
    }
    for (const bill of recurring) {
      const billAt = atDay(month, MONTHLY.billsDay, rng);
      if (billAt >= historyStart && billAt <= now) {
        statementRow({
          accountId: savings.id,
          amount: money(between(rng, bill.min, bill.max)),
          category: bill.category,
          statementKind: 'expense',
          createdAt: billAt,
          additionalAttributes: { recurringPaymentId: bill.id },
        });
      }
    }
    for (let s = 0; s < MONTHLY.friendSettlements; s++) {
      const at = atDay(month, 1 + Math.floor(rng() * CARD_LIMIT.billingDayMax), rng);
      if (at >= historyStart && at <= now) {
        statementRow({
          accountId: savings.id,
          friendId: pick(rng, friendIds),
          amount: money(between(rng, 200, 4_000)),
          category: 'Friends',
          statementKind: 'friend_transaction',
          createdAt: at,
        });
      }
    }
    for (let r = 0; r < MONTHLY.refunds; r++) {
      const at = atDay(month, 1 + Math.floor(rng() * CARD_LIMIT.billingDayMax), rng);
      if (at >= historyStart && at <= now) {
        statementRow({
          accountId: savings.id,
          amount: money(between(rng, 50, 3_000)),
          category: 'Refund',
          statementKind: 'outside_transaction',
          createdAt: at,
        });
      }
    }
    const transferAt = atDay(month, MONTHLY.savingsTransferDay, rng);
    if (transferAt >= historyStart && transferAt <= now) {
      plan.transfers.push({
        id: crypto.randomUUID(),
        userId,
        fromAccountId: salaryAccount.id,
        toAccountId: savings.id,
        amount: money(between(rng, MONTHLY.savingsTransferMin, MONTHLY.savingsTransferMax)),
        createdAt: transferAt,
      });
    }
    const previous = addMonths(month, -1);
    for (const card of cards) {
      const spent =
        cardSpend.get(`${card.id}:${previous.getUTCFullYear()}-${previous.getUTCMonth()}`) ?? 0;
      const payAt = atDay(month, MONTHLY.billPaymentDay, rng);
      if (spent > 0 && payAt >= historyStart && payAt <= now) {
        plan.transfers.push({
          id: crypto.randomUUID(),
          userId,
          fromAccountId: savings.id,
          toAccountId: card.id,
          amount: money(spent),
          createdAt: payAt,
        });
      }
    }
  }

  for (let e = 0; e < EMI.perUser; e++) {
    const card = cards[e % cards.length];
    const id = crypto.randomUUID();
    const tenure = pick(rng, EMI.tenures);
    const principal = between(rng, EMI.principalMin, EMI.principalMax);
    const startMonth = addMonths(now, -Math.floor(rng() * (tenure + LIMITS.monthsPerYear)));
    const firstInstallment = atDay(
      startMonth,
      (card.id.length % CARD_LIMIT.billingDayMax) + 1,
      rng,
    );
    plan.emis.push({
      id,
      userId,
      name: `${pick(rng, ['Phone', 'Laptop', 'Washing Machine', 'Holiday'])} EMI`,
      creditId: card.cardId,
      principal: money(principal),
      tenure: String(tenure),
      annualInterestRate: String(EMI.annualRate),
      processingFees: String(EMI.processingFees),
      processingFeesGst: String(EMI.gstRate),
      gst: String(EMI.gstRate),
      createdAt: firstInstallment,
      firstInstallmentDate: firstInstallment,
      processingFeesDate: firstInstallment,
      tags: ['EMI'],
    });
    for (let i = 0; i < tenure; i++) {
      const at = addMonths(firstInstallment, i);
      if (at > now) {
        break;
      }
      statementRow({
        accountId: card.id,
        amount: money(principal / tenure),
        category: 'EMI',
        statementKind: 'expense',
        createdAt: at,
        tags: ['EMI'],
        additionalAttributes: { emiId: id, installmentNo: i + 1 },
      });
    }
  }

  for (const group of INVESTMENT_KINDS) {
    for (let i = 0; i < group.count; i++) {
      const investedAt = new Date(
        historyStart.getTime() + rng() * (now.getTime() - historyStart.getTime()),
      );
      const amount = between(rng, group.min, group.max);
      const rate = between(rng, group.rate[0], group.rate[1]);
      plan.investments.push({
        id: crypto.randomUUID(),
        userId,
        investmentKind: group.kind,
        investmentDate: investedAt,
        investmentAmount: money(amount),
        annualRate: rate.toFixed(2),
        maturityDate: addMonths(investedAt, LIMITS.monthsPerYear * CONFIG.years),
      });
    }
  }

  for (let p = 0; p < LIMITS.pendingSms; p++) {
    const account = pick(rng, spendingAccounts);
    const amount = between(rng, 100, 2_000);
    plan.sms.push({
      id: crypto.randomUUID(),
      userId,
      amount: money(amount),
      type: 'expense',
      merchant: 'Pending store',
      accountLast4: account.last4,
      smsBody: `Rs.${money(amount)} spent on your ${account.bank} account XX${account.last4}.`,
      sender: `AD-${account.bank.toUpperCase()}BK`,
      createdAt: new Date(now.getTime() - rng() * LIMITS.dayMs * LIMITS.pendingSms),
      bankName: account.bank,
      isFromCard: account.kind === 'card',
      status: 'pending',
    });
  }

  for (let m = LIMITS.reportBoundaryMonths; m >= 0; m--) {
    plan.boundaries.push({
      id: crypto.randomUUID(),
      userId,
      boundaryDate: addMonths(startOfUtcDay(now), -m),
      createdAt: now,
    });
  }

  for (const account of accounts.filter((item) => item.kind === 'savings')) {
    for (let m = LIMITS.monthsPerYear; m > 0; m -= LIMITS.balanceCheckEveryMonths) {
      plan.balanceChecks.push({
        id: crypto.randomUUID(),
        userId,
        accountId: account.id,
        checkedAt: addMonths(now, -m),
        balance: money(between(rng, account.balance[0], account.balance[1])),
        source: 'manual',
        createdAt: now,
      });
    }
  }

  const yearId = crypto.randomUUID();
  const budgetStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - LIMITS.budgetLeadMonths, 1),
  );
  plan.budgetYears.push({
    id: yearId,
    userId,
    name: `${budgetStart.getUTCFullYear()} plan`,
    startDate: budgetStart,
    endDate: addMonths(budgetStart, LIMITS.budgetSpanMonths),
    createdAt: budgetStart,
  });
  const lines: Array<Omit<typeof budgetLines.$inferInsert, 'id' | 'budgetYearId' | 'position'>> = [
    {
      name: 'Rent',
      rule: { categories: ['Rent'], statementKinds: ['expense'] },
      allocationKind: 'monthly',
      allocationAmount: rent,
      discretionary: false,
    },
    {
      name: 'Bills',
      rule: { categories: ['Bills'], statementKinds: ['expense'] },
      allocationKind: 'monthly',
      allocationAmount: '2500',
      discretionary: false,
    },
    { name: 'EMIs', rule: { tags: ['EMI'] }, allocationKind: 'schedule' },
    {
      name: 'Travel',
      rule: { tags: ['Trip'] },
      allocationKind: 'annual',
      allocationAmount: '60000',
    },
    { name: 'Gifts', rule: { tags: ['Gift'] }, allocationKind: 'earmarked' },
    {
      name: 'Shopping',
      rule: { categories: ['Shopping'], statementKinds: ['expense'] },
      allocationKind: 'annual',
      allocationAmount: '60000',
    },
    {
      name: 'Living',
      rule: { statementKinds: ['expense'] },
      allocationKind: 'monthly',
      allocationAmount: '15000',
    },
    {
      name: 'Investment',
      rule: { categories: ['Investment'] },
      allocationKind: 'residual',
      allocationAmount: '300000',
    },
  ];
  lines.forEach((line, position) => {
    plan.budgetLines.push({
      ...line,
      id: crypto.randomUUID(),
      budgetYearId: yearId,
      position,
      createdAt: budgetStart,
    });
  });
  plan.budgetIncomeLines.push({
    id: crypto.randomUUID(),
    budgetYearId: yearId,
    name: 'Salary',
    position: 0,
    rule: { categories: ['Salary'], statementKinds: ['outside_transaction'] },
    destination: 'waterfall',
    createdAt: budgetStart,
  });

  return { email, cookie: signedCookie(token) };
};

const TABLE_ORDER = [
  ['users', user],
  ['sessions', session],
  ['accounts', bankAccount],
  ['cards', creditCardAccounts],
  ['friends', friendsProfiles],
  ['recurring', recurringPayments],
  ['emis', emis],
  ['statements', statements],
  ['splits', splits],
  ['transfers', selfTransferStatements],
  ['investments', investments],
  ['sms', smsNotifications],
  ['boundaries', reportBoundaries],
  ['budgetYears', budgetYears],
  ['budgetLines', budgetLines],
  ['budgetIncomeLines', budgetIncomeLines],
  ['balanceChecks', accountBalanceChecks],
] as const;

const USERS_PER_FLUSH = 10;

const main = async () => {
  if (CONFIG.databaseUrl === '' || CONFIG.secret === '') {
    throw new Error('DATABASE_URL and BETTER_AUTH_SECRET are required');
  }
  const pool = new Pool({ connectionString: CONFIG.databaseUrl, max: 2 });
  const db = drizzle({ client: pool });
  const now = new Date();
  const out: Array<{ k: number; email: string; cookie: string }> = [];
  const totals = new Map<string, number>();
  const started = Date.now();
  let plan = emptyPlan();

  const flush = async () => {
    for (const [key, table] of TABLE_ORDER) {
      const rows = plan[key] as Array<(typeof table)['$inferInsert']>;
      totals.set(key, (totals.get(key) ?? 0) + rows.length);
      await insertBatched(db, table, rows);
    }
    plan = emptyPlan();
  };

  for (let index = 1; index <= CONFIG.users; index++) {
    out.push({ k: index, ...planUser(index, now, plan) });
    if (index % USERS_PER_FLUSH === 0 || index === CONFIG.users) {
      await flush();
      process.stdout.write(`seeded ${index}/${CONFIG.users} users\n`);
    }
  }

  await db.execute(sql`vacuum analyze`);
  await pool.end();
  writeFileSync(CONFIG.out, JSON.stringify(out));
  const seconds = Math.round((Date.now() - started) / 1_000);
  process.stdout.write(`${JSON.stringify(Object.fromEntries(totals))}\nseeded in ${seconds}s\n`);
};

await main();

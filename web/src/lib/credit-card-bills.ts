import { getDaysInMonth } from 'date-fns';
import { fromZonedTime, toZonedTime } from 'date-fns-tz';

export type CreditCardActivity = {
  accountId: string;
  createdAt: Date;
  balanceDelta: number;
};

type CreditCardBillingInput = {
  id: string;
  accountId: string;
  billingDate: number;
  startingBalance: number;
};

export type GeneratedCreditCardBill = {
  generatedAt: Date;
  generatedAmount: number;
  remainingAmount: number;
};

const LAST_HOUR_OF_DAY = 23;
const LAST_MINUTE_OF_HOUR = 59;
const LAST_SECOND_OF_MINUTE = 59;
const LAST_MILLISECOND_OF_SECOND = 999;

export const getStatementBalanceDelta = (
  statementKind: 'expense' | 'outside_transaction' | 'friend_transaction' | 'self_transfer',
  amount: number,
) => (statementKind === 'expense' ? -amount : amount);

const getBillingDayEnd = (billingDate: number, now: Date, timezone: string) => {
  const localNow = toZonedTime(now, timezone);
  const day = Math.min(
    billingDate,
    getDaysInMonth(new Date(localNow.getFullYear(), localNow.getMonth(), 1)),
  );
  const localBillingDayEnd = new Date(
    localNow.getFullYear(),
    localNow.getMonth(),
    day,
    LAST_HOUR_OF_DAY,
    LAST_MINUTE_OF_HOUR,
    LAST_SECOND_OF_MINUTE,
    LAST_MILLISECOND_OF_SECOND,
  );
  return fromZonedTime(localBillingDayEnd, timezone);
};

export const calculateGeneratedCreditCardBills = (
  cards: CreditCardBillingInput[],
  activities: CreditCardActivity[],
  now: Date,
  timezone: string,
): Partial<Record<string, GeneratedCreditCardBill>> => {
  const bills: Partial<Record<string, GeneratedCreditCardBill>> = {};

  for (const card of cards) {
    const generatedAt = getBillingDayEnd(card.billingDate, now, timezone);
    if (generatedAt >= now) {
      continue;
    }

    const cardActivities = activities.filter((activity) => activity.accountId === card.accountId);
    const balanceAtGeneration = cardActivities
      .filter((activity) => activity.createdAt <= generatedAt)
      .reduce((balance, activity) => balance + activity.balanceDelta, card.startingBalance);
    const generatedAmount = Math.max(-balanceAtGeneration, 0);
    const creditsAfterGeneration = cardActivities
      .filter((activity) => activity.createdAt > generatedAt && activity.balanceDelta > 0)
      .reduce((total, activity) => total + activity.balanceDelta, 0);

    bills[card.id] = {
      generatedAt,
      generatedAmount,
      remainingAmount: Math.max(generatedAmount - creditsAfterGeneration, 0),
    };
  }

  return bills;
};

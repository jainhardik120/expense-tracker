import { endOfMonth, getDaysInMonth } from 'date-fns';
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

const LAST_HOUR_OF_DAY = 23;
const LAST_MINUTE_OF_HOUR = 59;
const LAST_SECOND_OF_MINUTE = 59;
const LAST_MILLISECOND_OF_SECOND = 999;
const PAISE_PER_RUPEE = 100;

const roundToPaise = (amount: number) => Math.round(amount * PAISE_PER_RUPEE) / PAISE_PER_RUPEE;

export const getStatementBalanceDelta = (
  statementKind: 'expense' | 'outside_transaction' | 'friend_transaction' | 'self_transfer',
  amount: number,
) => (statementKind === 'expense' ? -amount : amount);

export type PeriodCardBill = {
  cardId: string;
  accountId: string;
  cardName: string;
  dueDate: Date;
  billedAmount: number;
  remainingAmount: number;
  status: 'paid' | 'missed' | 'upcoming';
};

type PeriodCardBillingInput = CreditCardBillingInput & { cardName: string };

const getBillingDayEndForMonth = (
  billingDate: number,
  year: number,
  monthIndex: number,
  timezone: string,
) => {
  const day = Math.min(billingDate, getDaysInMonth(new Date(year, monthIndex, 1)));
  return fromZonedTime(
    new Date(
      year,
      monthIndex,
      day,
      LAST_HOUR_OF_DAY,
      LAST_MINUTE_OF_HOUR,
      LAST_SECOND_OF_MINUTE,
      LAST_MILLISECOND_OF_SECOND,
    ),
    timezone,
  );
};

export const getCardBillsInRange = (
  cards: PeriodCardBillingInput[],
  activities: CreditCardActivity[],
  rangeStart: Date,
  rangeEnd: Date,
  now: Date,
  timezone: string,
): PeriodCardBill[] => {
  const bills: PeriodCardBill[] = [];
  const localStart = toZonedTime(rangeStart, timezone);
  const localEnd = toZonedTime(rangeEnd, timezone);
  const localNow = toZonedTime(now, timezone);
  const billHorizon = endOfMonth(new Date(localNow.getFullYear(), localNow.getMonth() + 1, 1));

  for (const card of cards) {
    const cardActivities = activities.filter((activity) => activity.accountId === card.accountId);
    const cursor = new Date(localStart.getFullYear(), localStart.getMonth(), 1);
    const lastMonth = new Date(localEnd.getFullYear(), localEnd.getMonth(), 1);

    while (cursor <= lastMonth) {
      const dueDate = getBillingDayEndForMonth(
        card.billingDate,
        cursor.getFullYear(),
        cursor.getMonth(),
        timezone,
      );
      cursor.setMonth(cursor.getMonth() + 1);

      if (dueDate < rangeStart || dueDate > rangeEnd) {
        continue;
      }

      if (toZonedTime(dueDate, timezone) > billHorizon) {
        break;
      }

      if (dueDate >= now) {
        const utilisation = cardActivities
          .filter((activity) => activity.createdAt <= now)
          .reduce((balance, activity) => balance + activity.balanceDelta, card.startingBalance);
        const estimate = roundToPaise(Math.max(-utilisation, 0));
        bills.push({
          cardId: card.id,
          accountId: card.accountId,
          cardName: card.cardName,
          dueDate,
          billedAmount: estimate,
          remainingAmount: estimate,
          status: 'upcoming',
        });
        continue;
      }

      const balanceAtGeneration = cardActivities
        .filter((activity) => activity.createdAt <= dueDate)
        .reduce((balance, activity) => balance + activity.balanceDelta, card.startingBalance);
      const billedAmount = roundToPaise(Math.max(-balanceAtGeneration, 0));
      if (billedAmount <= 0) {
        continue;
      }
      const creditsAfterGeneration = cardActivities
        .filter((activity) => activity.createdAt > dueDate && activity.balanceDelta > 0)
        .reduce((total, activity) => total + activity.balanceDelta, 0);
      const remainingAmount = roundToPaise(Math.max(billedAmount - creditsAfterGeneration, 0));

      bills.push({
        cardId: card.id,
        accountId: card.accountId,
        cardName: card.cardName,
        dueDate,
        billedAmount,
        remainingAmount,
        status: remainingAmount <= 0 ? 'paid' : 'missed',
      });
    }
  }

  return bills;
};

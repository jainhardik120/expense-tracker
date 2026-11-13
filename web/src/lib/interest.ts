export type InterestPeriod = { start: string; end: string };

export type InterestRate = { effectiveFrom: string; annualRate: number };

export type InterestCredit = {
  statementId: string;
  creditedOn: string;
  amount: number;
  taxableAmount: number | null;
  period: InterestPeriod | null;
};

type InterestRowStatus = 'credited' | 'unconfirmed' | 'missing' | 'due' | 'current';

export type InterestRow = {
  key: string;
  status: InterestRowStatus;
  period: InterestPeriod;
  creditedOn: string | null;
  statementId: string | null;
  actual: number | null;
  taxableAmount: number | null;
  expected: number | null;
  accrued: number | null;
  averageBalance: number | null;
};

const DAY_MS = 86_400_000;
const DAYS_IN_YEAR = 365;
const PERCENT = 100;
const QUARTER_MONTHS = 3;
const MATCH_WINDOW_DAYS = 7;
const CREDIT_GRACE_DAYS = 15;
const MAX_PERIODS = 400;
const ISO_DAY_LENGTH = 10;

const toTime = (day: string) => Date.parse(`${day}T00:00:00Z`);

const fromTime = (time: number) => new Date(time).toISOString().slice(0, ISO_DAY_LENGTH);

const addDays = (day: string, days: number) => fromTime(toTime(day) + days * DAY_MS);

const daysBetween = (from: string, to: string) =>
  Math.round((toTime(to) - toTime(from)) / DAY_MS);

export const addMonths = (day: string, months: number) => {
  const date = new Date(toTime(day));
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return fromTime(Date.UTC(year, month, Math.min(date.getUTCDate(), lastDay)));
};

export const nextPeriod = (period: InterestPeriod): InterestPeriod => {
  const start = addDays(period.end, 1);
  return { start, end: addDays(addMonths(start, QUARTER_MONTHS), -1) };
};

const quarterBefore = (creditedOn: string): InterestPeriod => ({
  start: addMonths(creditedOn, -QUARTER_MONTHS),
  end: addDays(creditedOn, -1),
});

export const rateOn = (rates: InterestRate[], day: string): number | null => {
  let latest: InterestRate | null = null;
  for (const entry of rates) {
    if (
      entry.effectiveFrom <= day &&
      (latest === null || entry.effectiveFrom > latest.effectiveFrom)
    ) {
      latest = entry;
    }
  }
  return latest?.annualRate ?? null;
};

export type BalanceOn = (day: string) => number;

export const accrueInterest = (
  period: InterestPeriod,
  balanceOn: BalanceOn,
  rates: InterestRate[],
  exclude: { day: string; amount: number } | null = null,
): { interest: number; averageBalance: number } | null => {
  let interest = 0;
  let balanceSum = 0;
  let days = 0;
  for (let day = period.start; day <= period.end; day = addDays(day, 1)) {
    const rate = rateOn(rates, day);
    if (rate === null) {
      return null;
    }
    const excluded = exclude !== null && day >= exclude.day ? exclude.amount : 0;
    const balance = balanceOn(day) - excluded;
    interest += (Math.max(balance, 0) * rate) / PERCENT / DAYS_IN_YEAR;
    balanceSum += balance;
    days += 1;
  }
  return { interest, averageBalance: days === 0 ? 0 : balanceSum / days };
};

export const createBalanceLookup = (
  openingBalance: number,
  dailyNet: { day: string; amount: number }[],
): BalanceOn => {
  const sorted = dailyNet.toSorted((a, b) => a.day.localeCompare(b.day));
  const days: string[] = [];
  const balances: number[] = [];
  let running = openingBalance;
  for (const entry of sorted) {
    running += entry.amount;
    days.push(entry.day);
    balances.push(running);
  }
  return (day) => {
    let low = 0;
    let high = days.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if ((days[middle] ?? '') <= day) {
        found = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return found === -1 ? openingBalance : (balances[found] ?? openingBalance);
  };
};

export const previousPeriod = (period: InterestPeriod): InterestPeriod => ({
  start: addMonths(period.start, -QUARTER_MONTHS),
  end: addDays(period.start, -1),
});

const fitsCredit = (period: InterestPeriod | null, creditedOn: string): period is InterestPeriod =>
  period !== null &&
  period.end <= creditedOn &&
  daysBetween(period.end, creditedOn) <= CREDIT_GRACE_DAYS;

const suggestPeriods = (credits: InterestCredit[]) => {
  const ordered = credits.toSorted((a, b) => a.creditedOn.localeCompare(b.creditedOn));
  const result = new Map<string, InterestPeriod>();
  const firstConfirmed = ordered.findIndex((credit) => credit.period !== null);

  let earlier: InterestPeriod | null = ordered[firstConfirmed]?.period ?? null;
  for (const credit of ordered.slice(0, Math.max(firstConfirmed, 0)).toReversed()) {
    const candidate: InterestPeriod | null = earlier === null ? null : previousPeriod(earlier);
    const suggestion: InterestPeriod = fitsCredit(candidate, credit.creditedOn)
      ? candidate
      : quarterBefore(credit.creditedOn);
    result.set(credit.statementId, suggestion);
    earlier = suggestion;
  }

  let last: InterestPeriod | null = null;
  for (const credit of ordered.slice(Math.max(firstConfirmed, 0))) {
    if (credit.period !== null) {
      last = credit.period;
      continue;
    }
    const candidate: InterestPeriod | null = last === null ? null : nextPeriod(last);
    const suggestion: InterestPeriod = fitsCredit(candidate, credit.creditedOn)
      ? candidate
      : quarterBefore(credit.creditedOn);
    result.set(credit.statementId, suggestion);
    last = suggestion;
  }
  return result;
};

export const buildInterestRows = ({
  credits,
  rates,
  balanceOn,
  today,
}: {
  credits: InterestCredit[];
  rates: InterestRate[];
  balanceOn: BalanceOn;
  today: string;
}): InterestRow[] => {
  const suggestions = suggestPeriods(credits);
  const known = credits
    .map((credit) => ({
      credit,
      period:
        credit.period ?? suggestions.get(credit.statementId) ?? quarterBefore(credit.creditedOn),
    }))
    .toSorted((a, b) => a.period.start.localeCompare(b.period.start));

  const rows: InterestRow[] = known.map(({ credit, period }) => {
    const exclude =
      credit.creditedOn <= period.end ? { day: credit.creditedOn, amount: credit.amount } : null;
    const accrued = accrueInterest(period, balanceOn, rates, exclude);
    return {
      key: credit.statementId,
      status: credit.period === null ? 'unconfirmed' : 'credited',
      period,
      creditedOn: credit.creditedOn,
      statementId: credit.statementId,
      actual: credit.amount,
      taxableAmount: credit.taxableAmount,
      expected: accrued === null ? null : accrued.interest,
      accrued: null,
      averageBalance: accrued?.averageBalance ?? null,
    };
  });

  let cursor: InterestPeriod | null = known.at(0)?.period ?? null;
  const remaining = known.slice(1);
  for (let step = 0; cursor !== null && step < MAX_PERIODS; step += 1) {
    const next = nextPeriod(cursor);
    const matchIndex = remaining.findIndex(
      (entry) => Math.abs(daysBetween(entry.period.start, next.start)) <= MATCH_WINDOW_DAYS,
    );
    if (matchIndex !== -1) {
      cursor = remaining[matchIndex]?.period ?? next;
      remaining.splice(matchIndex, 1);
      continue;
    }
    if (next.start > today) {
      break;
    }
    if (next.end >= today) {
      const soFar = accrueInterest({ start: next.start, end: today }, balanceOn, rates);
      const rest =
        today >= next.end
          ? { interest: 0, averageBalance: 0 }
          : accrueInterest(
              { start: addDays(today, 1), end: next.end },
              () => balanceOn(today),
              rates,
            );
      rows.push({
        key: `current-${next.start}`,
        status: 'current',
        period: next,
        creditedOn: null,
        statementId: null,
        actual: null,
        taxableAmount: null,
        expected: soFar === null || rest === null ? null : soFar.interest + rest.interest,
        accrued: soFar?.interest ?? null,
        averageBalance: soFar?.averageBalance ?? null,
      });
      break;
    }
    const accrued = accrueInterest(next, balanceOn, rates);
    rows.push({
      key: `gap-${next.start}`,
      status: daysBetween(next.end, today) <= CREDIT_GRACE_DAYS ? 'due' : 'missing',
      period: next,
      creditedOn: null,
      statementId: null,
      actual: null,
      taxableAmount: null,
      expected: accrued === null ? null : accrued.interest,
      accrued: null,
      averageBalance: accrued?.averageBalance ?? null,
    });
    cursor = next;
  }

  return rows.toSorted((a, b) => b.period.start.localeCompare(a.period.start));
};
